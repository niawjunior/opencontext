#!/usr/bin/env node
/**
 * Background script that uses Claude Code CLI to analyze git changes
 * and submit updated module contexts via MCP.
 *
 * Spawned by update-context.ts in --smart mode. Runs detached so the
 * pre-push hook exits immediately while this continues in the background.
 *
 * Usage:
 *   node smart-context-update.js '<json-payload>'
 *
 * JSON payload: { projectPath, projectId, projectName, modules: [{id, name, type, path, currentContext}] }
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface ModuleInfo {
  id: string;
  name: string;
  type: string;
  path: string;
  currentContext: string;
}

interface Payload {
  projectPath: string;
  projectId: string;
  projectName: string;
  modules: ModuleInfo[];
}

const TIMEOUT_PER_MODULE = 120_000; // 2 minutes

function getLogDir(): string {
  const dir = path.join(os.homedir(), ".open-context", "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function log(logFile: string, msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
}

function findClaude(): string | null {
  try {
    const result = execFileSync("which", ["claude"], {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function hasMcpJson(projectPath: string): boolean {
  try {
    const content = fs.readFileSync(path.join(projectPath, ".mcp.json"), "utf-8");
    const config = JSON.parse(content);
    // Check for any server pointing to our MCP
    for (const server of Object.values(config?.mcpServers || {})) {
      const args = (server as { args?: string[] })?.args;
      if (args?.some((a: string) => a.includes("open-context") || a.includes("context-explorer"))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function getMcpServerName(projectPath: string): string {
  try {
    const content = fs.readFileSync(path.join(projectPath, ".mcp.json"), "utf-8");
    const config = JSON.parse(content);
    for (const [name, server] of Object.entries(config?.mcpServers || {})) {
      const args = (server as { args?: string[] })?.args;
      if (args?.some((a: string) => a.includes("open-context") || a.includes("context-explorer"))) {
        return name;
      }
    }
  } catch { /* ignore */ }
  return "open-context";
}

function getGitDiff(projectPath: string, modulePath: string): string {
  try {
    const paths = modulePath.split(",").map((p) => p.trim()).filter(Boolean);
    const diffArgs = ["diff", "HEAD~1", "HEAD", "--"];
    for (const p of paths) {
      diffArgs.push(p);
    }
    const diff = execFileSync("git", diffArgs, {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return diff.slice(0, 50_000); // Cap at 50KB
  } catch {
    return "";
  }
}

function buildPrompt(mod: ModuleInfo, diff: string, projectId: string, projectName: string, mcpServerName: string): string {
  const toolName = `mcp__${mcpServerName}__update_module_context`;
  return `You are a code context analyst. Your job is to decide whether a git diff warrants updating a module's context documentation, and if so, make a precise surgical update.

Module: "${mod.name}" (${mod.type}) at path: ${mod.path}
Project: "${projectName}" (ID: ${projectId})

## Step 1: Assess significance

Look at the diff below and determine if it contains changes that affect the module's **behavior, API, architecture, data flow, or public interface**.

Changes that are NOT significant (do NOT update):
- Formatting, whitespace, or style-only changes
- Internal variable renames that don't affect behavior
- Comment-only changes
- Import reordering without new dependencies
- Typo fixes in strings or comments
- Minor refactors that preserve the same behavior and API

Changes that ARE significant (DO update):
- New or removed functions, components, hooks, types, or exports
- Changed function signatures, props, or return types
- New features, behaviors, or user-facing functionality
- Architectural changes (new patterns, changed data flow)
- Changed dependencies that affect the module's capabilities
- Bug fixes that change documented behavior

If the changes are NOT significant, respond with exactly: "SKIP: <brief reason>"
Do NOT call any tools if skipping.

## Step 2: If significant, update the context

Current context documentation:
\`\`\`markdown
${mod.currentContext}
\`\`\`

Git diff:
\`\`\`diff
${diff}
\`\`\`

Rules for updating:
1. Start with the EXACT current context as your base
2. Make MINIMAL, TARGETED edits — only change sentences/bullets directly affected by the diff
3. PRESERVE all headings, sections, tables, and formatting exactly as they are
4. DO NOT rewrite, reorganize, or rephrase unaffected content
5. DO NOT add new sections unless the diff introduces entirely new functionality
6. DO NOT remove sections unless the diff removes the corresponding functionality
7. Output must be the COMPLETE updated markdown

Call the ${toolName} tool with:
- projectId: "${projectId}"
- moduleId: "${mod.id}"
- context: <the complete updated markdown>

You MUST either respond with "SKIP: <reason>" or call the tool. No other output.`;
}

async function main(): Promise<void> {
  const payloadArg = process.argv[2];
  if (!payloadArg) {
    console.error("[smart-update] No payload provided");
    process.exit(1);
  }

  let payload: Payload;
  try {
    payload = JSON.parse(payloadArg);
  } catch {
    console.error("[smart-update] Invalid JSON payload");
    process.exit(1);
  }

  const logFile = path.join(getLogDir(), `context-update-${Date.now()}.log`);
  log(logFile, `Starting smart context update for project: ${payload.projectName}`);
  log(logFile, `Modules to update: ${payload.modules.map((m) => m.name).join(", ")}`);

  const claudePath = findClaude();
  if (!claudePath) {
    log(logFile, "Claude CLI not found — aborting");
    process.exit(0);
  }
  log(logFile, `Claude CLI found: ${claudePath}`);

  if (!hasMcpJson(payload.projectPath)) {
    log(logFile, ".mcp.json not found or missing open-context config — aborting");
    process.exit(0);
  }

  const mcpServerName = getMcpServerName(payload.projectPath);
  log(logFile, `MCP server name: ${mcpServerName}`);

  for (const mod of payload.modules) {
    log(logFile, `\n--- Processing: ${mod.name} (${mod.type}) ---`);

    try {
      const diff = getGitDiff(payload.projectPath, mod.path);
      if (diff.trim().length === 0) {
        log(logFile, `No diff found for ${mod.name} — skipping`);
        continue;
      }

      log(logFile, `Diff size: ${diff.length} chars`);

      const prompt = buildPrompt(mod, diff, payload.projectId, payload.projectName, mcpServerName);

      log(logFile, `Running Claude Code for ${mod.name} (assess + update)...`);
      const allowedTools = [
        `mcp__${mcpServerName}__update_module_context`,
      ].join(",");

      const result = execFileSync(claudePath, [
        "-p", prompt,
        "--output-format", "text",
        "--allowedTools", allowedTools,
      ], {
        cwd: payload.projectPath,
        encoding: "utf-8",
        timeout: TIMEOUT_PER_MODULE,
        maxBuffer: 1024 * 1024,
        env: { ...process.env },
      });

      const output = result.trim();
      if (output.startsWith("SKIP:")) {
        log(logFile, `Claude decided to skip ${mod.name}: ${output}`);
      } else {
        log(logFile, `Claude output for ${mod.name}: ${output.slice(0, 500)}`);
        log(logFile, `Successfully processed: ${mod.name}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(logFile, `ERROR processing ${mod.name}: ${msg}`);
    }
  }

  log(logFile, "\nSmart context update complete.");
}

main().catch((err) => {
  console.error("[smart-update] Fatal:", err.message || err);
  process.exit(1);
});

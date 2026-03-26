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

import { execFileSync, execSync } from "node:child_process";
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
    return !!config?.mcpServers?.["open-context"];
  } catch {
    return false;
  }
}

function getGitDiff(projectPath: string, modulePath: string): string {
  try {
    // Get diff for the module's path (directory or file)
    const paths = modulePath.split(",").map((p) => p.trim()).filter(Boolean);
    const diffArgs = ["diff", "HEAD~1", "HEAD", "--"];
    for (const p of paths) {
      diffArgs.push(p);
    }
    const diff = execFileSync("git", diffArgs, {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return diff.slice(0, 50_000); // Cap at 50KB to avoid huge prompts
  } catch {
    return "(no diff available)";
  }
}

function buildPrompt(mod: ModuleInfo, diff: string, projectId: string, projectName: string): string {
  return `You are updating context documentation for a code module after recent changes.

Module: "${mod.name}" (${mod.type}) at path: ${mod.path}
Project: "${projectName}" (ID: ${projectId})

## Current context documentation:
${mod.currentContext}

## Recent code changes (git diff):
\`\`\`diff
${diff}
\`\`\`

## Instructions:
1. Analyze the git diff to understand what changed in this module.
2. Update the module's context documentation to reflect these changes.
3. Keep the same markdown structure and style as the current context.
4. Only modify sections that are affected by the changes.
5. If the diff is trivial (formatting, comments, whitespace), keep the context unchanged.
6. Use the update_module_context MCP tool to submit the updated context:
   - projectId: "${projectId}"
   - moduleId: "${mod.id}"
   - context: <your updated markdown>

IMPORTANT: You MUST call the update_module_context tool. Do not just output text.`;
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

  // Verify prerequisites
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

  // Process each module sequentially
  for (const mod of payload.modules) {
    log(logFile, `\n--- Processing: ${mod.name} (${mod.type}) ---`);

    try {
      const diff = getGitDiff(payload.projectPath, mod.path);
      if (diff === "(no diff available)" || diff.trim().length === 0) {
        log(logFile, `No diff found for ${mod.name} — skipping`);
        continue;
      }

      log(logFile, `Diff size: ${diff.length} chars`);

      const prompt = buildPrompt(mod, diff, payload.projectId, payload.projectName);

      log(logFile, `Running Claude Code for ${mod.name}...`);

      const allowedTools = [
        "mcp__open-context__update_module_context",
        "mcp__open-context__resolve_project",
        "mcp__open-context__get_module_context",
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

      log(logFile, `Claude output for ${mod.name}: ${result.slice(0, 500)}`);
      log(logFile, `Successfully processed: ${mod.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(logFile, `ERROR processing ${mod.name}: ${msg}`);
      // Continue with next module
    }
  }

  log(logFile, "\nSmart context update complete.");
}

main().catch((err) => {
  console.error("[smart-update] Fatal:", err.message || err);
  process.exit(1);
});

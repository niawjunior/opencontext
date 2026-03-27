import { ipcMain, app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import type { SupabaseStore } from "../store/supabase-store";
import type { SettingsStore } from "../store/settings-store";

// Remote MCP server URL
const REMOTE_MCP_URL = "https://open-context-mcp.vercel.app/mcp";

function getUpdateScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "dist-mcp", "cli", "update-context.js");
  }
  return path.join(__dirname, "..", "dist-mcp", "cli", "update-context.js");
}

export function registerMcpServerHandlers(
  dataDir: string,
  getStore?: () => SupabaseStore | null,
  settingsStore?: SettingsStore
): void {
  ipcMain.handle("mcp:get-config", async () => {
    const apiKey = settingsStore ? (await settingsStore.getSettings()).apiKey : "";
    const config: Record<string, unknown> = {
      type: "http",
      url: REMOTE_MCP_URL,
    };
    if (apiKey) {
      config.headers = { Authorization: `Bearer ${apiKey}` };
    }
    return {
      mcpServers: {
        "open-context": config,
      },
    };
  });

  ipcMain.handle(
    "mcp:setup-project",
    async (
      _e,
      projectId: string,
      options?: { mcpJson?: boolean; claudeMd?: boolean; huskyHook?: boolean }
    ) => {
      const store = getStore?.();
      if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
      const project = await store.getProject(projectId);
      if (!project) throw new Error("Project not found");

      const apiKey = settingsStore ? (await settingsStore.getSettings()).apiKey : "";
      const updateScriptPath = getUpdateScriptPath();
      const opts = { mcpJson: true, claudeMd: true, huskyHook: false, ...options };
      const filesWritten: string[] = [];

      // 1. Write .mcp.json with remote HTTP MCP config (URL only — no API key)
      // The API key should NOT be in the project .mcp.json because:
      //   - This file is meant to be committed to git (provides URL for all devs)
      //   - Each developer's API key lives in their ~/.claude.json (via `claude mcp add`)
      //   - The CLI merges: URL from project .mcp.json + key from ~/.claude.json
      if (opts.mcpJson) {
        const mcpConfig = {
          mcpServers: {
            "open-context": {
              type: "http",
              url: REMOTE_MCP_URL,
            },
          },
        };

        const mcpJsonPath = path.join(project.path, ".mcp.json");
        await fs.writeFile(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
        filesWritten.push(mcpJsonPath);
      }

      // 2. Write/update CLAUDE.md with context management instructions
      if (opts.claudeMd) {
        const claudeMdPath = path.join(project.path, "CLAUDE.md");
        const contextBlock = buildClaudeMdBlock();

        try {
          const existing = await fs.readFile(claudeMdPath, "utf-8");
          if (!existing.includes("Open Context")) {
            await fs.writeFile(claudeMdPath, existing + "\n" + contextBlock, "utf-8");
          }
        } catch {
          await fs.writeFile(claudeMdPath, contextBlock.trim() + "\n", "utf-8");
        }
        filesWritten.push(claudeMdPath);
      }

      // 3. Set up git pre-push hook (husky or native)
      if (opts.huskyHook) {
        // Copy the update script into the project so the hook is portable
        await copyUpdateScript(project.path, updateScriptPath);
        const hookRelPath = await setupHuskyHook(project.path);
        filesWritten.push(path.join(project.path, ".open-context", "update-context.js"));
        filesWritten.push(path.join(project.path, hookRelPath));
      }

      return {
        mcpJsonPath: path.join(project.path, ".mcp.json"),
        claudeMdPath: path.join(project.path, "CLAUDE.md"),
        filesWritten,
      };
    }
  );

  ipcMain.handle("mcp:setup-git-hook", async (_e, projectPath: string) => {
    const updateScriptPath = getUpdateScriptPath();
    await copyUpdateScript(projectPath, updateScriptPath);
    const hookRelPath = await setupHuskyHook(projectPath);
    return { hookPath: path.join(projectPath, hookRelPath) };
  });

  ipcMain.handle("mcp:check-project-setup", async (_e, projectPath: string): Promise<{
    configured: boolean;
    hasClaudeMd: boolean;
    hasHuskyHook: boolean;
  }> => {
    let configured = false;
    let hasClaudeMd = false;
    let hasHuskyHook = false;

    try {
      const mcpJsonPath = path.join(projectPath, ".mcp.json");
      const content = await fs.readFile(mcpJsonPath, "utf-8");
      const config = JSON.parse(content);
      configured = !!config?.mcpServers?.["open-context"];
    } catch { /* not configured */ }

    try {
      const claudeMd = await fs.readFile(path.join(projectPath, "CLAUDE.md"), "utf-8");
      hasClaudeMd = claudeMd.includes("Open Context");
    } catch { /* no CLAUDE.md */ }

    // Check both husky and native git hook locations
    for (const hookPath of [
      path.join(projectPath, ".husky", "pre-push"),
      path.join(projectPath, ".git", "hooks", "pre-push"),
    ]) {
      try {
        const hook = await fs.readFile(hookPath, "utf-8");
        if (hook.includes("context-update") || hook.includes("update-context")) {
          hasHuskyHook = true;
          break;
        }
      } catch { /* not found, try next */ }
    }

    return { configured, hasClaudeMd, hasHuskyHook };
  });
}

function buildClaudeMdBlock(): string {
  return `
## Project Context (Open Context) — IMPORTANT

This project uses **Open Context** for AI context management.

### REQUIRED: Update context after code changes
After you finish writing or modifying code, you MUST update the relevant module context:

1. Call \`resolve_project\` to get the project ID
2. Call \`list_modules\` to find which module(s) you changed
3. Call \`update_module_context\` with the updated context markdown for each affected module

This keeps the project documentation in sync. The context goes through a review flow —
the developer will see a diff and approve/reject your update in the Open Context app.

### How to access context
Use the MCP tools available to you:
- \`resolve_project\` — auto-detect this project from your cwd
- \`get_project_context\` — get the full context document
- \`list_modules\` — see all modules and their coverage status
- \`get_module_context\` — get detailed context for a specific module
- \`search_context\` — search across all context

### What triggers context updates
- **AI (you)**: Use \`update_module_context\` MCP tool after code changes (goes through approval)
- **Git hook**: Auto-marks affected modules as stale on push
- **Manual**: Developer clicks "Sync" on any module in Open Context
`;
}

/**
 * Copy the update-context.js script into the project's .open-context/ directory.
 * This makes the hook portable — every developer who clones the repo has the script.
 */
async function copyUpdateScript(
  projectPath: string,
  sourceScriptPath: string
): Promise<void> {
  const destDir = path.join(projectPath, ".open-context");
  await fs.mkdir(destDir, { recursive: true });

  // Copy the main update script
  const destPath = path.join(destDir, "update-context.js");
  await fs.copyFile(sourceScriptPath, destPath);

  // Also copy the smart-context-update script (sibling file)
  const smartSrc = path.join(path.dirname(sourceScriptPath), "smart-context-update.js");
  const smartDest = path.join(destDir, "smart-context-update.js");
  try {
    await fs.copyFile(smartSrc, smartDest);
  } catch {
    // Smart update script may not exist in all builds
  }
}

const HOOK_BODY = `# Open Context: smart context update on push
# Uses Claude Code to analyze changes and update module contexts in the background
# The update script auto-detects settings path per platform (macOS/Windows/Linux)
CHANGED_FILES=$(git diff --name-only @{push}.. 2>/dev/null || git diff --name-only HEAD~1 HEAD 2>/dev/null || echo "")
if [ -n "$CHANGED_FILES" ]; then
  echo "[open-context] Detecting affected modules..."
  node ".open-context/update-context.js" --smart --changed-files $CHANGED_FILES 2>&1 | grep "^\\[context-update\\]" || true
fi
`;

/**
 * Detect how git hooks are configured for this project.
 * Returns the directory where pre-push should be written.
 *
 * Priority:
 * 1. If husky is installed (core.hooksPath points to .husky), write to .husky/pre-push
 * 2. Otherwise, write to .git/hooks/pre-push (native git hooks)
 */
async function resolveHookDir(projectPath: string): Promise<{ hookDir: string; isHusky: boolean }> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);

  try {
    const { stdout } = await exec("git", ["config", "core.hooksPath"], { cwd: projectPath });
    const hooksPath = stdout.trim();
    if (hooksPath && hooksPath.includes(".husky")) {
      // Husky is installed — write the user-facing hook in .husky/ (not .husky/_)
      return { hookDir: path.join(projectPath, ".husky"), isHusky: true };
    }
  } catch {
    // core.hooksPath not set — use native git hooks
  }

  return { hookDir: path.join(projectPath, ".git", "hooks"), isHusky: false };
}

async function setupHuskyHook(projectPath: string): Promise<string> {
  const { hookDir, isHusky } = await resolveHookDir(projectPath);
  await fs.mkdir(hookDir, { recursive: true });

  const hookPath = path.join(hookDir, "pre-push");

  try {
    const existing = await fs.readFile(hookPath, "utf-8");
    if (!existing.includes("context-update") && !existing.includes("update-context")) {
      // Append our hook body (skip the first comment line to avoid double headers)
      await fs.writeFile(hookPath, existing + "\n" + HOOK_BODY.split("\n").slice(1).join("\n"), "utf-8");
    }
  } catch {
    await fs.writeFile(hookPath, HOOK_BODY, "utf-8");
  }

  await fs.chmod(hookPath, 0o755);

  return isHusky ? ".husky/pre-push" : ".git/hooks/pre-push";
}

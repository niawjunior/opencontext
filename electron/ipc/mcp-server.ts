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

      // 1. Write .mcp.json with remote HTTP MCP config + auth
      if (opts.mcpJson) {
        const serverConfig: Record<string, unknown> = {
          type: "http",
          url: REMOTE_MCP_URL,
        };
        if (apiKey) {
          serverConfig.headers = { Authorization: `Bearer ${apiKey}` };
        }
        const mcpConfig = {
          mcpServers: {
            "open-context": serverConfig,
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

      // 3. Set up husky pre-push hook
      if (opts.huskyHook) {
        // Copy the update script into the project so the hook is portable
        await copyUpdateScript(project.path, updateScriptPath);
        await setupHuskyHook(project.path);
        filesWritten.push(path.join(project.path, ".open-context", "update-context.js"));
        filesWritten.push(path.join(project.path, ".husky", "pre-push"));
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
    await setupHuskyHook(projectPath);
    return { hookPath: path.join(projectPath, ".husky", "pre-push") };
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

    try {
      const hook = await fs.readFile(path.join(projectPath, ".husky", "pre-push"), "utf-8");
      hasHuskyHook = hook.includes("context-update") || hook.includes("update-context");
    } catch { /* no hook */ }

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

async function setupHuskyHook(projectPath: string): Promise<void> {
  const huskyDir = path.join(projectPath, ".husky");
  await fs.mkdir(huskyDir, { recursive: true });

  const hookPath = path.join(huskyDir, "pre-push");
  const hookContent = `# Open Context: smart context update on push
# Uses Claude Code to analyze changes and update module contexts in the background
# The update script auto-detects settings path per platform (macOS/Windows/Linux)
CHANGED_FILES=$(git diff --name-only @{push}.. 2>/dev/null || git diff --name-only HEAD~1 HEAD 2>/dev/null || echo "")
if [ -n "$CHANGED_FILES" ]; then
  echo "[open-context] Detecting affected modules..."
  node ".open-context/update-context.js" --smart --changed-files $CHANGED_FILES 2>&1 | grep "^\\[context-update\\]" || true
fi
`;

  try {
    const existing = await fs.readFile(hookPath, "utf-8");
    if (!existing.includes("context-update") && !existing.includes("update-context")) {
      await fs.writeFile(hookPath, existing + "\n" + hookContent.split("\n").slice(1).join("\n"), "utf-8");
    }
  } catch {
    await fs.writeFile(hookPath, hookContent, "utf-8");
  }

  await fs.chmod(hookPath, 0o755);
}

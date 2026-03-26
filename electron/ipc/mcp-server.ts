import { ipcMain, app } from "electron";
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import type { DataStore } from "../store/data-store";

let mcpProcess: ChildProcess | null = null;

function getMcpScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "dist-mcp", "mcp-server", "index.js");
  }
  // esbuild bundles everything into dist-electron/ (flat), so __dirname is dist-electron/
  return path.join(__dirname, "..", "dist-mcp", "mcp-server", "index.js");
}

export function registerMcpServerHandlers(dataDir: string, store?: DataStore): void {
  ipcMain.handle("mcp:start", () => {
    if (mcpProcess && !mcpProcess.killed) {
      return { status: "already_running", pid: mcpProcess.pid };
    }

    const scriptPath = getMcpScriptPath();

    mcpProcess = spawn("node", [scriptPath], {
      env: { ...process.env, OPEN_CONTEXT_DATA_DIR: dataDir },
      stdio: ["pipe", "pipe", "pipe"],
    });

    mcpProcess.stderr?.on("data", (data: Buffer) => {
      console.log("[mcp-server]", data.toString().trim());
    });

    mcpProcess.on("exit", (code) => {
      console.log(`[mcp-server] exited with code ${code}`);
      mcpProcess = null;
    });

    return { status: "started", pid: mcpProcess.pid };
  });

  ipcMain.handle("mcp:stop", () => {
    if (!mcpProcess || mcpProcess.killed) {
      return { status: "not_running" };
    }
    mcpProcess.kill();
    mcpProcess = null;
    return { status: "stopped" };
  });

  ipcMain.handle("mcp:status", () => ({
    running: mcpProcess !== null && !mcpProcess.killed,
    pid: mcpProcess?.pid ?? null,
  }));

  ipcMain.handle("mcp:get-config", () => {
    const scriptPath = getMcpScriptPath();

    return {
      mcpServers: {
        "open-context": {
          command: "node",
          args: [scriptPath],
          env: {
            OPEN_CONTEXT_DATA_DIR: dataDir,
          },
        },
      },
    };
  });

  function getUpdateScriptPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "dist-mcp", "mcp-server", "update-context.js");
    }
    return path.join(__dirname, "..", "dist-mcp", "mcp-server", "update-context.js");
  }

  ipcMain.handle(
    "mcp:setup-project",
    async (
      _e,
      projectId: string,
      options?: { mcpJson?: boolean; claudeMd?: boolean; huskyHook?: boolean }
    ) => {
      if (!store) throw new Error("Store not available");
      const project = await store.getProject(projectId);
      if (!project) throw new Error("Project not found");

      const scriptPath = getMcpScriptPath();
      const updateScriptPath = getUpdateScriptPath();
      const opts = { mcpJson: true, claudeMd: true, huskyHook: false, ...options };
      const filesWritten: string[] = [];

      // 1. Write .mcp.json
      if (opts.mcpJson) {
        const mcpConfig = {
          mcpServers: {
            "open-context": {
              command: "node",
              args: [scriptPath],
              env: {
                OPEN_CONTEXT_DATA_DIR: dataDir,
              },
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
        const contextBlock = buildClaudeMdBlock(updateScriptPath, dataDir);

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
        await setupHuskyHook(project.path, updateScriptPath, dataDir);
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
    await setupHuskyHook(projectPath, updateScriptPath, dataDir);
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

function buildClaudeMdBlock(updateScriptPath: string, dataDir: string): string {
  return `
## Project Context (Open Context)

This project uses **Open Context** for AI context management. Module-level documentation
is maintained in Open Context and served via MCP.

### How to access context
Use the MCP tools available to you:
- \`resolve_project\` — auto-detect this project from your cwd
- \`get_project_context\` — get the full context document
- \`list_modules\` — see all modules and their coverage status
- \`get_module_context\` — get detailed context for a specific module
- \`search_context\` — search across all context

### When to update context
After making **significant code changes** (new features, refactored modules, changed APIs),
update the relevant module context using the \`update_module_context\` MCP tool:

\`\`\`
update_module_context({
  projectId: "<resolved-project-id>",
  modulePath: "path/to/changed/module",
  context: "Updated markdown describing what this module does..."
})
\`\`\`

Or rebuild the full context document:
\`\`\`bash
OPEN_CONTEXT_DATA_DIR="${dataDir}" node "${updateScriptPath}" --regenerate-all
\`\`\`

### What triggers context updates
- **Manual**: Click "Sync" on any module in Open Context
- **Claude Code**: Use \`update_module_context\` MCP tool after code changes
- **Git hook**: On push, uses Claude Code to analyze changes and submit updated contexts (background)
- **CLI**: \`node "${updateScriptPath}" --smart --changed-files <files>\`
`;
}

async function setupHuskyHook(
  projectPath: string,
  updateScriptPath: string,
  dataDir: string
): Promise<void> {
  const huskyDir = path.join(projectPath, ".husky");

  // Create .husky directory if it doesn't exist
  await fs.mkdir(huskyDir, { recursive: true });

  const hookPath = path.join(huskyDir, "pre-push");
  const hookContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh" 2>/dev/null || true

# Open Context: smart context update on push
# Uses Claude Code to analyze changes and update module contexts in the background
CHANGED_FILES=$(git diff --name-only @{push}.. 2>/dev/null || git diff --name-only HEAD~1 HEAD 2>/dev/null || echo "")
if [ -n "$CHANGED_FILES" ]; then
  echo "[open-context] Detecting affected modules..."
  OPEN_CONTEXT_DATA_DIR="${dataDir}" node "${updateScriptPath}" --smart --changed-files $CHANGED_FILES 2>&1 | grep "^\\[context-update\\]" || true
fi
`;

  try {
    // Check if hook already exists
    const existing = await fs.readFile(hookPath, "utf-8");
    if (!existing.includes("context-update") && !existing.includes("update-context")) {
      // Append to existing hook
      await fs.writeFile(hookPath, existing + "\n" + hookContent.split("\n").slice(3).join("\n"), "utf-8");
    }
  } catch {
    // No existing hook — create new one
    await fs.writeFile(hookPath, hookContent, "utf-8");
  }

  // Make executable
  await fs.chmod(hookPath, 0o755);
}


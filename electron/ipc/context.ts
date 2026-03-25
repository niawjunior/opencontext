import { ipcMain } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { DataStore } from "../store/data-store";

export function registerContextHandlers(
  store: DataStore,
  _getMainWindow?: unknown
): void {
  ipcMain.handle("context:get-full", (_e, projectId: string) =>
    store.getFullContext(projectId)
  );

  ipcMain.handle(
    "context:save-full",
    (_e, projectId: string, content: string) =>
      store.saveFullContext(projectId, content)
  );

  ipcMain.handle(
    "context:search",
    (_e, query: string, projectId?: string) =>
      store.searchContexts(query, projectId)
  );

  // Helper to run Claude CLI analysis
  function runClaudeAnalysis(
    claudePath: string,
    projectPath: string,
    modulePath: string,
    moduleType: string
  ): Promise<string> {
    const prompt = `Analyze the file or directory at "${modulePath}" in this project and generate a concise context document for it.

This is a "${moduleType}" module. Write a description that helps an AI coding assistant understand:

1. **Purpose**: What this module does and why it exists
2. **Key exports**: Main functions, components, classes, or types it exposes
3. **Dependencies**: What it depends on and what depends on it
4. **Interfaces**: Key props, parameters, return types
5. **Usage patterns**: How to use this module correctly
6. **Important notes**: Edge cases, conventions, or gotchas

Format as clean markdown. Be thorough but concise. Focus on what's most useful for an AI assistant working with this code.`;

    return new Promise<string>((resolve, reject) => {
      const child = spawn(claudePath, ["-p", prompt, "--output-format", "text"], {
        cwd: projectPath,
        env: { ...process.env },
      });

      let output = "";
      let error = "";

      child.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        error += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          reject(
            new Error(
              `Analysis failed (exit code ${code}): ${error || "No output"}`
            )
          );
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
      });
    });
  }

  ipcMain.handle(
    "context:analyze-module",
    async (_e, projectPath: string, modulePath: string, moduleType: string) => {
      const settings = await store.getSettings();
      const claudePath = settings.claudeCliPath || "claude";
      return runClaudeAnalysis(claudePath, projectPath, modulePath, moduleType);
    }
  );

  ipcMain.handle(
    "context:resync-module",
    async (_e, projectPath: string, modulePath: string, moduleType: string) => {
      const settings = await store.getSettings();
      const claudePath = settings.claudeCliPath || "claude";
      const newContext = await runClaudeAnalysis(claudePath, projectPath, modulePath, moduleType);
      return { newContext };
    }
  );

  ipcMain.handle("context:generate", async (_e, projectId: string) => {
    const project = await store.getProject(projectId);
    if (!project) throw new Error("Project not found");

    // Group modules by type
    const grouped = new Map<string, typeof project.modules>();
    for (const mod of project.modules) {
      const group = grouped.get(mod.type) || [];
      group.push(mod);
      grouped.set(mod.type, group);
    }

    const typeLabels: Record<string, string> = {
      page: "Pages",
      component: "Components",
      module: "Modules",
      api: "APIs",
      hook: "Hooks",
      util: "Utilities",
      config: "Configuration",
    };

    // Build the document from a template
    const sections: string[] = [];

    // Header
    sections.push(`# ${project.name}`);
    if (project.description) {
      sections.push(`> ${project.description}`);
    }
    sections.push(`**Path:** ${project.path}`);
    sections.push(`**Modules:** ${project.modules.length}`);

    // Module sections grouped by type
    if (project.modules.length > 0) {
      sections.push("## Modules");

      for (const [type, mods] of grouped.entries()) {
        const label = typeLabels[type] || type;
        sections.push(`### ${label}`);

        for (const mod of mods) {
          sections.push(`#### ${mod.name}`);
          if (mod.path) {
            sections.push(`**Path:** \`${mod.path}\``);
          }
          if (mod.context?.trim()) {
            sections.push(mod.context.trim());
          } else {
            sections.push("*No context documented yet.*");
          }
        }
      }
    }

    const content = sections.join("\n\n");
    const doc = await store.saveFullContext(projectId, content);
    return { success: true, document: doc };
  });

  ipcMain.handle("context:export-to-project", async (_e, projectId: string) => {
    const project = await store.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const doc = await store.getFullContext(projectId);
    const content = doc?.fullContext || "";
    if (!content.trim()) throw new Error("No context to export. Build context first.");
    const outputPath = path.join(project.path, "llms.txt");
    await fs.writeFile(outputPath, content, "utf-8");
    return { path: outputPath };
  });
}

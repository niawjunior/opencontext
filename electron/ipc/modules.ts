import { ipcMain } from "electron";
import type { DataStore } from "../store/data-store";
import type { ModuleType } from "../store/types";

export function registerModuleHandlers(store: DataStore): void {
  ipcMain.handle(
    "modules:add",
    (
      _e,
      projectId: string,
      data: { name: string; type: ModuleType; path: string; context: string }
    ) => store.addModule(projectId, data)
  );

  ipcMain.handle(
    "modules:update",
    async (
      _e,
      projectId: string,
      moduleId: string,
      data: Partial<{
        name: string;
        type: ModuleType;
        path: string;
        context: string;
        lastAnalyzedAt: string;
        pendingContextMeta: { updatedAt: string; source?: string; previousPendingAt?: string } | undefined;
      }>
    ) => {
      const result = await store.updateModule(projectId, moduleId, data);

      // Auto-rebuild full context when module context changes
      if (data.context !== undefined) {
        const settings = await store.getSettings();
        if (settings.autoRebuildContext) {
          try {
            const project = await store.getProject(projectId);
            if (project) {
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

              const sections: string[] = [];
              sections.push(`# ${project.name}`);
              if (project.description) sections.push(`> ${project.description}`);
              sections.push(`**Path:** ${project.path}`);
              sections.push(`**Modules:** ${project.modules.length}`);

              if (project.modules.length > 0) {
                sections.push("## Modules");
                for (const [type, mods] of grouped.entries()) {
                  sections.push(`### ${typeLabels[type] || type}`);
                  for (const mod of mods) {
                    sections.push(`#### ${mod.name}`);
                    if (mod.path) sections.push(`**Path:** \`${mod.path}\``);
                    sections.push(mod.context?.trim() || "*No context documented yet.*");
                  }
                }
              }

              await store.saveFullContext(projectId, sections.join("\n\n"));
            }
          } catch {
            // Auto-rebuild is best-effort
          }
        }
      }

      return result;
    }
  );

  ipcMain.handle(
    "modules:delete",
    (_e, projectId: string, moduleId: string) =>
      store.deleteModule(projectId, moduleId)
  );

  // Approve pending context — moves pendingContext → context
  ipcMain.handle(
    "modules:approve-pending",
    async (_e, projectId: string, moduleId: string) => {
      const project = await store.getProject(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      const mod = project.modules.find((m) => m.id === moduleId);
      if (!mod) throw new Error(`Module ${moduleId} not found`);
      if (!mod.pendingContext) throw new Error("No pending context to approve");

      return store.updateModule(projectId, moduleId, {
        context: mod.pendingContext,
        pendingContext: "",
        pendingContextMeta: undefined,
        lastAnalyzedAt: new Date().toISOString(),
      });
    }
  );

  // Reject pending context — clears pendingContext
  ipcMain.handle(
    "modules:reject-pending",
    async (_e, projectId: string, moduleId: string) => {
      return store.updateModule(projectId, moduleId, {
        pendingContext: "",
        pendingContextMeta: undefined,
      });
    }
  );
}

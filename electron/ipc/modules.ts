import { ipcMain } from "electron";
import type { SupabaseStore } from "../store/supabase-store";
import type { SettingsStore } from "../store/settings-store";
import type { ModuleType } from "../store/types";
import { GitService } from "../git/git-service";
import { resolveSourceFiles } from "../git/resolve-source-files";

export function registerModuleHandlers(
  getStore: () => SupabaseStore | null,
  settingsStore: SettingsStore
): void {
  ipcMain.handle(
    "modules:add",
    (
      _e,
      projectId: string,
      data: { name: string; type: ModuleType; path: string; context: string }
    ) => {
      const store = getStore();
      if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
      return store.addModule(projectId, data);
    }
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
        staleness: { status: "fresh" | "stale" | "outdated" | "unknown"; commitsBehind: number; lastCheckedAt: string };
      }>
    ) => {
      const store = getStore();
      if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
      const result = await store.updateModule(projectId, moduleId, data);

      // Auto-rebuild full context when module context changes
      if (data.context !== undefined) {
        const settings = await settingsStore.getSettings();
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
    (_e, projectId: string, moduleId: string) => {
      const store = getStore();
      if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
      return store.deleteModule(projectId, moduleId);
    }
  );

  // Approve pending context — moves pendingContext → context
  ipcMain.handle(
    "modules:approve-pending",
    async (_e, projectId: string, moduleId: string) => {
      const store = getStore();
      if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
      const project = await store.getProject(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      const mod = project.modules.find((m) => m.id === moduleId);
      if (!mod) throw new Error(`Module ${moduleId} not found`);
      if (!mod.pendingContext) throw new Error("No pending context to approve");

      // Snapshot git state for staleness tracking
      let sourceFiles: string[] | undefined;
      let gitSnapshot: { commitSha: string; commitDate: string } | undefined;
      try {
        if (project.path && (await GitService.isGitRepo(project.path))) {
          sourceFiles = await resolveSourceFiles(project.path, mod.path);
          const commitSha = await GitService.getHeadSha(project.path);
          gitSnapshot = { commitSha, commitDate: new Date().toISOString() };
        }
      } catch {
        // Git snapshot is best-effort
      }

      return store.updateModule(projectId, moduleId, {
        context: mod.pendingContext,
        pendingContext: "",
        pendingContextMeta: undefined,
        lastAnalyzedAt: new Date().toISOString(),
        sourceFiles,
        gitSnapshot,
        staleness: {
          status: "fresh",
          commitsBehind: 0,
          lastCheckedAt: new Date().toISOString(),
        },
      });
    }
  );

  // Reject pending context — clears pendingContext
  ipcMain.handle(
    "modules:reject-pending",
    async (_e, projectId: string, moduleId: string) => {
      const store = getStore();
      if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
      return store.updateModule(projectId, moduleId, {
        pendingContext: "",
        pendingContextMeta: undefined,
      });
    }
  );
}

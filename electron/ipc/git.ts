import { ipcMain } from "electron";
import type { DataStore } from "../store/data-store";
import { GitService } from "../git/git-service";
import { StalenessChecker } from "../git/staleness-checker";
import { resolveSourceFiles } from "../git/resolve-source-files";

export function registerGitHandlers(store: DataStore): void {
  // Check staleness for all modules in a project
  ipcMain.handle(
    "git:check-project-staleness",
    async (_e, projectId: string) => {
      const project = await store.getProject(projectId);
      if (!project) throw new Error("Project not found");

      const isGit = await GitService.isGitRepo(project.path);
      if (!isGit) return { isGitRepo: false, results: {} };

      // Backfill: resolve sourceFiles + gitSnapshot for modules that have context but no snapshot
      try {
        const modulesNeedingBackfill = project.modules.filter(
          (m) => m.context?.trim() && !m.gitSnapshot
        );
        if (modulesNeedingBackfill.length > 0) {
          console.log(`[git] Backfilling ${modulesNeedingBackfill.length} modules with git snapshots`);
          const headSha = await GitService.getHeadSha(project.path);
          for (const mod of modulesNeedingBackfill) {
            try {
              const sourceFiles = await resolveSourceFiles(project.path, mod.path);
              await store.updateModule(projectId, mod.id, {
                sourceFiles,
                gitSnapshot: { commitSha: headSha, commitDate: new Date().toISOString() },
              });
              // Update in-memory module so staleness check uses the new snapshot
              mod.sourceFiles = sourceFiles;
              mod.gitSnapshot = { commitSha: headSha, commitDate: new Date().toISOString() };
              console.log(`[git] Backfilled ${mod.name}: ${sourceFiles.length} files`);
            } catch (err) {
              console.error(`[git] Backfill failed for ${mod.name}:`, err);
            }
          }
        }
      } catch (err) {
        console.error("[git] Backfill error:", err);
      }

      const results = await StalenessChecker.checkProject(
        project.path,
        project.modules
      );

      // Persist staleness to store sequentially (parallel writes corrupt the JSON file)
      for (const [moduleId, result] of results) {
        try {
          const mod = project.modules.find((m) => m.id === moduleId);
          const update: Record<string, unknown> = { staleness: result };
          // Clear pendingContextMeta if it was set by git-hook (now superseded by real staleness)
          if (mod?.pendingContextMeta?.source === "git-hook" && !mod.pendingContext) {
            update.pendingContextMeta = undefined;
          }
          await store.updateModule(projectId, moduleId, update);
        } catch (err) {
          console.error(`[git] Failed to persist staleness for ${moduleId}:`, err);
        }
      }

      return {
        isGitRepo: true,
        results: Object.fromEntries(results),
      };
    }
  );

  // Check staleness for a single module
  ipcMain.handle(
    "git:check-module-staleness",
    async (_e, projectId: string, moduleId: string) => {
      const project = await store.getProject(projectId);
      if (!project) throw new Error("Project not found");
      const mod = project.modules.find((m) => m.id === moduleId);
      if (!mod) throw new Error("Module not found");

      const result = await StalenessChecker.checkModule(project.path, mod);
      await store.updateModule(projectId, moduleId, { staleness: result });
      return result;
    }
  );

  // Get git history for a module's source files
  ipcMain.handle(
    "git:module-history",
    async (
      _e,
      projectId: string,
      moduleId: string,
      opts?: { maxCount?: number }
    ) => {
      const project = await store.getProject(projectId);
      if (!project) throw new Error("Project not found");
      const mod = project.modules.find((m) => m.id === moduleId);
      if (!mod) throw new Error("Module not found");

      const paths = mod.sourceFiles?.length ? mod.sourceFiles : [mod.path];
      return GitService.getCommitsSince(project.path, {
        paths,
        maxCount: opts?.maxCount ?? 20,
      });
    }
  );

  // Resolve source files for a module path
  ipcMain.handle(
    "git:resolve-source-files",
    async (_e, projectPath: string, modulePath: string) => {
      return resolveSourceFiles(projectPath, modulePath);
    }
  );

  // Check if a project path is a git repo
  ipcMain.handle("git:is-repo", async (_e, projectPath: string) => {
    return GitService.isGitRepo(projectPath);
  });
}

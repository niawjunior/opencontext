import { ipcMain, type BrowserWindow } from "electron";
import chokidar, { type FSWatcher } from "chokidar";
import type { DataStore } from "../store/data-store";

const watchers = new Map<string, FSWatcher>();
const debounceTimers = new Map<string, NodeJS.Timeout>();

export function registerFileWatcherHandlers(
  store: DataStore,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle("watcher:start", async (_e, projectId: string) => {
    if (watchers.has(projectId)) {
      return { status: "already_watching" };
    }

    const project = await store.getProject(projectId);
    if (!project) throw new Error("Project not found");

    const settings = await store.getSettings();
    const debounceMs = settings.fileWatcher.debounceMs || 2000;

    const watcher = chokidar.watch(project.path, {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.next/**",
        "**/dist/**",
        "**/build/**",
        "**/.DS_Store",
      ],
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on("all", (event, filePath) => {
      // Debounce: only notify after quiet period
      const existing = debounceTimers.get(projectId);
      if (existing) clearTimeout(existing);

      debounceTimers.set(
        projectId,
        setTimeout(() => {
          debounceTimers.delete(projectId);
          getMainWindow()?.webContents.send("watcher:file-changed", {
            projectId,
            event,
            path: filePath,
          });
        }, debounceMs)
      );
    });

    watchers.set(projectId, watcher);
    return { status: "started" };
  });

  ipcMain.handle("watcher:stop", async (_e, projectId: string) => {
    const watcher = watchers.get(projectId);
    if (!watcher) return { status: "not_watching" };

    await watcher.close();
    watchers.delete(projectId);
    const timer = debounceTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.delete(projectId);
    }

    return { status: "stopped" };
  });

  ipcMain.handle("watcher:status", () => {
    const active: string[] = [];
    for (const [projectId] of watchers) {
      active.push(projectId);
    }
    return { watchedProjects: active };
  });
}

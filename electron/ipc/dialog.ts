import { ipcMain, dialog, BrowserWindow } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

export function registerDialogHandlers(): void {
  ipcMain.handle("dialog:select-folder", async (event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select Directory",
      defaultPath: defaultPath || undefined,
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    "dialog:select-file",
    async (
      event,
      options?: { title?: string; defaultPath?: string; filters?: Electron.FileFilter[] }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return null;

      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        title: options?.title || "Select File",
        defaultPath: options?.defaultPath || undefined,
        filters: options?.filters,
      });

      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    }
  );

  ipcMain.handle(
    "dialog:select-path",
    async (
      event,
      options?: { title?: string; defaultPath?: string }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return null;

      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile", "openDirectory"],
        title: options?.title || "Select File or Folder",
        defaultPath: options?.defaultPath || undefined,
      });

      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    }
  );

  ipcMain.handle(
    "dialog:browse-project-files",
    async (_event, rootPath: string, relativePath?: string) => {
      const targetDir = relativePath ? path.join(rootPath, relativePath) : rootPath;
      try {
        const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
        return entries
          .filter((e) => !e.name.startsWith("."))
          .map((e) => ({
            name: e.name,
            path: relativePath ? path.join(relativePath, e.name) : e.name,
            isDirectory: e.isDirectory(),
          }))
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
      } catch {
        return [];
      }
    }
  );
}

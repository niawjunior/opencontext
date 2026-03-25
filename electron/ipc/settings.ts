import { ipcMain } from "electron";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import type { DataStore } from "../store/data-store";
import type { AppSettings } from "../store/types";

export function registerSettingsHandlers(store: DataStore): void {
  ipcMain.handle("settings:get", () => store.getSettings());

  ipcMain.handle("settings:update", (_e, data: Partial<AppSettings>) =>
    store.updateSettings(data)
  );

  ipcMain.handle("settings:detect-cli", async () => {
    // Try `which` (macOS/Linux) or `where` (Windows)
    const cmd = process.platform === "win32" ? "where claude" : "which claude";
    try {
      const result = execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
      if (result && fs.existsSync(result)) return result;
    } catch {
      // Not found via PATH
    }

    // Check common locations
    const candidates = [
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
      "/usr/bin/claude",
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }

    return null;
  });
}

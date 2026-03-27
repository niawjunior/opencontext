import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

/**
 * Local-only settings store. Reads/writes settings.json on disk.
 * Settings are machine-specific (CLI paths, Supabase credentials).
 */
export class SettingsStore {
  private settingsPath: string;
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.settingsPath = path.join(dataDir, "settings.json");
  }

  async getSettings(): Promise<AppSettings> {
    try {
      await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
      const raw = await fs.readFile(this.settingsPath, "utf-8");
      return { ...DEFAULT_SETTINGS, dataDirectory: this.dataDir, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS, dataDirectory: this.dataDir };
    }
  }

  async updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...data };
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(
      this.settingsPath,
      JSON.stringify(updated, null, 2),
      "utf-8"
    );
    return updated;
  }
}

import path from "node:path";
import os from "node:os";

export function resolveDataDir(electronUserDataPath?: string): string {
  // If provided by Electron main process
  if (electronUserDataPath) {
    return path.join(electronUserDataPath, "data");
  }

  // If set via environment variable (used by MCP server)
  if (process.env.OPEN_CONTEXT_DATA_DIR) {
    return process.env.OPEN_CONTEXT_DATA_DIR;
  }

  // Fallback: platform-specific default
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Open Context",
      "data"
    );
  } else if (platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Open Context",
      "data"
    );
  } else {
    return path.join(os.homedir(), ".config", "Open Context", "data");
  }
}

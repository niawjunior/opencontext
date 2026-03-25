#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import os from "node:os";
import path from "node:path";
import { DataStore } from "../electron/store/data-store.js";
import { registerResolveProjectTool } from "./tools/resolve-project.js";
import { registerGetProjectContextTool } from "./tools/get-project-context.js";
import { registerSearchContextTool } from "./tools/search-context.js";
import { registerGetModuleContextTool } from "./tools/get-module-context.js";
import { registerListModulesTool } from "./tools/list-modules.js";
import { registerUpdateModuleContextTool } from "./tools/update-module-context.js";

// Resolve data directory
function getDataDir(): string {
  if (process.env.OPEN_CONTEXT_DATA_DIR) {
    return process.env.OPEN_CONTEXT_DATA_DIR;
  }
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
  }
  return path.join(os.homedir(), ".config", "Open Context", "data");
}

const dataDir = getDataDir();
const store = new DataStore(dataDir);

const server = new McpServer({
  name: "open-context",
  version: "1.0.0",
});

// Register all tools
registerResolveProjectTool(server, store);
registerGetProjectContextTool(server, store);
registerSearchContextTool(server, store);
registerGetModuleContextTool(server, store);
registerListModulesTool(server, store);
registerUpdateModuleContextTool(server, store);

// CRITICAL: All logging to stderr (stdout is MCP protocol)
async function main() {
  console.error("[open-context] MCP server starting...");
  console.error(`[open-context] Data directory: ${dataDir}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[open-context] MCP server connected via stdio");
}

main().catch((err) => {
  console.error("[open-context] Fatal error:", err);
  process.exit(1);
});

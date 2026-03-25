export const IPC = {
  // Projects
  PROJECTS_LIST: "projects:list",
  PROJECTS_GET: "projects:get",
  PROJECTS_CREATE: "projects:create",
  PROJECTS_UPDATE: "projects:update",
  PROJECTS_DELETE: "projects:delete",

  // Modules
  MODULES_ADD: "modules:add",
  MODULES_UPDATE: "modules:update",
  MODULES_DELETE: "modules:delete",

  // Context
  CONTEXT_GET_FULL: "context:get-full",
  CONTEXT_SAVE_FULL: "context:save-full",
  CONTEXT_GENERATE: "context:generate",
  CONTEXT_SEARCH: "context:search",

  // MCP Server
  MCP_START: "mcp:start",
  MCP_STOP: "mcp:stop",
  MCP_STATUS: "mcp:status",
  MCP_GET_CONFIG: "mcp:get-config",

  // Settings
  SETTINGS_GET: "settings:get",
  SETTINGS_UPDATE: "settings:update",

  // Dialog
  DIALOG_SELECT_FOLDER: "dialog:select-folder",

  // App
  APP_GET_VERSION: "app:get-version",
  APP_GET_DATA_PATH: "app:get-data-path",
} as const;

// Events (main → renderer)
export const EVENTS = {
  CONTEXT_GENERATE_PROGRESS: "context:generate-progress",
  UPDATE_AVAILABLE: "update:available",
  UPDATE_DOWNLOADED: "update:downloaded",
} as const;

import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  // App
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
  getDataPath: (): Promise<string> => ipcRenderer.invoke("app:get-data-path"),
  platform: process.platform,

  // Auto-update
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: unknown) =>
      callback(info);
    ipcRenderer.on("update:available", handler);
    return () => ipcRenderer.removeListener("update:available", handler);
  },
  onUpdateDownloaded: (callback: (info: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: unknown) =>
      callback(info);
    ipcRenderer.on("update:downloaded", handler);
    return () => ipcRenderer.removeListener("update:downloaded", handler);
  },
  installUpdate: (): void => {
    ipcRenderer.send("update:install");
  },

  // Projects
  projects: {
    list: (): Promise<unknown> => ipcRenderer.invoke("projects:list"),
    get: (id: string): Promise<unknown> => ipcRenderer.invoke("projects:get", id),
    create: (data: { name: string; path: string; description: string }): Promise<unknown> =>
      ipcRenderer.invoke("projects:create", data),
    update: (id: string, data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke("projects:update", id, data),
    delete: (id: string): Promise<unknown> => ipcRenderer.invoke("projects:delete", id),
    scanModules: (projectPath: string): Promise<unknown> =>
      ipcRenderer.invoke("projects:scan-modules", projectPath),
    getCoverage: (projectId: string): Promise<unknown> =>
      ipcRenderer.invoke("projects:get-coverage", projectId),
  },

  // Modules
  modules: {
    add: (projectId: string, data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke("modules:add", projectId, data),
    update: (projectId: string, moduleId: string, data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke("modules:update", projectId, moduleId, data),
    delete: (projectId: string, moduleId: string): Promise<unknown> =>
      ipcRenderer.invoke("modules:delete", projectId, moduleId),
    approvePending: (projectId: string, moduleId: string): Promise<unknown> =>
      ipcRenderer.invoke("modules:approve-pending", projectId, moduleId),
    rejectPending: (projectId: string, moduleId: string): Promise<unknown> =>
      ipcRenderer.invoke("modules:reject-pending", projectId, moduleId),
  },

  // Context
  context: {
    getFull: (projectId: string): Promise<unknown> =>
      ipcRenderer.invoke("context:get-full", projectId),
    saveFull: (projectId: string, content: string): Promise<unknown> =>
      ipcRenderer.invoke("context:save-full", projectId, content),
    generate: (projectId: string): Promise<unknown> =>
      ipcRenderer.invoke("context:generate", projectId),
    analyzeModule: (
      projectPath: string,
      modulePath: string,
      moduleType: string
    ): Promise<string> =>
      ipcRenderer.invoke("context:analyze-module", projectPath, modulePath, moduleType),
    resyncModule: (
      projectPath: string,
      modulePath: string,
      moduleType: string
    ): Promise<{ oldContext: string; newContext: string }> =>
      ipcRenderer.invoke("context:resync-module", projectPath, modulePath, moduleType),
    search: (query: string, projectId?: string): Promise<unknown> =>
      ipcRenderer.invoke("context:search", query, projectId),
    exportToProject: (projectId: string): Promise<unknown> =>
      ipcRenderer.invoke("context:export-to-project", projectId),
    onGenerateProgress: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) =>
        callback(data);
      ipcRenderer.on("context:generate-progress", handler);
      return () => ipcRenderer.removeListener("context:generate-progress", handler);
    },
  },

  // MCP Server
  mcp: {
    start: (): Promise<unknown> => ipcRenderer.invoke("mcp:start"),
    stop: (): Promise<unknown> => ipcRenderer.invoke("mcp:stop"),
    status: (): Promise<unknown> => ipcRenderer.invoke("mcp:status"),
    getConfig: (): Promise<unknown> => ipcRenderer.invoke("mcp:get-config"),
    setupProject: (
      projectId: string,
      options?: { mcpJson?: boolean; claudeMd?: boolean; huskyHook?: boolean }
    ): Promise<{ mcpJsonPath: string; claudeMdPath: string; filesWritten: string[] }> =>
      ipcRenderer.invoke("mcp:setup-project", projectId, options),
    checkProjectSetup: (projectPath: string): Promise<{
      configured: boolean;
      hasClaudeMd: boolean;
      hasHuskyHook: boolean;
    }> =>
      ipcRenderer.invoke("mcp:check-project-setup", projectPath),
    setupGitHook: (projectPath: string): Promise<{ hookPath: string }> =>
      ipcRenderer.invoke("mcp:setup-git-hook", projectPath),
  },

  // Settings
  settings: {
    get: (): Promise<unknown> => ipcRenderer.invoke("settings:get"),
    update: (data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke("settings:update", data),
    detectCli: (): Promise<string | null> =>
      ipcRenderer.invoke("settings:detect-cli"),
  },

  // Dialog
  dialog: {
    selectFolder: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke("dialog:select-folder", defaultPath),
    selectFile: (options?: {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }): Promise<string | null> =>
      ipcRenderer.invoke("dialog:select-file", options),
    selectPath: (options?: {
      title?: string;
      defaultPath?: string;
    }): Promise<string | null> =>
      ipcRenderer.invoke("dialog:select-path", options),
    browseProjectFiles: (
      rootPath: string,
      relativePath?: string
    ): Promise<Array<{ name: string; path: string; isDirectory: boolean }>> =>
      ipcRenderer.invoke("dialog:browse-project-files", rootPath, relativePath),
  },
} as const;

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

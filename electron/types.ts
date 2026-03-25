import type {
  Project,
  Module,
  ProjectIndexEntry,
  ContextDocument,
  AppSettings,
  SearchResult,
  ModuleType,
} from "./store/types";

export interface ElectronAPI {
  // App
  getAppVersion: () => Promise<string>;
  getDataPath: () => Promise<string>;
  platform: NodeJS.Platform;

  // Auto-update
  onUpdateAvailable: (callback: (info: unknown) => void) => () => void;
  onUpdateDownloaded: (callback: (info: unknown) => void) => () => void;
  installUpdate: () => void;

  // Projects
  projects: {
    list: () => Promise<ProjectIndexEntry[]>;
    get: (id: string) => Promise<Project | null>;
    create: (data: {
      name: string;
      path: string;
      description: string;
    }) => Promise<Project>;
    update: (
      id: string,
      data: Partial<{ name: string; path: string; description: string }>
    ) => Promise<Project>;
    delete: (id: string) => Promise<void>;
    scanModules: (projectPath: string) => Promise<ScannedModule[]>;
    getCoverage: (projectId: string) => Promise<unknown>;
  };

  // Modules
  modules: {
    add: (
      projectId: string,
      data: { name: string; type: ModuleType; path: string; context: string }
    ) => Promise<Module>;
    update: (
      projectId: string,
      moduleId: string,
      data: Partial<{
        name: string;
        type: ModuleType;
        path: string;
        context: string;
        lastAnalyzedAt: string;
      }>
    ) => Promise<Module>;
    delete: (projectId: string, moduleId: string) => Promise<void>;
  };

  // Context
  context: {
    getFull: (projectId: string) => Promise<ContextDocument | null>;
    saveFull: (
      projectId: string,
      content: string
    ) => Promise<ContextDocument>;
    generate: (projectId: string) => Promise<GenerateResult>;
    analyzeModule: (
      projectPath: string,
      modulePath: string,
      moduleType: string
    ) => Promise<string>;
    search: (
      query: string,
      projectId?: string
    ) => Promise<SearchResult[]>;
    resyncModule: (
      projectPath: string,
      modulePath: string,
      moduleType: string
    ) => Promise<{ newContext: string }>;
    exportToProject: (projectId: string) => Promise<{ path: string }>;
    onGenerateProgress: (
      callback: (data: GenerateProgress) => void
    ) => () => void;
  };

  // MCP Server
  mcp: {
    start: () => Promise<McpStatus>;
    stop: () => Promise<McpStatus>;
    status: () => Promise<{ running: boolean; pid: number | null }>;
    getConfig: () => Promise<McpConfigSnippet>;
    setupProject: (
      projectId: string,
      options?: { mcpJson?: boolean; claudeMd?: boolean; huskyHook?: boolean }
    ) => Promise<{ mcpJsonPath: string; claudeMdPath: string; filesWritten: string[] }>;
    checkProjectSetup: (projectPath: string) => Promise<{
      configured: boolean;
      hasClaudeMd: boolean;
      hasHuskyHook: boolean;
    }>;
    setupGitHook: (projectPath: string) => Promise<{ hookPath: string }>;
  };

  // File Watcher
  watcher: {
    start: (projectId: string) => Promise<{ status: string }>;
    stop: (projectId: string) => Promise<{ status: string }>;
    status: () => Promise<{ watchedProjects: string[] }>;
    onFileChanged: (
      callback: (data: FileChangeEvent) => void
    ) => () => void;
  };

  // Settings
  settings: {
    get: () => Promise<AppSettings>;
    update: (data: Partial<AppSettings>) => Promise<AppSettings>;
    detectCli: () => Promise<string | null>;
  };

  // Dialog
  dialog: {
    selectFolder: (defaultPath?: string) => Promise<string | null>;
    selectFile: (options?: {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) => Promise<string | null>;
    selectPath: (options?: {
      title?: string;
      defaultPath?: string;
    }) => Promise<string | null>;
    browseProjectFiles: (
      rootPath: string,
      relativePath?: string
    ) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
  };
}

export interface GenerateResult {
  success: boolean;
  document: ContextDocument;
}

export interface GenerateProgress {
  projectId: string;
  chunk: string;
  status: "generating";
}

export interface McpStatus {
  status: string;
  pid?: number;
}

export interface McpConfigSnippet {
  mcpServers: {
    "open-context": {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  };
}

export interface FileChangeEvent {
  projectId: string;
  event: string;
  path: string;
}

export interface ScannedModule {
  name: string;
  type: ModuleType;
  path: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export type {
  Project,
  Module,
  ModuleType,
  ContextDocument,
  ProjectIndexEntry,
  AppSettings,
  SearchResult,
} from "./store/types";

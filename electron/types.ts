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

  // Store
  onProjectChanged: (callback: (projectId: string) => void) => () => void;
  reconnectStore: () => void;

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
        pendingContextMeta: { updatedAt: string; source?: string; previousPendingAt?: string } | undefined;
        staleness: { status: "fresh" | "stale" | "outdated" | "unknown"; commitsBehind: number; lastCheckedAt: string };
      }>
    ) => Promise<Module>;
    delete: (projectId: string, moduleId: string) => Promise<void>;
    approvePending: (projectId: string, moduleId: string) => Promise<Module>;
    rejectPending: (projectId: string, moduleId: string) => Promise<Module>;
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

  // Git
  git: {
    checkProjectStaleness: (projectId: string) => Promise<{
      isGitRepo: boolean;
      results: Record<string, {
        status: "fresh" | "stale" | "outdated" | "unknown";
        commitsBehind: number;
        lastCheckedAt: string;
        changedFiles?: string[];
        authors?: string[];
      }>;
    }>;
    checkModuleStaleness: (projectId: string, moduleId: string) => Promise<{
      status: "fresh" | "stale" | "outdated" | "unknown";
      commitsBehind: number;
      lastCheckedAt: string;
      changedFiles?: string[];
      authors?: string[];
    }>;
    moduleHistory: (projectId: string, moduleId: string, opts?: { maxCount?: number }) => Promise<Array<{
      sha: string;
      shortSha: string;
      author: string;
      authorEmail: string;
      date: string;
      message: string;
      filesChanged: string[];
    }>>;
    resolveSourceFiles: (projectPath: string, modulePath: string) => Promise<string[]>;
    isRepo: (projectPath: string) => Promise<boolean>;
  };

  // Team
  team: {
    listMembers: () => Promise<MemberSummary[]>;
    createMember: (data: { name: string; email?: string }) => Promise<{ id: string; name: string }>;
    deleteMember: (memberId: string) => Promise<void>;
    getMember: (memberId: string) => Promise<MemberDetail>;
    generateKey: (memberId: string, keyName: string) => Promise<GeneratedKey>;
    revokeKey: (keyId: string) => Promise<void>;
    assignProject: (memberId: string, projectId: string) => Promise<void>;
    unassignProject: (memberId: string, projectId: string) => Promise<void>;
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

export interface McpConfigSnippet {
  mcpServers: {
    "open-context": {
      type: string;
      url: string;
      headers?: Record<string, string>;
    };
  };
}

export interface MemberSummary {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  keyCount: number;
}

export interface MemberDetail {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  apiKeys: Array<{
    id: string;
    keyPrefix: string;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
  projects: Array<{
    id: string;
    name: string;
    path: string;
    grantedAt: string;
  }>;
}

export interface GeneratedKey {
  id: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
  rawKey: string;
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

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string;
  lastUpdated: string;
  modules: Module[];
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
  type: ModuleType;
  path: string;
  context: string;
  pendingContext?: string;
  pendingContextMeta?: {
    updatedAt: string;
    source?: string;
    previousPendingAt?: string;
  };
  lastUpdated: string;
  lastAnalyzedAt?: string;
}

export type ModuleType =
  | "page"
  | "component"
  | "module"
  | "api"
  | "hook"
  | "util"
  | "config";

export interface ContextDocument {
  projectId: string;
  fullContext: string;
  generatedAt: string;
}

export interface ProjectIndexEntry {
  id: string;
  name: string;
  path: string;
  lastUpdated: string;
}

export interface ProjectIndex {
  projects: ProjectIndexEntry[];
  lastModified: string;
}

export interface AppSettings {
  claudeCliPath: string;
  dataDirectory: string;
  autoRebuildContext: boolean;
  mcpServer: {
    autoStart: boolean;
  };
  fileWatcher: {
    enabled: boolean;
    debounceMs: number;
    watchedProjects: string[];
  };
}

export interface CoverageItem {
  name: string;
  path: string;
  covered: boolean;
  moduleId?: string;
  moduleName?: string;
}

export interface SearchResult {
  projectId: string;
  projectName: string;
  moduleId?: string;
  moduleName?: string;
  snippet: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  claudeCliPath: "claude",
  dataDirectory: "",
  autoRebuildContext: true,
  mcpServer: {
    autoStart: false,
  },
  fileWatcher: {
    enabled: false,
    debounceMs: 2000,
    watchedProjects: [],
  },
};

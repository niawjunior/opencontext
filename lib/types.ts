// Frontend type mirrors — these match the Electron store types
// but are independent so the renderer doesn't import from electron/

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
  sourceFiles?: string[];
  gitSnapshot?: {
    commitSha: string;
    commitDate: string;
  };
  staleness?: {
    status: "fresh" | "stale" | "outdated" | "unknown";
    commitsBehind: number;
    lastCheckedAt: string;
    changedFiles?: string[];
    authors?: string[];
  };
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

export interface AppSettings {
  claudeCliPath: string;
  dataDirectory: string;
  autoRebuildContext: boolean;
  mcpServer: {
    autoStart: boolean;
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

export interface GenerateProgress {
  projectId: string;
  chunk: string;
  status: "generating";
}

export interface ScannedModule {
  name: string;
  type: ModuleType;
  path: string;
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

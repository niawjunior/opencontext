// Interface for the data store — implemented by both local DataStore and remote SupabaseDataStore
// MCP tool handlers depend only on this interface.

import type {
  Project,
  Module,
  ProjectIndexEntry,
  ContextDocument,
  SearchResult,
} from "./types.js";

export interface IDataStore {
  // Projects
  listProjects(): Promise<ProjectIndexEntry[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(data: Pick<Project, "name" | "path" | "description">): Promise<Project>;
  updateProject(
    id: string,
    data: Partial<Pick<Project, "name" | "path" | "description">>
  ): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Modules
  addModule(
    projectId: string,
    data: Pick<Module, "name" | "type" | "path" | "context">
  ): Promise<Module>;
  updateModule(
    projectId: string,
    moduleId: string,
    data: Partial<
      Pick<
        Module,
        | "name"
        | "type"
        | "path"
        | "context"
        | "pendingContext"
        | "pendingContextMeta"
        | "lastAnalyzedAt"
        | "sourceFiles"
        | "gitSnapshot"
        | "staleness"
      >
    >
  ): Promise<Module>;
  deleteModule(projectId: string, moduleId: string): Promise<void>;

  // Context
  getFullContext(projectId: string): Promise<ContextDocument | null>;
  saveFullContext(projectId: string, fullContext: string): Promise<ContextDocument>;
  searchContexts(query: string, projectId?: string): Promise<SearchResult[]>;
}

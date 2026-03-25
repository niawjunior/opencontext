import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  Project,
  Module,
  ContextDocument,
  ProjectIndex,
  ProjectIndexEntry,
  AppSettings,
  SearchResult,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

export class DataStore {
  private projectsDir: string;
  private contextsDir: string;
  private indexPath: string;
  private settingsPath: string;
  private initialized = false;

  constructor(private dataDir: string) {
    this.projectsDir = path.join(dataDir, "projects");
    this.contextsDir = path.join(dataDir, "contexts");
    this.indexPath = path.join(dataDir, "projects-index.json");
    this.settingsPath = path.join(dataDir, "settings.json");
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.projectsDir, { recursive: true });
    await fs.mkdir(this.contextsDir, { recursive: true });
    // Create index if missing
    try {
      await fs.access(this.indexPath);
    } catch {
      await this.writeIndex({ projects: [], lastModified: new Date().toISOString() });
    }
    this.initialized = true;
  }

  // ─── Project CRUD ──────────────────────────────────────────────

  async listProjects(): Promise<ProjectIndexEntry[]> {
    await this.ensureInit();
    const index = await this.readIndex();
    return index.projects;
  }

  async getProject(id: string): Promise<Project | null> {
    await this.ensureInit();
    return this.readProjectFile(id);
  }

  async createProject(
    data: Pick<Project, "name" | "path" | "description">
  ): Promise<Project> {
    await this.ensureInit();
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      name: data.name,
      path: data.path,
      description: data.description,
      lastUpdated: now,
      modules: [],
    };
    await this.writeProjectFile(project);

    const index = await this.readIndex();
    index.projects.push({
      id: project.id,
      name: project.name,
      path: project.path,
      lastUpdated: now,
    });
    index.lastModified = now;
    await this.writeIndex(index);

    return project;
  }

  async updateProject(
    id: string,
    data: Partial<Pick<Project, "name" | "path" | "description">>
  ): Promise<Project> {
    const project = await this.readProjectFile(id);
    if (!project) throw new Error(`Project ${id} not found`);

    const now = new Date().toISOString();
    Object.assign(project, data, { lastUpdated: now });
    await this.writeProjectFile(project);

    const index = await this.readIndex();
    const entry = index.projects.find((p) => p.id === id);
    if (entry) {
      if (data.name) entry.name = data.name;
      if (data.path) entry.path = data.path;
      entry.lastUpdated = now;
      index.lastModified = now;
      await this.writeIndex(index);
    }

    return project;
  }

  async deleteProject(id: string): Promise<void> {
    await this.ensureInit();
    const projectPath = path.join(this.projectsDir, `${id}.json`);
    const contextPath = path.join(this.contextsDir, `${id}.context.json`);

    try { await fs.unlink(projectPath); } catch {}
    try { await fs.unlink(contextPath); } catch {}

    const index = await this.readIndex();
    index.projects = index.projects.filter((p) => p.id !== id);
    index.lastModified = new Date().toISOString();
    await this.writeIndex(index);
  }

  // ─── Module CRUD ───────────────────────────────────────────────

  async addModule(
    projectId: string,
    data: Pick<Module, "name" | "type" | "path" | "context">
  ): Promise<Module> {
    const project = await this.readProjectFile(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const now = new Date().toISOString();
    const mod: Module = {
      id: crypto.randomUUID(),
      projectId,
      name: data.name,
      type: data.type,
      path: data.path,
      context: data.context,
      lastUpdated: now,
    };

    project.modules.push(mod);
    project.lastUpdated = now;
    await this.writeProjectFile(project);
    await this.updateIndexTimestamp(projectId, now);

    return mod;
  }

  async updateModule(
    projectId: string,
    moduleId: string,
    data: Partial<Pick<Module, "name" | "type" | "path" | "context" | "lastAnalyzedAt">>
  ): Promise<Module> {
    const project = await this.readProjectFile(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const mod = project.modules.find((m) => m.id === moduleId);
    if (!mod) throw new Error(`Module ${moduleId} not found`);

    const now = new Date().toISOString();
    Object.assign(mod, data, { lastUpdated: now });
    project.lastUpdated = now;
    await this.writeProjectFile(project);
    await this.updateIndexTimestamp(projectId, now);

    return mod;
  }

  async deleteModule(projectId: string, moduleId: string): Promise<void> {
    const project = await this.readProjectFile(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    project.modules = project.modules.filter((m) => m.id !== moduleId);
    project.lastUpdated = new Date().toISOString();
    await this.writeProjectFile(project);
    await this.updateIndexTimestamp(projectId, project.lastUpdated);
  }

  // ─── Context ───────────────────────────────────────────────────

  async getFullContext(projectId: string): Promise<ContextDocument | null> {
    await this.ensureInit();
    const filePath = path.join(this.contextsDir, `${projectId}.context.json`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as ContextDocument;
    } catch {
      return null;
    }
  }

  async saveFullContext(
    projectId: string,
    fullContext: string
  ): Promise<ContextDocument> {
    await this.ensureInit();
    const doc: ContextDocument = {
      projectId,
      fullContext,
      generatedAt: new Date().toISOString(),
    };
    const filePath = path.join(this.contextsDir, `${projectId}.context.json`);
    await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
    return doc;
  }

  async searchContexts(
    query: string,
    projectId?: string
  ): Promise<SearchResult[]> {
    await this.ensureInit();
    const results: SearchResult[] = [];
    const q = query.toLowerCase();

    const index = await this.readIndex();
    const projectIds = projectId
      ? [projectId]
      : index.projects.map((p) => p.id);

    for (const pid of projectIds) {
      const project = await this.readProjectFile(pid);
      if (!project) continue;

      // Search in project description
      if (project.description.toLowerCase().includes(q)) {
        results.push({
          projectId: pid,
          projectName: project.name,
          snippet: this.extractSnippet(project.description, q),
        });
      }

      // Search in module contexts
      for (const mod of project.modules) {
        if (
          mod.context.toLowerCase().includes(q) ||
          mod.name.toLowerCase().includes(q)
        ) {
          results.push({
            projectId: pid,
            projectName: project.name,
            moduleId: mod.id,
            moduleName: mod.name,
            snippet: this.extractSnippet(mod.context, q),
          });
        }
      }

      // Search in full context documents
      const contextDoc = await this.getFullContext(pid);
      if (contextDoc && contextDoc.fullContext.toLowerCase().includes(q)) {
        const alreadyHasProject = results.some(
          (r) => r.projectId === pid && !r.moduleId
        );
        if (!alreadyHasProject) {
          results.push({
            projectId: pid,
            projectName: project.name,
            snippet: this.extractSnippet(contextDoc.fullContext, q),
          });
        }
      }
    }

    return results;
  }

  // ─── Settings ──────────────────────────────────────────────────

  async getSettings(): Promise<AppSettings> {
    await this.ensureInit();
    try {
      const raw = await fs.readFile(this.settingsPath, "utf-8");
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS, dataDirectory: this.dataDir };
    }
  }

  async updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...data };
    await fs.writeFile(
      this.settingsPath,
      JSON.stringify(updated, null, 2),
      "utf-8"
    );
    return updated;
  }

  // ─── Internal ──────────────────────────────────────────────────

  private async readProjectFile(id: string): Promise<Project | null> {
    const filePath = path.join(this.projectsDir, `${id}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as Project;
    } catch {
      return null;
    }
  }

  private async writeProjectFile(project: Project): Promise<void> {
    const filePath = path.join(this.projectsDir, `${project.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(project, null, 2), "utf-8");
  }

  private async readIndex(): Promise<ProjectIndex> {
    try {
      const raw = await fs.readFile(this.indexPath, "utf-8");
      return JSON.parse(raw) as ProjectIndex;
    } catch {
      return { projects: [], lastModified: new Date().toISOString() };
    }
  }

  private async writeIndex(index: ProjectIndex): Promise<void> {
    await fs.writeFile(
      this.indexPath,
      JSON.stringify(index, null, 2),
      "utf-8"
    );
  }

  private async updateIndexTimestamp(
    projectId: string,
    timestamp: string
  ): Promise<void> {
    const index = await this.readIndex();
    const entry = index.projects.find((p) => p.id === projectId);
    if (entry) {
      entry.lastUpdated = timestamp;
      index.lastModified = timestamp;
      await this.writeIndex(index);
    }
  }

  private extractSnippet(text: string, query: string): string {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx === -1) return text.slice(0, 200);
    const start = Math.max(0, idx - 80);
    const end = Math.min(text.length, idx + query.length + 80);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = "..." + snippet;
    if (end < text.length) snippet = snippet + "...";
    return snippet;
  }
}

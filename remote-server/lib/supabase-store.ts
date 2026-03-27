import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { IDataStore } from "../shared/data-store-interface.js";
import type {
  Project,
  Module,
  ProjectIndexEntry,
  ContextDocument,
  SearchResult,
} from "../shared/types.js";

/**
 * Supabase-backed implementation of IDataStore.
 * Scoped to an organization via orgId.
 */
export class SupabaseDataStore implements IDataStore {
  private client: SupabaseClient;

  constructor(private orgId: string, private memberId: string | null = null) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    this.client = createClient(url, key);
  }

  /**
   * Get project IDs this member can access.
   * Returns null for admin keys (full org access).
   */
  private async getAllowedProjectIds(): Promise<string[] | null> {
    if (!this.memberId) return null;
    const { data, error } = await this.client
      .from("member_project_access")
      .select("project_id")
      .eq("member_id", this.memberId);
    if (error) throw new Error(`Failed to check access: ${error.message}`);
    return (data || []).map((r) => r.project_id);
  }

  /**
   * Verify member has access to a specific project.
   * Throws if the member is not granted access.
   * No-op for admin keys (memberId is null).
   */
  private async assertProjectAccess(projectId: string): Promise<void> {
    const allowed = await this.getAllowedProjectIds();
    if (allowed !== null && !allowed.includes(projectId)) {
      throw new Error("Access denied: you do not have access to this project");
    }
  }

  async listProjects(): Promise<ProjectIndexEntry[]> {
    const allowed = await this.getAllowedProjectIds();

    let query = this.client
      .from("projects")
      .select("id, name, path, last_updated")
      .eq("org_id", this.orgId)
      .order("last_updated", { ascending: false });

    if (allowed !== null) {
      query = query.in("id", allowed.length > 0 ? allowed : ["__none__"]);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list projects: ${error.message}`);

    return (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      lastUpdated: p.last_updated,
    }));
  }

  async getProject(id: string): Promise<Project | null> {
    // Check member access
    if (this.memberId) {
      const allowed = await this.getAllowedProjectIds();
      if (allowed && !allowed.includes(id)) return null;
    }

    const { data: project, error: pErr } = await this.client
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("org_id", this.orgId)
      .single();

    if (pErr || !project) return null;

    const { data: modules, error: mErr } = await this.client
      .from("modules")
      .select("*")
      .eq("project_id", id)
      .order("name");

    if (mErr) throw new Error(`Failed to load modules: ${mErr.message}`);

    return {
      id: project.id,
      name: project.name,
      path: project.path,
      description: project.description,
      lastUpdated: project.last_updated,
      modules: (modules || []).map(this.mapModule),
    };
  }

  async createProject(
    data: Pick<Project, "name" | "path" | "description">
  ): Promise<Project> {
    const { data: project, error } = await this.client
      .from("projects")
      .insert({
        org_id: this.orgId,
        name: data.name,
        path: data.path,
        description: data.description,
      })
      .select()
      .single();

    if (error || !project) throw new Error(`Failed to create project: ${error?.message}`);

    return {
      id: project.id,
      name: project.name,
      path: project.path,
      description: project.description,
      lastUpdated: project.last_updated,
      modules: [],
    };
  }

  async updateProject(
    id: string,
    data: Partial<Pick<Project, "name" | "path" | "description">>
  ): Promise<Project> {
    await this.assertProjectAccess(id);
    const updates: Record<string, unknown> = { last_updated: new Date().toISOString() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.path !== undefined) updates.path = data.path;
    if (data.description !== undefined) updates.description = data.description;

    const { error } = await this.client
      .from("projects")
      .update(updates)
      .eq("id", id)
      .eq("org_id", this.orgId);

    if (error) throw new Error(`Failed to update project: ${error.message}`);

    const project = await this.getProject(id);
    if (!project) throw new Error(`Project ${id} not found after update`);
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    await this.assertProjectAccess(id);
    // Modules cascade-delete via FK
    await this.client.from("context_documents").delete().eq("project_id", id);
    const { error } = await this.client
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("org_id", this.orgId);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  async addModule(
    projectId: string,
    data: Pick<Module, "name" | "type" | "path" | "context">
  ): Promise<Module> {
    await this.assertProjectAccess(projectId);
    const now = new Date().toISOString();
    const { data: mod, error } = await this.client
      .from("modules")
      .insert({
        project_id: projectId,
        name: data.name,
        type: data.type,
        path: data.path,
        context: data.context,
        last_updated: now,
      })
      .select()
      .single();

    if (error || !mod) throw new Error(`Failed to add module: ${error?.message}`);

    // Update project timestamp
    await this.client
      .from("projects")
      .update({ last_updated: now })
      .eq("id", projectId);

    return this.mapModule(mod);
  }

  async updateModule(
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
  ): Promise<Module> {
    await this.assertProjectAccess(projectId);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { last_updated: now };

    if (data.name !== undefined) updates.name = data.name;
    if (data.type !== undefined) updates.type = data.type;
    if (data.path !== undefined) updates.path = data.path;
    if (data.context !== undefined) updates.context = data.context;
    if (data.pendingContext !== undefined) updates.pending_context = data.pendingContext || null;
    if (data.pendingContextMeta !== undefined) updates.pending_context_meta = data.pendingContextMeta ?? null;
    if (data.lastAnalyzedAt !== undefined) updates.last_analyzed_at = data.lastAnalyzedAt;
    if (data.sourceFiles !== undefined) updates.source_files = data.sourceFiles;
    if (data.gitSnapshot !== undefined) updates.git_snapshot = data.gitSnapshot ?? null;
    if (data.staleness !== undefined) updates.staleness = data.staleness ?? null;

    const { data: mod, error } = await this.client
      .from("modules")
      .update(updates)
      .eq("id", moduleId)
      .eq("project_id", projectId)
      .select()
      .single();

    if (error || !mod) throw new Error(`Failed to update module: ${error?.message}`);

    // Update project timestamp
    await this.client
      .from("projects")
      .update({ last_updated: now })
      .eq("id", projectId);

    return this.mapModule(mod);
  }

  async deleteModule(projectId: string, moduleId: string): Promise<void> {
    await this.assertProjectAccess(projectId);
    const { error } = await this.client
      .from("modules")
      .delete()
      .eq("id", moduleId)
      .eq("project_id", projectId);

    if (error) throw new Error(`Failed to delete module: ${error.message}`);

    await this.client
      .from("projects")
      .update({ last_updated: new Date().toISOString() })
      .eq("id", projectId);
  }

  async getFullContext(projectId: string): Promise<ContextDocument | null> {
    await this.assertProjectAccess(projectId);
    const { data, error } = await this.client
      .from("context_documents")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (error || !data) return null;

    return {
      projectId: data.project_id,
      fullContext: data.full_context,
      generatedAt: data.generated_at,
    };
  }

  async saveFullContext(
    projectId: string,
    fullContext: string
  ): Promise<ContextDocument> {
    await this.assertProjectAccess(projectId);
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("context_documents")
      .upsert({
        project_id: projectId,
        full_context: fullContext,
        generated_at: now,
      });

    if (error) throw new Error(`Failed to save context: ${error.message}`);

    return { projectId, fullContext, generatedAt: now };
  }

  async searchContexts(
    query: string,
    projectId?: string
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const tsQuery = query.split(/\s+/).filter(Boolean).join(" & ");
    const allowed = await this.getAllowedProjectIds();

    // Search projects
    let projectQuery = this.client
      .from("projects")
      .select("id, name, description")
      .eq("org_id", this.orgId)
      .textSearch("description", tsQuery, { type: "plain" });

    if (projectId) projectQuery = projectQuery.eq("id", projectId);
    if (allowed !== null) {
      projectQuery = projectQuery.in("id", allowed.length > 0 ? allowed : ["__none__"]);
    }

    const { data: projects } = await projectQuery;
    for (const p of projects || []) {
      results.push({
        projectId: p.id,
        projectName: p.name,
        snippet: this.extractSnippet(p.description, query),
      });
    }

    // Search modules
    let moduleQuery = this.client
      .from("modules")
      .select("id, name, project_id, context, projects!inner(name, org_id)")
      .textSearch("context", tsQuery, { type: "plain" });

    if (projectId) {
      moduleQuery = moduleQuery.eq("project_id", projectId);
    }
    if (allowed !== null) {
      moduleQuery = moduleQuery.in("project_id", allowed.length > 0 ? allowed : ["__none__"]);
    }

    const { data: modules } = await moduleQuery;
    for (const m of modules || []) {
      const proj = m.projects as unknown as { name: string; org_id: string };
      if (proj.org_id !== this.orgId) continue;
      results.push({
        projectId: m.project_id,
        projectName: proj.name,
        moduleId: m.id,
        moduleName: m.name,
        snippet: this.extractSnippet(m.context, query),
      });
    }

    return results;
  }

  // Map DB row (snake_case) to Module type (camelCase)
  private mapModule(row: Record<string, unknown>): Module {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      name: row.name as string,
      type: row.type as Module["type"],
      path: row.path as string,
      context: (row.context as string) || "",
      pendingContext: (row.pending_context as string) || undefined,
      pendingContextMeta: row.pending_context_meta as Module["pendingContextMeta"],
      lastUpdated: row.last_updated as string,
      lastAnalyzedAt: (row.last_analyzed_at as string) || undefined,
      sourceFiles: (row.source_files as string[]) || undefined,
      gitSnapshot: row.git_snapshot as Module["gitSnapshot"],
      staleness: row.staleness as Module["staleness"],
    };
  }

  private extractSnippet(text: string, query: string): string {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, 200);
    const start = Math.max(0, idx - 80);
    const end = Math.min(text.length, idx + query.length + 80);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = "..." + snippet;
    if (end < text.length) snippet = snippet + "...";
    return snippet;
  }
}

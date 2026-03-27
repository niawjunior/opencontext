import { EventEmitter } from "node:events";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  Project,
  Module,
  ProjectIndexEntry,
  ContextDocument,
  SearchResult,
} from "./types";

export interface SupabaseStoreConfig {
  supabaseUrl: string;
  supabaseKey: string;
  orgId: string;
}

/**
 * Supabase-backed data store for the Electron app.
 * Extends EventEmitter to emit "project-changed" events for UI updates.
 */
export class SupabaseStore extends EventEmitter {
  private client: SupabaseClient;
  private orgId: string;

  constructor(config: SupabaseStoreConfig) {
    super();
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error("Supabase URL and key are required");
    }
    this.orgId = config.orgId;
    this.client = createClient(config.supabaseUrl, config.supabaseKey);
  }

  // ── Projects ──────────────────────────────────────────────────────

  async listProjects(): Promise<ProjectIndexEntry[]> {
    const { data, error } = await this.client
      .from("projects")
      .select("id, name, path, last_updated")
      .eq("org_id", this.orgId)
      .order("last_updated", { ascending: false });

    if (error) throw new Error(`Failed to list projects: ${error.message}`);

    return (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      lastUpdated: p.last_updated,
    }));
  }

  async getProject(id: string): Promise<Project | null> {
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

    if (error || !project)
      throw new Error(`Failed to create project: ${error?.message}`);

    const result: Project = {
      id: project.id,
      name: project.name,
      path: project.path,
      description: project.description,
      lastUpdated: project.last_updated,
      modules: [],
    };

    this.emit("project-changed", result.id);
    return result;
  }

  async updateProject(
    id: string,
    data: Partial<Pick<Project, "name" | "path" | "description">>
  ): Promise<Project> {
    const updates: Record<string, unknown> = {
      last_updated: new Date().toISOString(),
    };
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

    this.emit("project-changed", id);
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    await this.client.from("context_documents").delete().eq("project_id", id);
    const { error } = await this.client
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("org_id", this.orgId);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);

    this.emit("project-changed", id);
  }

  // ── Modules ───────────────────────────────────────────────────────

  async addModule(
    projectId: string,
    data: Pick<Module, "name" | "type" | "path" | "context">
  ): Promise<Module> {
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

    if (error || !mod)
      throw new Error(`Failed to add module: ${error?.message}`);

    await this.client
      .from("projects")
      .update({ last_updated: now })
      .eq("id", projectId);

    this.emit("project-changed", projectId);
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
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { last_updated: now };

    if (data.name !== undefined) updates.name = data.name;
    if (data.type !== undefined) updates.type = data.type;
    if (data.path !== undefined) updates.path = data.path;
    if (data.context !== undefined) updates.context = data.context;
    if (data.pendingContext !== undefined)
      updates.pending_context = data.pendingContext || null;
    if (data.pendingContextMeta !== undefined)
      updates.pending_context_meta = data.pendingContextMeta ?? null;
    if (data.lastAnalyzedAt !== undefined)
      updates.last_analyzed_at = data.lastAnalyzedAt;
    if (data.sourceFiles !== undefined) updates.source_files = data.sourceFiles;
    if (data.gitSnapshot !== undefined)
      updates.git_snapshot = data.gitSnapshot ?? null;
    if (data.staleness !== undefined)
      updates.staleness = data.staleness ?? null;

    const { data: mod, error } = await this.client
      .from("modules")
      .update(updates)
      .eq("id", moduleId)
      .eq("project_id", projectId)
      .select()
      .single();

    if (error || !mod)
      throw new Error(`Failed to update module: ${error?.message}`);

    await this.client
      .from("projects")
      .update({ last_updated: now })
      .eq("id", projectId);

    this.emit("project-changed", projectId);
    return this.mapModule(mod);
  }

  async deleteModule(projectId: string, moduleId: string): Promise<void> {
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

    this.emit("project-changed", projectId);
  }

  // ── Context Documents ─────────────────────────────────────────────

  async getFullContext(projectId: string): Promise<ContextDocument | null> {
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
    const now = new Date().toISOString();
    const { error } = await this.client.from("context_documents").upsert({
      project_id: projectId,
      full_context: fullContext,
      generated_at: now,
    });

    if (error) throw new Error(`Failed to save context: ${error.message}`);

    this.emit("project-changed", projectId);
    return { projectId, fullContext, generatedAt: now };
  }

  // ── Search ────────────────────────────────────────────────────────

  async searchContexts(
    query: string,
    projectId?: string
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const tsQuery = query
      .split(/\s+/)
      .filter(Boolean)
      .join(" & ");

    // Search projects
    let projectQuery = this.client
      .from("projects")
      .select("id, name, description")
      .eq("org_id", this.orgId)
      .textSearch("description", tsQuery, { type: "plain" });

    if (projectId) projectQuery = projectQuery.eq("id", projectId);

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

  // ── Helpers ───────────────────────────────────────────────────────

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

  // ── Team Members ─────────────────────────────────────────────────

  async listMembers(): Promise<
    Array<{ id: string; name: string; email: string | null; createdAt: string; keyCount: number }>
  > {
    const { data, error } = await this.client
      .from("members")
      .select("id, name, email, created_at, api_keys!api_keys_member_id_fkey(id, revoked_at)")
      .eq("org_id", this.orgId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list members: ${error.message}`);

    return (data || []).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      createdAt: m.created_at,
      keyCount: Array.isArray(m.api_keys)
        ? m.api_keys.filter((k: { revoked_at: string | null }) => !k.revoked_at).length
        : 0,
    }));
  }

  async createMember(data: {
    name: string;
    email?: string;
  }): Promise<{ id: string; name: string }> {
    const { data: member, error } = await this.client
      .from("members")
      .insert({
        org_id: this.orgId,
        name: data.name,
        email: data.email || null,
      })
      .select("id, name")
      .single();

    if (error || !member)
      throw new Error(`Failed to create member: ${error?.message}`);
    return member;
  }

  async deleteMember(memberId: string): Promise<void> {
    // Revoke all API keys first — ON DELETE SET NULL would otherwise
    // turn member keys into admin keys (member_id = NULL = full access)
    await this.client
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("member_id", memberId)
      .is("revoked_at", null);

    const { error } = await this.client
      .from("members")
      .delete()
      .eq("id", memberId)
      .eq("org_id", this.orgId);

    if (error) throw new Error(`Failed to delete member: ${error.message}`);
  }

  async getMember(memberId: string): Promise<{
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
  }> {
    const { data: member, error } = await this.client
      .from("members")
      .select("*")
      .eq("id", memberId)
      .eq("org_id", this.orgId)
      .single();

    if (error || !member)
      throw new Error(`Member not found: ${error?.message}`);

    const { data: keys } = await this.client
      .from("api_keys")
      .select("id, key_prefix, name, created_at, last_used_at, revoked_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });

    const { data: access } = await this.client
      .from("member_project_access")
      .select("project_id, granted_at, projects(name, path)")
      .eq("member_id", memberId);

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      createdAt: member.created_at,
      apiKeys: (keys || []).map((k) => ({
        id: k.id,
        keyPrefix: k.key_prefix,
        name: k.name,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
        revokedAt: k.revoked_at,
      })),
      projects: (access || []).map((a) => {
        const proj = a.projects as unknown as { name: string; path: string };
        return {
          id: a.project_id,
          name: proj?.name || "",
          path: proj?.path || "",
          grantedAt: a.granted_at,
        };
      }),
    };
  }

  async createApiKey(data: {
    keyHash: string;
    keyPrefix: string;
    name: string;
    memberId: string;
  }): Promise<{ id: string; keyPrefix: string; name: string; createdAt: string }> {
    const { data: key, error } = await this.client
      .from("api_keys")
      .insert({
        key_hash: data.keyHash,
        key_prefix: data.keyPrefix,
        name: data.name,
        org_id: this.orgId,
        member_id: data.memberId,
      })
      .select("id, key_prefix, name, created_at")
      .single();

    if (error || !key)
      throw new Error(`Failed to create API key: ${error?.message}`);
    return {
      id: key.id,
      keyPrefix: key.key_prefix,
      name: key.name,
      createdAt: key.created_at,
    };
  }

  async revokeApiKey(keyId: string): Promise<void> {
    const { error } = await this.client
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("org_id", this.orgId);

    if (error) throw new Error(`Failed to revoke key: ${error.message}`);
  }

  async assignProject(memberId: string, projectId: string): Promise<void> {
    const { error } = await this.client
      .from("member_project_access")
      .upsert(
        { member_id: memberId, project_id: projectId },
        { onConflict: "member_id,project_id" }
      );

    if (error) throw new Error(`Failed to assign project: ${error.message}`);
  }

  async unassignProject(memberId: string, projectId: string): Promise<void> {
    const { error } = await this.client
      .from("member_project_access")
      .delete()
      .eq("member_id", memberId)
      .eq("project_id", projectId);

    if (error) throw new Error(`Failed to unassign project: ${error.message}`);
  }
}

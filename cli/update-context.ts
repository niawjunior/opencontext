#!/usr/bin/env node
/**
 * Standalone CLI script to update Open Context context.
 *
 * Usage:
 *   node dist-mcp/cli/update-context.js [--project-path /path/to/project] [--changed-files file1 file2 ...]
 *
 * Can be used in:
 *   - Git hooks (husky pre-push)
 *   - CI/CD pipelines (GitHub Actions)
 *   - CLAUDE.md instructions (triggered by Claude Code)
 *   - Manual CLI invocation
 *
 * Environment:
 *   OPEN_CONTEXT_DATA_DIR — path to Open Context data directory
 */

import os from "node:os";
import path from "node:path";
import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
  orgId: string;
}

function getSupabaseConfig(): SupabaseConfig {
  // First try env vars
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.OPEN_CONTEXT_ORG_ID) {
    return {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      orgId: process.env.OPEN_CONTEXT_ORG_ID,
    };
  }

  // Fallback: read from Electron settings.json
  const settingsPath = getSettingsPath();
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    if (settings.supabaseUrl && settings.supabaseKey && settings.orgId) {
      return {
        supabaseUrl: settings.supabaseUrl,
        supabaseKey: settings.supabaseKey,
        orgId: settings.orgId,
      };
    }
  } catch {
    // Settings file doesn't exist or is invalid
  }

  throw new Error(
    "Supabase credentials not found. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPEN_CONTEXT_ORG_ID env vars, or configure in Open Context settings."
  );
}

function getSettingsPath(): string {
  const platform = process.platform;
  let dataDir: string;
  if (process.env.OPEN_CONTEXT_DATA_DIR) {
    dataDir = process.env.OPEN_CONTEXT_DATA_DIR;
  } else if (platform === "darwin") {
    dataDir = path.join(os.homedir(), "Library", "Application Support", "Open Context", "data");
  } else if (platform === "win32") {
    dataDir = path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Open Context",
      "data"
    );
  } else {
    dataDir = path.join(os.homedir(), ".config", "open-context", "data");
  }
  return path.join(dataDir, "settings.json");
}

function parseArgs(args: string[]): {
  projectPath: string;
  changedFiles: string[];
  regenerateAll: boolean;
  smart: boolean;
} {
  let projectPath = process.cwd();
  const changedFiles: string[] = [];
  let regenerateAll = false;
  let smart = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--project-path" && args[i + 1]) {
      projectPath = path.resolve(args[++i]);
    } else if (arg === "--changed-files") {
      // Consume all remaining args as files
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        changedFiles.push(args[++i]);
      }
    } else if (arg === "--regenerate-all" || arg === "--all") {
      regenerateAll = true;
    } else if (arg === "--smart") {
      smart = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Open Context — Update Context CLI

Usage:
  context-update [options]

Options:
  --project-path <path>     Project directory (default: cwd)
  --changed-files <files>   Space-separated list of changed files
  --regenerate-all          Regenerate full context from all modules
  --smart                   Use Claude Code to analyze changes and update contexts (background)
  --help                    Show this help message

Examples:
  # Auto-detect project and regenerate full context
  context-update --regenerate-all

  # Smart mode: use Claude Code to analyze and update (non-blocking)
  context-update --smart --changed-files src/components/Button.tsx

  # Legacy mode: just mark modules as stale
  context-update --changed-files $(git diff --name-only @{push})

Environment:
  OPEN_CONTEXT_DATA_DIR    Path to Open Context data directory
`);
      process.exit(0);
    }
  }

  return { projectPath, changedFiles, regenerateAll, smart };
}

interface SimpleStore {
  listProjects(orgId: string): Promise<Array<{ id: string; name: string; path: string; last_updated: string }>>;
  getProject(orgId: string, id: string): Promise<{
    id: string; name: string; path: string; description: string;
    modules: Array<{ id: string; name: string; type: string; path: string; context: string; pendingContext?: string; pendingContextMeta?: unknown }>;
  } | null>;
  updateModule(projectId: string, moduleId: string, data: Record<string, unknown>): Promise<void>;
  saveFullContext(projectId: string, fullContext: string): Promise<void>;
}

function createStore(config: SupabaseConfig): SimpleStore {
  const client = createClient(config.supabaseUrl, config.supabaseKey);

  return {
    async listProjects(orgId: string) {
      const { data, error } = await client
        .from("projects")
        .select("id, name, path, last_updated")
        .eq("org_id", orgId)
        .order("last_updated", { ascending: false });
      if (error) throw new Error(`Failed to list projects: ${error.message}`);
      return data || [];
    },

    async getProject(orgId: string, id: string) {
      const { data: project, error: pErr } = await client
        .from("projects")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .single();
      if (pErr || !project) return null;

      const { data: modules, error: mErr } = await client
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
        modules: (modules || []).map((m: Record<string, unknown>) => ({
          id: m.id as string,
          name: m.name as string,
          type: m.type as string,
          path: m.path as string,
          context: (m.context as string) || "",
          pendingContext: m.pending_context as string | undefined,
          pendingContextMeta: m.pending_context_meta,
        })),
      };
    },

    async updateModule(projectId: string, moduleId: string, data: Record<string, unknown>) {
      const updates: Record<string, unknown> = { last_updated: new Date().toISOString() };
      if (data.pendingContextMeta !== undefined) updates.pending_context_meta = data.pendingContextMeta ?? null;
      if (data.staleness !== undefined) updates.staleness = data.staleness ?? null;

      const { error } = await client
        .from("modules")
        .update(updates)
        .eq("id", moduleId)
        .eq("project_id", projectId);
      if (error) throw new Error(`Failed to update module: ${error.message}`);

      await client.from("projects").update({ last_updated: new Date().toISOString() }).eq("id", projectId);
    },

    async saveFullContext(projectId: string, fullContext: string) {
      const { error } = await client.from("context_documents").upsert({
        project_id: projectId,
        full_context: fullContext,
        generated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`Failed to save context: ${error.message}`);
    },
  };
}

async function findProject(store: SimpleStore, orgId: string, projectPath: string) {
  const projects = await store.listProjects(orgId);
  const normalized = projectPath.replace(/\/$/, "");

  let bestMatch = null;
  let bestLen = 0;
  for (const p of projects) {
    const pPath = p.path.replace(/\/$/, "");
    if (normalized === pPath || normalized.startsWith(pPath + "/")) {
      if (pPath.length > bestLen) {
        bestMatch = p;
        bestLen = pPath.length;
      }
    }
  }

  if (!bestMatch) return null;
  return store.getProject(orgId, bestMatch.id);
}

function buildFullContext(project: {
  name: string;
  description: string;
  path: string;
  modules: Array<{ name: string; type: string; path: string; context: string }>;
}): string {
  const typeLabels: Record<string, string> = {
    page: "Pages",
    component: "Components",
    module: "Modules",
    api: "APIs",
    hook: "Hooks",
    util: "Utilities",
    config: "Configuration",
  };

  const grouped = new Map<string, typeof project.modules>();
  for (const mod of project.modules) {
    const group = grouped.get(mod.type) || [];
    group.push(mod);
    grouped.set(mod.type, group);
  }

  const sections: string[] = [];
  sections.push(`# ${project.name}`);
  if (project.description) sections.push(`> ${project.description}`);
  sections.push(`**Path:** ${project.path}`);
  sections.push(`**Modules:** ${project.modules.length}`);

  if (project.modules.length > 0) {
    sections.push("## Modules");
    for (const [type, mods] of grouped.entries()) {
      sections.push(`### ${typeLabels[type] || type}`);
      for (const mod of mods) {
        sections.push(`#### ${mod.name}`);
        if (mod.path) sections.push(`**Path:** \`${mod.path}\``);
        sections.push(mod.context?.trim() || "*No context documented yet.*");
      }
    }
  }

  return sections.join("\n\n");
}

function findClaudeCli(): string | null {
  try {
    return execFileSync("which", ["claude"], { encoding: "utf-8", timeout: 5000 }).trim() || null;
  } catch {
    return null;
  }
}

function hasMcpJson(projectPath: string): boolean {
  try {
    const content = fs.readFileSync(path.join(projectPath, ".mcp.json"), "utf-8");
    const config = JSON.parse(content);
    const servers = config?.mcpServers || {};

    // Check if "open-context" server key exists
    if (servers["open-context"]) return true;

    // Also check server values for URL or args referencing open-context
    for (const server of Object.values(servers)) {
      const s = server as { url?: string; args?: string[] };
      if (s.url?.includes("open-context")) return true;
      if (s.args?.some((a: string) => a.includes("open-context") || a.includes("context-explorer"))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function spawnSmartUpdate(
  projectPath: string,
  projectId: string,
  projectName: string,
  modules: Array<{ id: string; name: string; type: string; path: string; context: string }>
): void {
  // Find the smart-context-update script (sibling to this file)
  const scriptPath = path.join(path.dirname(process.argv[1]), "smart-context-update.js");

  const payload = JSON.stringify({
    projectPath,
    projectId,
    projectName,
    modules: modules.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      path: m.path,
      currentContext: m.context,
    })),
  });

  // Spawn detached — this script exits, background process continues
  const child = nodeSpawn("node", [scriptPath, payload], {
    cwd: projectPath,
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();

  console.error(`[context-update] Smart update spawned in background (PID: ${child.pid})`);
}

async function main() {
  const { projectPath, changedFiles, regenerateAll, smart } = parseArgs(process.argv.slice(2));
  const config = getSupabaseConfig();
  const store = createStore(config);

  console.error(`[context-update] Looking for project at: ${projectPath}`);
  console.error(`[context-update] Using Supabase: ${config.supabaseUrl}`);

  const project = await findProject(store, config.orgId, projectPath);
  if (!project) {
    console.error(`[context-update] No project found for path: ${projectPath}`);
    console.error("[context-update] Register this project in Open Context first.");
    process.exit(1);
  }

  console.error(`[context-update] Found project: ${project.name} (${project.id})`);

  if (regenerateAll) {
    // Rebuild full context from all modules
    const content = buildFullContext(project);
    await store.saveFullContext(project.id, content);
    console.error(`[context-update] Full context regenerated (${content.length} chars)`);
    console.log(content);
    process.exit(0);
  }

  if (changedFiles.length > 0) {
    // Find modules affected by changed files
    const affectedModules = project.modules.filter((mod) =>
      changedFiles.some((f) => {
        const normalizedFile = f.replace(/^\.\//, "");
        return normalizedFile.startsWith(mod.path) || mod.path.includes(normalizedFile);
      })
    );

    if (affectedModules.length === 0) {
      console.error("[context-update] No registered modules affected by changed files.");
      console.error(`[context-update] Changed files: ${changedFiles.join(", ")}`);
      process.exit(0);
    }

    console.error(`[context-update] Affected modules: ${affectedModules.map((m) => m.name).join(", ")}`);

    // Smart mode: use Claude Code to analyze and update (background)
    if (smart) {
      const modulesWithContext = affectedModules.filter((m) => m.context?.trim());
      if (modulesWithContext.length === 0) {
        console.error("[context-update] No affected modules have existing context — skipping smart update");
      } else if (!findClaudeCli()) {
        console.error("[context-update] Claude CLI not found — falling back to stale marking");
      } else if (!hasMcpJson(projectPath)) {
        console.error("[context-update] .mcp.json not found — falling back to stale marking");
      } else {
        console.error(`[context-update] Smart mode: spawning Claude Code for ${modulesWithContext.length} module(s)`);
        spawnSmartUpdate(projectPath, project.id, project.name, modulesWithContext);
        // Also rebuild full context with current data
        const content = buildFullContext(project);
        await store.saveFullContext(project.id, content);
        console.error(`[context-update] Full context rebuilt (${content.length} chars)`);
        process.exit(0);
      }
      // If we reach here, smart mode failed — fall through to legacy behavior
      console.error("[context-update] Falling back to legacy stale-marking mode");
    }

    // Legacy mode: mark modules as stale
    const staleModules = affectedModules.filter((m) => m.context?.trim());
    if (staleModules.length > 0) {
      console.error(`[context-update] Marking ${staleModules.length} modules as stale:`);
      for (const mod of staleModules) {
        console.error(`  - ${mod.name} (${mod.type}) at ${mod.path}`);
        await store.updateModule(project.id, mod.id, {
          pendingContextMeta: {
            updatedAt: new Date().toISOString(),
            source: "git-hook",
          },
        });
      }
    }

    // Rebuild full context with current data
    const content = buildFullContext(project);
    await store.saveFullContext(project.id, content);
    console.error(`[context-update] Full context rebuilt (${content.length} chars)`);

    // Output affected module names for use in automation
    console.log(JSON.stringify({
      project: project.name,
      affectedModules: affectedModules.map((m) => ({
        name: m.name,
        type: m.type,
        path: m.path,
        hasContext: !!m.context?.trim(),
      })),
      fullContextRebuilt: true,
    }, null, 2));
  } else {
    // No specific files — just rebuild full context
    const content = buildFullContext(project);
    await store.saveFullContext(project.id, content);
    console.error(`[context-update] Full context regenerated (${content.length} chars)`);
    console.log(content);
  }
}

main().catch((err) => {
  const msg = err.message || err;
  if (msg.includes("credentials not found")) {
    console.error("[context-update] Skipped: Open Context not configured on this machine.");
    console.error("[context-update] Install the Open Context desktop app or set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPEN_CONTEXT_ORG_ID env vars.");
    process.exit(0); // Don't fail the push
  }
  console.error("[context-update] Error:", msg);
  process.exit(1);
});

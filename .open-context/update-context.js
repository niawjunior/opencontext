#!/usr/bin/env node
"use strict";
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
 * Credentials (checked in order):
 *   1. .mcp.json in project dir → uses REST API with API key (developer path)
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars → direct Supabase (CI/CD path)
 *   3. Electron settings.json → direct Supabase (admin path)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
// ─── Config Resolution ───────────────────────────────
/**
 * Parse an open-context server entry from an .mcp.json config object.
 * Returns { url, apiKey } if found, or null.
 */
function parseOpenContextServer(config) {
    // Try both "open-context" and "context-explorer" as server names
    const server = config?.mcpServers?.["open-context"] ||
        config?.mcpServers?.["context-explorer"];
    if (!server?.url)
        return null;
    const authHeader = server.headers?.Authorization || server.headers?.authorization || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    return { url: server.url, apiKey };
}
/**
 * Read .mcp.json from a specific path. Returns parsed JSON or null.
 */
function readMcpJson(filePath) {
    try {
        return JSON.parse(node_fs_1.default.readFileSync(filePath, "utf-8"));
    }
    catch {
        return null;
    }
}
/**
 * Extract open-context server config from ~/.claude.json
 * Claude Code stores MCP servers in two places within this file:
 * - `mcpServers` (user scope — global)
 * - `projects[projectPath].mcpServers` (local scope — per-project)
 */
function parseClaudeJson(projectPath) {
    const claudeJsonPath = node_path_1.default.join(node_os_1.default.homedir(), ".claude.json");
    const config = readMcpJson(claudeJsonPath);
    if (!config)
        return null;
    // Check local scope first (project-specific, highest priority)
    const projectConfig = config.projects?.[projectPath];
    if (projectConfig?.mcpServers) {
        const parsed = parseOpenContextServer({ mcpServers: projectConfig.mcpServers });
        if (parsed?.url && parsed?.apiKey)
            return parsed;
    }
    // Then check user scope (global)
    if (config.mcpServers) {
        const parsed = parseOpenContextServer({ mcpServers: config.mcpServers });
        if (parsed?.url && parsed?.apiKey)
            return parsed;
    }
    return null;
}
/**
 * Resolve API config by checking multiple locations where the MCP server
 * URL and API key might be stored:
 *
 * 1. Project .mcp.json — committed to git, may have URL + key or just URL
 * 2. ~/.claude.json local scope — per-project config from `claude mcp add`
 * 3. ~/.claude.json user scope — global config from `claude mcp add --scope user`
 *
 * In a typical team setup:
 * - Project .mcp.json is committed with just the URL (no key)
 * - Each developer runs `claude mcp add` which writes their API key
 *   to ~/.claude.json (local or user scope)
 *
 * The function merges: URL from project-level, API key from whichever has it.
 */
function getApiConfig(projectPath) {
    let serverUrl = null;
    let apiKey = null;
    // 1. Check project .mcp.json (committed to git)
    const projectMcp = readMcpJson(node_path_1.default.join(projectPath, ".mcp.json"));
    if (projectMcp) {
        const parsed = parseOpenContextServer(projectMcp);
        if (parsed?.url)
            serverUrl = parsed.url;
        if (parsed?.apiKey)
            apiKey = parsed.apiKey;
    }
    // 2. Check ~/.claude.json (local scope then user scope)
    if (!serverUrl || !apiKey) {
        const claudeConfig = parseClaudeJson(projectPath);
        if (claudeConfig) {
            if (!serverUrl)
                serverUrl = claudeConfig.url;
            if (!apiKey)
                apiKey = claudeConfig.apiKey;
        }
    }
    if (!serverUrl || !apiKey)
        return null;
    try {
        const mcpUrl = new URL(serverUrl);
        const apiUrl = `${mcpUrl.protocol}//${mcpUrl.host}`;
        return { type: "remote", apiUrl, apiKey };
    }
    catch {
        return null;
    }
}
function getSupabaseConfig() {
    // Try env vars first
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.OPEN_CONTEXT_ORG_ID) {
        return {
            type: "supabase",
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            orgId: process.env.OPEN_CONTEXT_ORG_ID,
        };
    }
    // Fallback: read from Electron settings.json
    const settingsPath = getSettingsPath();
    try {
        const raw = node_fs_1.default.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(raw);
        if (settings.supabaseUrl && settings.supabaseKey && settings.orgId) {
            return {
                type: "supabase",
                supabaseUrl: settings.supabaseUrl,
                supabaseKey: settings.supabaseKey,
                orgId: settings.orgId,
            };
        }
    }
    catch {
        // Settings file doesn't exist or is invalid
    }
    return null;
}
function getSettingsPath() {
    const platform = process.platform;
    let dataDir;
    if (process.env.OPEN_CONTEXT_DATA_DIR) {
        dataDir = process.env.OPEN_CONTEXT_DATA_DIR;
    }
    else if (platform === "darwin") {
        dataDir = node_path_1.default.join(node_os_1.default.homedir(), "Library", "Application Support", "Open Context", "data");
    }
    else if (platform === "win32") {
        dataDir = node_path_1.default.join(process.env.APPDATA || node_path_1.default.join(node_os_1.default.homedir(), "AppData", "Roaming"), "Open Context", "data");
    }
    else {
        dataDir = node_path_1.default.join(node_os_1.default.homedir(), ".config", "open-context", "data");
    }
    return node_path_1.default.join(dataDir, "settings.json");
}
function resolveConfig(projectPath) {
    // 1. Try .mcp.json (developer path — no desktop app needed)
    const apiConfig = getApiConfig(projectPath);
    if (apiConfig)
        return apiConfig;
    // 2. Try env vars or settings.json (admin/CI path)
    const supabaseConfig = getSupabaseConfig();
    if (supabaseConfig)
        return supabaseConfig;
    // Give a helpful hint if we found .mcp.json but it was missing the API key
    const projectMcp = readMcpJson(node_path_1.default.join(projectPath, ".mcp.json"));
    const hasServer = projectMcp && parseOpenContextServer(projectMcp);
    if (hasServer && !hasServer.apiKey) {
        throw new Error("found open-context server in .mcp.json but no API key. " +
            "Run: claude mcp add open-context --type http --url <URL> --header 'Authorization: Bearer oc_live_...'");
    }
    throw new Error("credentials not found");
}
// ─── Store Implementations ───────────────────────────
function createRemoteStore(config) {
    const { apiUrl, apiKey } = config;
    async function call(action, params = {}) {
        const res = await fetch(`${apiUrl}/api/context`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ action, ...params }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(`API error (${res.status}): ${body.error || res.statusText}`);
        }
        return res.json();
    }
    return {
        async listProjects() {
            const data = await call("listProjects");
            return data.projects;
        },
        async getProject(id) {
            try {
                const data = await call("getProject", { projectId: id });
                const project = data.project;
                // Normalize module fields from remote format
                return {
                    ...project,
                    modules: (project.modules || []).map((m) => ({
                        id: m.id,
                        name: m.name,
                        type: m.type,
                        path: m.path,
                        context: m.context || "",
                        pendingContext: m.pendingContext || m.pending_context,
                        pendingContextMeta: m.pendingContextMeta || m.pending_context_meta,
                    })),
                };
            }
            catch {
                return null;
            }
        },
        async updateModule(projectId, moduleId, data) {
            await call("updateModule", { projectId, moduleId, data });
        },
        async saveFullContext(projectId, fullContext) {
            await call("saveFullContext", { projectId, content: fullContext });
        },
    };
}
function createSupabaseStore(config) {
    // Dynamic import to avoid requiring @supabase/supabase-js when using remote API
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@supabase/supabase-js");
    const client = createClient(config.supabaseUrl, config.supabaseKey);
    return {
        async listProjects() {
            const { data, error } = await client
                .from("projects")
                .select("id, name, path, last_updated")
                .eq("org_id", config.orgId)
                .order("last_updated", { ascending: false });
            if (error)
                throw new Error(`Failed to list projects: ${error.message}`);
            return data || [];
        },
        async getProject(id) {
            const { data: project, error: pErr } = await client
                .from("projects")
                .select("*")
                .eq("id", id)
                .eq("org_id", config.orgId)
                .single();
            if (pErr || !project)
                return null;
            const { data: modules, error: mErr } = await client
                .from("modules")
                .select("*")
                .eq("project_id", id)
                .order("name");
            if (mErr)
                throw new Error(`Failed to load modules: ${mErr.message}`);
            return {
                id: project.id,
                name: project.name,
                path: project.path,
                description: project.description,
                modules: (modules || []).map((m) => ({
                    id: m.id,
                    name: m.name,
                    type: m.type,
                    path: m.path,
                    context: m.context || "",
                    pendingContext: m.pending_context,
                    pendingContextMeta: m.pending_context_meta,
                })),
            };
        },
        async updateModule(projectId, moduleId, data) {
            const updates = { last_updated: new Date().toISOString() };
            if (data.pendingContextMeta !== undefined)
                updates.pending_context_meta = data.pendingContextMeta ?? null;
            if (data.staleness !== undefined)
                updates.staleness = data.staleness ?? null;
            const { error } = await client
                .from("modules")
                .update(updates)
                .eq("id", moduleId)
                .eq("project_id", projectId);
            if (error)
                throw new Error(`Failed to update module: ${error.message}`);
            await client.from("projects").update({ last_updated: new Date().toISOString() }).eq("id", projectId);
        },
        async saveFullContext(projectId, fullContext) {
            const { error } = await client.from("context_documents").upsert({
                project_id: projectId,
                full_context: fullContext,
                generated_at: new Date().toISOString(),
            });
            if (error)
                throw new Error(`Failed to save context: ${error.message}`);
        },
    };
}
function createStore(config) {
    if (config.type === "remote")
        return createRemoteStore(config);
    return createSupabaseStore(config);
}
// ─── Args ────────────────────────────────────────────
function parseArgs(args) {
    let projectPath = process.cwd();
    const changedFiles = [];
    let regenerateAll = false;
    let smart = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--project-path" && args[i + 1]) {
            projectPath = node_path_1.default.resolve(args[++i]);
        }
        else if (arg === "--changed-files") {
            while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                changedFiles.push(args[++i]);
            }
        }
        else if (arg === "--regenerate-all" || arg === "--all") {
            regenerateAll = true;
        }
        else if (arg === "--smart") {
            smart = true;
        }
        else if (arg === "--help" || arg === "-h") {
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

Credentials (checked in order):
  1. .mcp.json in project dir (API key → remote REST API)
  2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + OPEN_CONTEXT_ORG_ID env vars
  3. Open Context desktop app settings
`);
            process.exit(0);
        }
    }
    return { projectPath, changedFiles, regenerateAll, smart };
}
// ─── Helpers ─────────────────────────────────────────
async function findProject(store, projectPath) {
    const projects = await store.listProjects();
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
    if (!bestMatch)
        return null;
    return store.getProject(bestMatch.id);
}
function buildFullContext(project) {
    const typeLabels = {
        page: "Pages",
        component: "Components",
        module: "Modules",
        api: "APIs",
        hook: "Hooks",
        util: "Utilities",
        config: "Configuration",
    };
    const grouped = new Map();
    for (const mod of project.modules) {
        const group = grouped.get(mod.type) || [];
        group.push(mod);
        grouped.set(mod.type, group);
    }
    const sections = [];
    sections.push(`# ${project.name}`);
    if (project.description)
        sections.push(`> ${project.description}`);
    sections.push(`**Path:** ${project.path}`);
    sections.push(`**Modules:** ${project.modules.length}`);
    if (project.modules.length > 0) {
        sections.push("## Modules");
        for (const [type, mods] of grouped.entries()) {
            sections.push(`### ${typeLabels[type] || type}`);
            for (const mod of mods) {
                sections.push(`#### ${mod.name}`);
                if (mod.path)
                    sections.push(`**Path:** \`${mod.path}\``);
                sections.push(mod.context?.trim() || "*No context documented yet.*");
            }
        }
    }
    return sections.join("\n\n");
}
function findClaudeCli() {
    try {
        return (0, node_child_process_1.execFileSync)("which", ["claude"], { encoding: "utf-8", timeout: 5000 }).trim() || null;
    }
    catch {
        return null;
    }
}
function hasMcpJson(projectPath) {
    try {
        const content = node_fs_1.default.readFileSync(node_path_1.default.join(projectPath, ".mcp.json"), "utf-8");
        const config = JSON.parse(content);
        const servers = config?.mcpServers || {};
        if (servers["open-context"])
            return true;
        for (const server of Object.values(servers)) {
            const s = server;
            if (s.url?.includes("open-context"))
                return true;
            if (s.args?.some((a) => a.includes("open-context") || a.includes("context-explorer")))
                return true;
        }
        return false;
    }
    catch {
        return false;
    }
}
function spawnSmartUpdate(projectPath, projectId, projectName, modules) {
    const scriptPath = node_path_1.default.join(node_path_1.default.dirname(process.argv[1]), "smart-context-update.js");
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
    const child = (0, node_child_process_1.spawn)("node", [scriptPath, payload], {
        cwd: projectPath,
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
    });
    child.unref();
    console.error(`[context-update] Smart update spawned in background (PID: ${child.pid})`);
}
// ─── Main ────────────────────────────────────────────
async function main() {
    const { projectPath, changedFiles, regenerateAll, smart } = parseArgs(process.argv.slice(2));
    const config = resolveConfig(projectPath);
    const store = createStore(config);
    const source = config.type === "remote" ? `REST API (${config.apiUrl})` : `Supabase (${config.supabaseUrl})`;
    console.error(`[context-update] Looking for project at: ${projectPath}`);
    console.error(`[context-update] Using: ${source}`);
    const project = await findProject(store, projectPath);
    if (!project) {
        console.error(`[context-update] No project found for path: ${projectPath}`);
        console.error("[context-update] Register this project in Open Context first.");
        process.exit(1);
    }
    console.error(`[context-update] Found project: ${project.name} (${project.id})`);
    if (regenerateAll) {
        const content = buildFullContext(project);
        await store.saveFullContext(project.id, content);
        console.error(`[context-update] Full context regenerated (${content.length} chars)`);
        console.log(content);
        process.exit(0);
    }
    if (changedFiles.length > 0) {
        const affectedModules = project.modules.filter((mod) => changedFiles.some((f) => {
            const normalizedFile = f.replace(/^\.\//, "");
            return normalizedFile.startsWith(mod.path) || mod.path.includes(normalizedFile);
        }));
        if (affectedModules.length === 0) {
            console.error("[context-update] No registered modules affected by changed files.");
            console.error(`[context-update] Changed files: ${changedFiles.join(", ")}`);
            process.exit(0);
        }
        console.error(`[context-update] Affected modules: ${affectedModules.map((m) => m.name).join(", ")}`);
        if (smart) {
            const modulesWithContext = affectedModules.filter((m) => m.context?.trim());
            if (modulesWithContext.length === 0) {
                console.error("[context-update] No affected modules have existing context — skipping smart update");
            }
            else if (!findClaudeCli()) {
                console.error("[context-update] Claude CLI not found — falling back to stale marking");
            }
            else if (!hasMcpJson(projectPath)) {
                console.error("[context-update] .mcp.json not found — falling back to stale marking");
            }
            else {
                console.error(`[context-update] Smart mode: spawning Claude Code for ${modulesWithContext.length} module(s)`);
                spawnSmartUpdate(projectPath, project.id, project.name, modulesWithContext);
                const content = buildFullContext(project);
                await store.saveFullContext(project.id, content);
                console.error(`[context-update] Full context rebuilt (${content.length} chars)`);
                process.exit(0);
            }
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
        const content = buildFullContext(project);
        await store.saveFullContext(project.id, content);
        console.error(`[context-update] Full context rebuilt (${content.length} chars)`);
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
    }
    else {
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
        console.error("[context-update] Ensure .mcp.json has an API key, or install the Open Context desktop app.");
        process.exit(0); // Don't fail the push
    }
    console.error("[context-update] Error:", msg);
    process.exit(1);
});
//# sourceMappingURL=update-context.js.map
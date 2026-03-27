import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SupabaseDataStore } from "../lib/supabase-store.js";
import { validateApiKey } from "../lib/auth.js";

export const config = {
  maxDuration: 30,
};

/**
 * Lightweight REST API for the CLI update-context script.
 * Allows developers to use their API key (from .mcp.json) instead of
 * requiring direct Supabase credentials or the desktop app.
 *
 * POST /api/context
 * Authorization: Bearer oc_live_...
 * { "action": "listProjects" | "getProject" | "updateModule" | "saveFullContext", ... }
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = await validateApiKey(req.headers.authorization ?? null);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return;
  }

  const store = new SupabaseDataStore(auth.orgId, auth.memberId);
  const { action, ...params } = req.body || {};

  try {
    switch (action) {
      case "listProjects": {
        const projects = await store.listProjects();
        res.status(200).json({ projects });
        break;
      }

      case "getProject": {
        const { projectId } = params;
        if (!projectId) {
          res.status(400).json({ error: "projectId is required" });
          return;
        }
        const project = await store.getProject(projectId);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        res.status(200).json({ project });
        break;
      }

      case "updateModule": {
        const { projectId, moduleId, data } = params;
        if (!projectId || !moduleId || !data) {
          res.status(400).json({ error: "projectId, moduleId, and data are required" });
          return;
        }
        await store.updateModule(projectId, moduleId, data);
        res.status(200).json({ success: true });
        break;
      }

      case "saveFullContext": {
        const { projectId, content } = params;
        if (!projectId || !content) {
          res.status(400).json({ error: "projectId and content are required" });
          return;
        }
        await store.saveFullContext(projectId, content);
        res.status(200).json({ success: true });
        break;
      }

      default:
        res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    res.status(500).json({ error: message });
  }
}

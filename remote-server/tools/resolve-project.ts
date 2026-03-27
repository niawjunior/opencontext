import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IDataStore } from "../shared/data-store-interface.js";

export function registerResolveProjectTool(
  server: McpServer,
  store: IDataStore
): void {
  server.tool(
    "resolve_project",
    "Find a project by working directory path or name. Pass cwd for auto-detection from your current directory, or query to search by name.",
    {
      cwd: z
        .string()
        .optional()
        .describe(
          "Current working directory — auto-detects the project whose path is a prefix of cwd (longest match wins)"
        ),
      query: z
        .string()
        .optional()
        .describe(
          "Search query to filter projects by name or path"
        ),
    },
    async ({ cwd, query }) => {
      const projects = await store.listProjects();

      // Auto-detect by cwd (longest prefix match)
      if (cwd) {
        const normalized = cwd.replace(/\/$/, "");
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
        if (bestMatch) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**${bestMatch.name}** (ID: ${bestMatch.id})\nPath: ${bestMatch.path}\nLast Updated: ${bestMatch.lastUpdated}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `No project found for directory "${cwd}". Register this project in the Open Context desktop app first.`,
            },
          ],
        };
      }

      let results = projects;
      if (query) {
        const q = query.toLowerCase();
        results = projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.path.toLowerCase().includes(q)
        );
      }

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: query
                ? `No projects found matching "${query}". Use resolve_project without a query to list all projects.`
                : "No projects registered yet. Add projects through the Open Context desktop app.",
            },
          ],
        };
      }

      const text = results
        .map(
          (p) =>
            `- **${p.name}** (ID: ${p.id})\n  Path: ${p.path}\n  Last Updated: ${p.lastUpdated}`
        )
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );
}

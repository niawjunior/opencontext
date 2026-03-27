import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IDataStore } from "../shared/data-store-interface.js";

export function registerListModulesTool(
  server: McpServer,
  store: IDataStore
): void {
  server.tool(
    "list_modules",
    "List all modules in a project with their types, paths, and context status.",
    {
      projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
      const project = await store.getProject(projectId);
      if (!project) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Project not found with ID: ${projectId}. Use resolve_project to find valid project IDs.`,
            },
          ],
          isError: true,
        };
      }

      if (project.modules.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Project "${project.name}" has no modules registered yet. Add modules through the Open Context desktop app.`,
            },
          ],
        };
      }

      const listing = project.modules
        .map(
          (m) =>
            `- **${m.name}** (${m.type}) — ID: ${m.id}\n  Path: \`${m.path}\`\n  Has context: ${m.context?.trim() ? "yes" : "no"}${m.lastAnalyzedAt ? `\n  Last analyzed: ${m.lastAnalyzedAt}` : ""}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Modules in "${project.name}" (${project.modules.length} total):\n\n${listing}`,
          },
        ],
      };
    }
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DataStore } from "../../electron/store/data-store.js";

export function registerSearchContextTool(
  server: McpServer,
  store: DataStore
): void {
  server.tool(
    "search_context",
    "Search across all project contexts for a keyword or phrase. Returns matching projects and modules with relevant snippets.",
    {
      query: z.string().describe("Search query string"),
      projectId: z
        .string()
        .optional()
        .describe("Optional: limit search to a specific project ID"),
    },
    async ({ query, projectId }) => {
      const results = await store.searchContexts(query, projectId);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No results found for "${query}".${
                projectId
                  ? " Try searching without a project filter."
                  : ""
              }`,
            },
          ],
        };
      }

      const text = results
        .map((r) => {
          const location = r.moduleName
            ? `${r.projectName} > ${r.moduleName}`
            : r.projectName;
          return `### ${location}\n**Project ID:** ${r.projectId}${
            r.moduleId ? `\n**Module ID:** ${r.moduleId}` : ""
          }\n\n${r.snippet}`;
        })
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} result(s) for "${query}":\n\n${text}`,
          },
        ],
      };
    }
  );
}

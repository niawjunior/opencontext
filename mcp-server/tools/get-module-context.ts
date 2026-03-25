import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DataStore } from "../../electron/store/data-store.js";

export function registerGetModuleContextTool(
  server: McpServer,
  store: DataStore
): void {
  server.tool(
    "get_module_context",
    "Get detailed context for a specific module by ID or file path. Use list_modules first to see available modules.",
    {
      projectId: z.string().describe("The project ID"),
      moduleId: z
        .string()
        .optional()
        .describe(
          "The module ID. If omitted along with modulePath, lists all modules."
        ),
      modulePath: z
        .string()
        .optional()
        .describe(
          "Alternative: find module by its file path (relative to project root)"
        ),
    },
    async ({ projectId, moduleId, modulePath }) => {
      const project = await store.getProject(projectId);
      if (!project) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Project not found with ID: ${projectId}`,
            },
          ],
          isError: true,
        };
      }

      if (!moduleId && !modulePath) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Either moduleId or modulePath is required. Use list_modules to see available modules.",
            },
          ],
          isError: true,
        };
      }

      // Find specific module
      const mod = project.modules.find(
        (m) => m.id === moduleId || m.path === modulePath
      );

      if (!mod) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Module not found. ${
                moduleId
                  ? `ID: ${moduleId}`
                  : `Path: ${modulePath}`
              }. Use get_module_context with just projectId to list available modules.`,
            },
          ],
          isError: true,
        };
      }

      const text = `# ${mod.name} (${mod.type})\n\n**Path:** \`${mod.path}\`\n**Last Updated:** ${mod.lastUpdated}\n\n${mod.context}`;

      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IDataStore } from "../shared/data-store-interface.js";

export function registerUpdateModuleContextTool(
  server: McpServer,
  store: IDataStore
): void {
  server.tool(
    "update_module_context",
    "Update a module's context documentation after making significant code changes. Enables bidirectional context sync — Claude can push updated context back to Open Context.",
    {
      projectId: z.string().describe("The project ID"),
      moduleId: z
        .string()
        .optional()
        .describe("The module ID to update"),
      modulePath: z
        .string()
        .optional()
        .describe("Alternative: find module by its file path (relative to project root)"),
      context: z
        .string()
        .describe("The new context markdown to save for this module"),
    },
    async ({ projectId, moduleId, modulePath, context }) => {
      if (!moduleId && !modulePath) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Either moduleId or modulePath is required. Use list_modules to find available modules.",
            },
          ],
          isError: true,
        };
      }

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

      const mod = project.modules.find(
        (m) => m.id === moduleId || m.path === modulePath
      );

      if (!mod) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Module not found. ${
                moduleId ? `ID: ${moduleId}` : `Path: ${modulePath}`
              }. Use list_modules to see available modules.`,
            },
          ],
          isError: true,
        };
      }

      const hadPending = !!mod.pendingContext;

      await store.updateModule(projectId, mod.id, {
        pendingContext: context,
        pendingContextMeta: {
          updatedAt: new Date().toISOString(),
          source: "mcp",
          previousPendingAt: hadPending ? mod.pendingContextMeta?.updatedAt : undefined,
        },
      });

      const msg = hadPending
        ? `Context update queued for module "${mod.name}" (replaced prior pending update). Pending review in the Open Context app.`
        : `Context update queued for module "${mod.name}" (${mod.type}) in project "${project.name}". Pending review in the Open Context app.`;

      return {
        content: [{ type: "text" as const, text: msg }],
      };
    }
  );
}

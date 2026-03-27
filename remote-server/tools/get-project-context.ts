import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IDataStore } from "../shared/data-store-interface.js";
import type { Project } from "../shared/types.js";

export function registerGetProjectContextTool(
  server: McpServer,
  store: IDataStore
): void {
  server.tool(
    "get_project_context",
    "Get the full context document (llms.txt format) for a project. This includes project description, architecture, and all module contexts. Use resolve_project first to get the project ID.",
    {
      projectId: z
        .string()
        .describe("The project ID (UUID) obtained from resolve_project"),
      format: z
        .enum(["full", "summary"])
        .optional()
        .default("full")
        .describe(
          "full = complete llms.txt with all modules; summary = project overview only"
        ),
    },
    async ({ projectId, format }) => {
      // Try pre-generated full context first
      if (format === "full") {
        const contextDoc = await store.getFullContext(projectId);
        if (contextDoc) {
          return {
            content: [{ type: "text" as const, text: contextDoc.fullContext }],
          };
        }
      }

      // Build from project data
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

      const text = buildLlmsTxt(project, format || "full");
      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );
}

function buildLlmsTxt(project: Project, format: string): string {
  let doc = `# ${project.name}\n\n`;
  doc += `> ${project.description}\n\n`;
  doc += `**Path:** ${project.path}\n`;
  doc += `**Last Updated:** ${project.lastUpdated}\n`;
  doc += `**Modules:** ${project.modules.length}\n\n`;

  if (format === "summary") return doc;

  // Group modules by type
  const grouped = new Map<string, typeof project.modules>();
  for (const mod of project.modules) {
    const group = grouped.get(mod.type) || [];
    group.push(mod);
    grouped.set(mod.type, group);
  }

  for (const [type, modules] of grouped) {
    doc += `## ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
    for (const mod of modules) {
      doc += `### ${mod.name}\n`;
      doc += `**Path:** \`${mod.path}\`\n\n`;
      doc += mod.context + "\n\n";
    }
  }

  return doc;
}

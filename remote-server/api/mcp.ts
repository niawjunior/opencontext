import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SupabaseDataStore } from "../lib/supabase-store.js";
import { validateApiKey } from "../lib/auth.js";
import { IncomingMessage, ServerResponse } from "node:http";

// Import tool registration functions
import { registerResolveProjectTool } from "../tools/resolve-project.js";
import { registerGetProjectContextTool } from "../tools/get-project-context.js";
import { registerSearchContextTool } from "../tools/search-context.js";
import { registerGetModuleContextTool } from "../tools/get-module-context.js";
import { registerListModulesTool } from "../tools/list-modules.js";
import { registerUpdateModuleContextTool } from "../tools/update-module-context.js";

export const config = {
  supportsResponseStreaming: true,
  maxDuration: 60,
};

function createServer(orgId: string, memberId: string | null = null) {
  const store = new SupabaseDataStore(orgId, memberId);
  const server = new McpServer({
    name: "open-context",
    version: "1.0.0",
  });

  const s = server as unknown as Parameters<typeof registerResolveProjectTool>[0];
  registerResolveProjectTool(s, store);
  registerGetProjectContextTool(s, store);
  registerSearchContextTool(s, store);
  registerGetModuleContextTool(s, store);
  registerListModulesTool(s, store);
  registerUpdateModuleContextTool(s, store);

  return server;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === "DELETE") {
    res.status(405).end();
    return;
  }

  const auth = await validateApiKey(req.headers.authorization ?? null);
  if (!auth) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized: invalid or missing API key" },
      id: null,
    });
    return;
  }

  const server = createServer(auth.orgId, auth.memberId);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await server.connect(transport);

  try {
    await transport.handleRequest(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      req.body
    );
  } finally {
    await transport.close();
    await server.close();
  }
}

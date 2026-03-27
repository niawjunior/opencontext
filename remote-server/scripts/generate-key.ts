#!/usr/bin/env npx tsx
/**
 * Generate an API key for the Open Context remote MCP server.
 *
 * Usage:
 *   npx tsx remote-server/scripts/generate-key.ts --org-id <uuid> [--name "My Key"]
 *
 * Environment:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = process.argv.slice(2);
  let orgId = "";
  let name = "Default";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--org-id" && args[i + 1]) {
      orgId = args[++i];
    } else if (args[i] === "--name" && args[i + 1]) {
      name = args[++i];
    }
  }

  if (!orgId) {
    console.error("Usage: generate-key --org-id <uuid> [--name \"My Key\"]");
    process.exit(1);
  }

  return { orgId, name };
}

async function main() {
  const { orgId, name } = parseArgs();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    process.exit(1);
  }

  // Generate a random API key
  const rawKey = crypto.randomBytes(32).toString("base64url");
  const apiKey = `oc_live_${rawKey}`;
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const keyPrefix = apiKey.slice(0, 16) + "...";

  const client = createClient(url, key);

  const { error } = await client.from("api_keys").insert({
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name,
    org_id: orgId,
  });

  if (error) {
    console.error(`Failed to insert API key: ${error.message}`);
    process.exit(1);
  }

  console.log("\n  API key generated successfully!\n");
  console.log(`  Key:    ${apiKey}`);
  console.log(`  Name:   ${name}`);
  console.log(`  Org ID: ${orgId}`);
  console.log(`\n  Save this key — it will not be shown again.\n`);
  console.log("  Add to Claude Code:");
  console.log(`  claude mcp add --transport http open-context https://open-context-mcp.vercel.app/mcp \\`);
  console.log(`    --header "Authorization: Bearer ${apiKey}"\n`);
}

main().catch((err) => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});

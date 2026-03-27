#!/usr/bin/env npx tsx
/**
 * Migrate local Open Context data into Supabase.
 *
 * Reads project JSON files from ~/Library/Application Support/open-context/data/
 * and inserts them into Supabase (projects, modules, context_documents tables).
 *
 * Usage:
 *   npx tsx remote-server/scripts/migrate-local.ts --org-id <uuid>
 *
 * Environment:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = process.argv.slice(2);
  let orgId = "";
  let dataDir = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--org-id" && args[i + 1]) {
      orgId = args[++i];
    } else if (args[i] === "--data-dir" && args[i + 1]) {
      dataDir = args[++i];
    }
  }

  if (!orgId) {
    console.error("Usage: migrate-local --org-id <uuid> [--data-dir <path>]");
    process.exit(1);
  }

  if (!dataDir) {
    dataDir = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "open-context",
      "data"
    );
  }

  return { orgId, dataDir };
}

async function main() {
  const { orgId, dataDir } = parseArgs();

  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Error: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
    process.exit(1);
  }

  const client = createClient(url, key);

  // Read project files
  const projectsDir = path.join(dataDir, "projects");
  const contextsDir = path.join(dataDir, "contexts");

  if (!fs.existsSync(projectsDir)) {
    console.error(`Projects directory not found: ${projectsDir}`);
    process.exit(1);
  }

  const projectFiles = fs
    .readdirSync(projectsDir)
    .filter((f) => f.endsWith(".json"));

  console.log(`\n  Found ${projectFiles.length} project(s) to migrate\n`);

  for (const file of projectFiles) {
    const filePath = path.join(projectsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const project = JSON.parse(raw);

    console.log(`  Migrating project: ${project.name} (${project.id})`);

    // Insert project
    const { error: projectError } = await client.from("projects").upsert(
      {
        id: project.id,
        org_id: orgId,
        name: project.name,
        path: project.path,
        description: project.description || "",
        last_updated: project.lastUpdated || new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (projectError) {
      console.error(
        `    Failed to insert project: ${projectError.message}`
      );
      continue;
    }
    console.log(`    Project inserted`);

    // Insert modules
    const modules = project.modules || [];
    let moduleCount = 0;

    for (const mod of modules) {
      const { error: moduleError } = await client.from("modules").upsert(
        {
          id: mod.id,
          project_id: project.id,
          name: mod.name,
          type: mod.type,
          path: mod.path,
          context: mod.context || "",
          pending_context: mod.pendingContext || null,
          pending_context_meta: mod.pendingContextMeta || null,
          last_updated: mod.lastUpdated || new Date().toISOString(),
          last_analyzed_at: mod.lastAnalyzedAt || null,
          source_files: mod.sourceFiles || null,
          git_snapshot: mod.gitSnapshot || null,
          staleness: mod.staleness || null,
        },
        { onConflict: "id" }
      );

      if (moduleError) {
        console.error(
          `    Failed to insert module "${mod.name}": ${moduleError.message}`
        );
      } else {
        moduleCount++;
      }
    }
    console.log(`    ${moduleCount}/${modules.length} modules inserted`);

    // Insert context document if it exists
    const contextFile = path.join(contextsDir, `${project.id}.context.json`);
    if (fs.existsSync(contextFile)) {
      const contextRaw = fs.readFileSync(contextFile, "utf-8");
      const contextDoc = JSON.parse(contextRaw);

      const { error: contextError } = await client
        .from("context_documents")
        .upsert(
          {
            project_id: project.id,
            full_context: contextDoc.fullContext || "",
            generated_at:
              contextDoc.generatedAt || new Date().toISOString(),
          },
          { onConflict: "project_id" }
        );

      if (contextError) {
        console.error(
          `    Failed to insert context document: ${contextError.message}`
        );
      } else {
        console.log(`    Context document inserted`);
      }
    }

    console.log("");
  }

  console.log("  Migration complete!\n");
}

main().catch((err) => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});

import { ipcMain } from "electron";
import fg from "fast-glob";
import path from "node:path";
import fs from "node:fs/promises";
import type { SupabaseStore } from "../store/supabase-store";
import type { ModuleType } from "../store/types";

interface ScannedModule {
  name: string;
  type: ModuleType;
  path: string;
}

/**
 * Scan strategy: detect meaningful high-level modules (features, pages, API
 * groups) rather than individual files. Each result should represent something
 * worth writing a context document for.
 */
async function scanProject(projectPath: string): Promise<ScannedModule[]> {
  const results: ScannedModule[] = [];
  const seen = new Set<string>();

  const add = (name: string, type: ModuleType, modulePath: string) => {
    if (seen.has(modulePath)) return;
    seen.add(modulePath);
    results.push({ name, type, path: modulePath });
  };

  // ── 1. Pages (Next.js app router) ─────────────────────────────
  const pages = await fg(
    ["app/**/page.{tsx,ts,jsx,js}", "src/app/**/page.{tsx,ts,jsx,js}"],
    { cwd: projectPath, ignore: ["**/node_modules/**", "**/.next/**"], onlyFiles: true }
  );
  for (const p of pages) {
    const dir = path.dirname(p);
    const segments = dir.split("/").filter((s) => s !== "app" && s !== "src");
    const name = segments
      .filter((s) => !s.startsWith("("))
      .pop() || "home";
    add(name === "" ? "home" : name, "page", dir);
  }

  // ── 2. Pages (Next.js pages router) ───────────────────────────
  const pagesRouter = await fg(
    ["pages/**/*.{tsx,ts,jsx,js}", "src/pages/**/*.{tsx,ts,jsx,js}"],
    {
      cwd: projectPath,
      ignore: ["**/node_modules/**", "**/pages/api/**", "**/pages/_*.{tsx,ts,jsx,js}"],
      onlyFiles: true,
    }
  );
  for (const p of pagesRouter) {
    const parsed = path.parse(p);
    const name = parsed.name === "index"
      ? path.basename(parsed.dir) || "home"
      : parsed.name;
    add(name, "page", p);
  }

  // ── 3. API routes ─────────────────────────────────────────────
  const apiRoutes = await fg(
    [
      "app/api/**/route.{ts,js}",
      "src/app/api/**/route.{ts,js}",
      "pages/api/**/*.{ts,js}",
      "src/api/**/*.{ts,js}",
    ],
    { cwd: projectPath, ignore: ["**/node_modules/**"], onlyFiles: true }
  );
  const apiGroups = new Map<string, string[]>();
  for (const p of apiRoutes) {
    const match = p.match(/api\/([^/]+)/);
    const group = match?.[1] || "api";
    const existing = apiGroups.get(group) || [];
    existing.push(p);
    apiGroups.set(group, existing);
  }
  for (const [group, files] of apiGroups) {
    if (files.length > 1) {
      const apiDir = files[0].match(/(.*api\/[^/]+)/)?.[1] || path.dirname(files[0]);
      add(`api/${group}`, "api", apiDir);
    } else {
      add(`api/${group}`, "api", path.dirname(files[0]));
    }
  }

  // ── 4. Feature folders (components with subfolders) ───────────
  const componentDirs = ["src/components", "components"];
  for (const compDir of componentDirs) {
    try {
      const entries = await fs.readdir(path.join(projectPath, compDir), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "ui" || entry.name === "icons") continue;

        const dirPath = path.join(compDir, entry.name);
        const files = await fg("**/*.{tsx,ts,jsx,js}", {
          cwd: path.join(projectPath, dirPath),
          ignore: ["**/*.test.*", "**/*.spec.*", "**/index.{ts,tsx,js,jsx}"],
          onlyFiles: true,
        });

        if (files.length >= 1) {
          add(entry.name, "component", dirPath);
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  // ── 5. Hooks directory ────────────────────────────────────────
  const hookDirs = ["src/hooks", "hooks"];
  for (const hookDir of hookDirs) {
    try {
      const files = await fg("*.{ts,tsx}", {
        cwd: path.join(projectPath, hookDir),
        ignore: ["**/*.test.*", "**/index.*"],
        onlyFiles: true,
      });
      if (files.length > 0) {
        add("hooks", "hook", hookDir);
      }
    } catch {
      // Skip
    }
  }

  // ── 6. Utilities / Lib ────────────────────────────────────────
  const utilDirs = ["src/lib", "lib", "src/utils", "utils"];
  for (const utilDir of utilDirs) {
    try {
      const files = await fg("**/*.{ts,js}", {
        cwd: path.join(projectPath, utilDir),
        ignore: ["**/*.test.*", "**/index.*"],
        onlyFiles: true,
      });
      if (files.length > 0) {
        add(path.basename(utilDir), "util", utilDir);
      }
    } catch {
      // Skip
    }
  }

  // ── 7. Config files ──────────────────────────────────────────
  const configs = await fg(
    ["*.config.{ts,js,mjs,cjs}", "tsconfig*.json"],
    { cwd: projectPath, onlyFiles: true }
  );
  if (configs.length > 0) {
    add("config", "config", configs.join(", "));
  }

  results.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  return results;
}

export function registerProjectHandlers(getStore: () => SupabaseStore | null): void {
  ipcMain.handle("projects:list", () => {
    const store = getStore();
    if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
    return store.listProjects();
  });

  ipcMain.handle("projects:get", (_e, id: string) => {
    const store = getStore();
    if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
    return store.getProject(id);
  });

  ipcMain.handle(
    "projects:create",
    (_e, data: { name: string; path: string; description: string }) => {
      const store = getStore();
      if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
      return store.createProject(data);
    }
  );

  ipcMain.handle(
    "projects:update",
    (
      _e,
      id: string,
      data: Partial<{ name: string; path: string; description: string }>
    ) => {
      const store = getStore();
      if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
      return store.updateProject(id, data);
    }
  );

  ipcMain.handle("projects:delete", (_e, id: string) => {
    const store = getStore();
    if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
    return store.deleteProject(id);
  });

  ipcMain.handle("projects:scan-modules", async (_e, projectPath: string) => {
    return scanProject(projectPath);
  });

  ipcMain.handle("projects:get-coverage", async (_e, projectId: string) => {
    const store = getStore();
    if (!store) throw new Error("Database not configured. Set Supabase credentials in Settings.");
    const project = await store.getProject(projectId);
    if (!project) throw new Error("Project not found");

    const scanned = await scanProject(project.path);

    const items = scanned.map((s) => {
      const matched = project.modules.find(
        (m) => m.path === s.path || m.name === s.name
      );
      return {
        name: s.name,
        path: s.path,
        covered: !!matched && !!matched.context?.trim(),
        moduleId: matched?.id,
        moduleName: matched?.name,
      };
    });

    const coveredCount = items.filter((i) => i.covered).length;
    return {
      totalItems: items.length,
      coveredItems: coveredCount,
      coveragePercent: items.length > 0 ? Math.round((coveredCount / items.length) * 100) : 0,
      items,
    };
  });
}

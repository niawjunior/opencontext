import { GitService } from "./git-service.js";

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".css", ".scss", ".md", ".mdx",
  ".html", ".vue", ".svelte",
]);

/**
 * Resolve a module's path (which may be a directory, file, or comma-separated list)
 * into actual tracked source files.
 */
export async function resolveSourceFiles(
  projectPath: string,
  modulePath: string
): Promise<string[]> {
  const paths = modulePath
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const allFiles: Set<string> = new Set();

  for (const p of paths) {
    // Try as exact file first
    const files = await GitService.listFiles(projectPath, p);
    if (files.length > 0 && files.some((f) => f === p)) {
      // Exact file match
      allFiles.add(p);
    } else {
      // Directory — git ls-files with trailing slash lists all files recursively
      const dirPath = p.endsWith("/") ? p : `${p}/`;
      const dirFiles = await GitService.listFiles(projectPath, dirPath);
      for (const f of [...files, ...dirFiles]) {
        allFiles.add(f);
      }
    }
  }

  // Filter to source extensions
  const filtered = [...allFiles].filter((f) => {
    const ext = f.slice(f.lastIndexOf("."));
    return SOURCE_EXTENSIONS.has(ext);
  });

  // Cap at 500 files
  return filtered.sort().slice(0, 500);
}

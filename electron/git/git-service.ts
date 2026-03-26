import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const TIMEOUT = 10_000;

export interface GitCommit {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
  filesChanged: string[];
}

export class GitService {
  static async isGitRepo(cwd: string): Promise<boolean> {
    try {
      await exec("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd,
        timeout: TIMEOUT,
      });
      return true;
    } catch {
      return false;
    }
  }

  static async getHeadSha(cwd: string): Promise<string> {
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], {
      cwd,
      timeout: TIMEOUT,
    });
    return stdout.trim();
  }

  /** List all tracked files under a path pattern */
  static async listFiles(cwd: string, pathPattern: string): Promise<string[]> {
    try {
      const { stdout } = await exec(
        "git",
        ["ls-files", "--", pathPattern],
        { cwd, timeout: TIMEOUT }
      );
      return stdout
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }

  /** Get blob hashes for files (for quick change detection) */
  static async getFileHashes(
    cwd: string,
    files: string[]
  ): Promise<Record<string, string>> {
    if (files.length === 0) return {};
    try {
      const { stdout } = await exec(
        "git",
        ["ls-tree", "-r", "HEAD", "--", ...files],
        { cwd, timeout: TIMEOUT }
      );
      const result: Record<string, string> = {};
      for (const line of stdout.trim().split("\n")) {
        if (!line) continue;
        // format: <mode> <type> <hash>\t<file>
        const match = line.match(/^\d+ \w+ ([a-f0-9]+)\t(.+)$/);
        if (match) {
          result[match[2]] = match[1].slice(0, 8);
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  /** Get commits that touched specific files */
  static async getCommitsSince(
    cwd: string,
    opts: {
      paths: string[];
      sinceCommit?: string;
      maxCount?: number;
    }
  ): Promise<GitCommit[]> {
    const args = [
      "log",
      "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s",
      "--name-only",
      `--max-count=${opts.maxCount ?? 50}`,
    ];
    if (opts.sinceCommit) {
      args.push(`${opts.sinceCommit}..HEAD`);
    }
    args.push("--", ...opts.paths);

    try {
      const { stdout } = await exec("git", args, { cwd, timeout: TIMEOUT });
      return parseGitLog(stdout);
    } catch {
      return [];
    }
  }

  /** Check if a commit SHA exists in the repo */
  static async commitExists(cwd: string, sha: string): Promise<boolean> {
    try {
      await exec("git", ["cat-file", "-t", sha], { cwd, timeout: TIMEOUT });
      return true;
    } catch {
      return false;
    }
  }

  /** Fast count of commits touching paths since a commit */
  static async countCommitsSince(
    cwd: string,
    sinceCommit: string,
    paths: string[]
  ): Promise<number> {
    try {
      const { stdout } = await exec(
        "git",
        ["rev-list", "--count", `${sinceCommit}..HEAD`, "--", ...paths],
        { cwd, timeout: TIMEOUT }
      );
      return parseInt(stdout.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /** Get unique authors who changed paths since a commit */
  static async getAuthorsSince(
    cwd: string,
    sinceCommit: string,
    paths: string[]
  ): Promise<string[]> {
    try {
      const { stdout } = await exec(
        "git",
        [
          "log",
          "--format=%an",
          `${sinceCommit}..HEAD`,
          "--",
          ...paths,
        ],
        { cwd, timeout: TIMEOUT }
      );
      return [...new Set(stdout.trim().split("\n").filter(Boolean))];
    } catch {
      return [];
    }
  }

  /** Get files changed since a commit */
  static async getChangedFilesSince(
    cwd: string,
    sinceCommit: string,
    paths: string[]
  ): Promise<string[]> {
    try {
      const { stdout } = await exec(
        "git",
        [
          "diff",
          "--name-only",
          `${sinceCommit}..HEAD`,
          "--",
          ...paths,
        ],
        { cwd, timeout: TIMEOUT }
      );
      return stdout
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }
}

function parseGitLog(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const blocks = output.trim().split("\n\n");

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (!lines[0]) continue;

    const parts = lines[0].split("\0");
    if (parts.length < 6) continue;

    commits.push({
      sha: parts[0],
      shortSha: parts[1],
      author: parts[2],
      authorEmail: parts[3],
      date: parts[4],
      message: parts.slice(5).join("\0"), // rejoin if subject contained null (unlikely)
      filesChanged: lines.slice(1).filter(Boolean),
    });
  }

  return commits;
}

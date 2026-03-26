import { GitService } from "./git-service.js";

export interface StalenessResult {
  status: "fresh" | "stale" | "outdated" | "unknown";
  commitsBehind: number;
  lastCheckedAt: string;
  changedFiles?: string[];
  authors?: string[];
}

interface ModuleInput {
  id: string;
  path: string;
  sourceFiles?: string[];
  gitSnapshot?: { commitSha: string };
}

const STALE_THRESHOLD = 5;

function computeStatus(commitsBehind: number): StalenessResult["status"] {
  if (commitsBehind === 0) return "fresh";
  if (commitsBehind <= STALE_THRESHOLD) return "stale";
  return "outdated";
}

export class StalenessChecker {
  /** Check staleness for a single module */
  static async checkModule(
    projectPath: string,
    mod: ModuleInput
  ): Promise<StalenessResult> {
    if (!mod.gitSnapshot?.commitSha) {
      return {
        status: "unknown",
        commitsBehind: 0,
        lastCheckedAt: new Date().toISOString(),
      };
    }

    // Verify the snapshot commit still exists (could be removed by force push)
    const exists = await GitService.commitExists(
      projectPath,
      mod.gitSnapshot.commitSha
    );
    if (!exists) {
      return {
        status: "unknown",
        commitsBehind: 0,
        lastCheckedAt: new Date().toISOString(),
      };
    }

    const paths = mod.sourceFiles?.length ? mod.sourceFiles : [mod.path];
    const commitsBehind = await GitService.countCommitsSince(
      projectPath,
      mod.gitSnapshot.commitSha,
      paths
    );

    const result: StalenessResult = {
      status: computeStatus(commitsBehind),
      commitsBehind,
      lastCheckedAt: new Date().toISOString(),
    };

    // Only fetch details if stale (saves git calls for fresh modules)
    if (commitsBehind > 0) {
      const [changedFiles, authors] = await Promise.all([
        GitService.getChangedFilesSince(
          projectPath,
          mod.gitSnapshot.commitSha,
          paths
        ),
        GitService.getAuthorsSince(
          projectPath,
          mod.gitSnapshot.commitSha,
          paths
        ),
      ]);
      result.changedFiles = changedFiles;
      result.authors = authors;
    }

    return result;
  }

  /** Check staleness for all modules in a project (batched) */
  static async checkProject(
    projectPath: string,
    modules: ModuleInput[]
  ): Promise<Map<string, StalenessResult>> {
    const results = new Map<string, StalenessResult>();

    // Run all checks in parallel (each is a fast git command)
    const checks = modules.map(async (mod) => {
      const result = await this.checkModule(projectPath, mod);
      results.set(mod.id, result);
    });

    await Promise.all(checks);
    return results;
  }
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

/**
 * Compute a simple line-by-line diff using LCS (longest common subsequence).
 * Returns an array of DiffLine objects representing the changes.
 */
export function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "unchanged", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", text: oldLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

/**
 * Returns true if old and new content are meaningfully different.
 */
export function hasChanges(oldContent: string, newContent: string): boolean {
  return oldContent.trim() !== newContent.trim();
}

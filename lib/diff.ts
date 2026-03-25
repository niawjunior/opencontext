export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

export interface WordSegment {
  type: "added" | "removed" | "unchanged";
  text: string;
}

export interface SideBySidePair {
  leftLineNo: number | null;
  rightLineNo: number | null;
  leftText: string;
  rightText: string;
  type: "added" | "removed" | "modified" | "unchanged";
  leftHighlights?: WordSegment[];
  rightHighlights?: WordSegment[];
}

export interface DiffHunk {
  type: "changed" | "collapsed";
  pairs: SideBySidePair[];
  collapsedCount?: number;
}

/**
 * Compute a simple line-by-line diff using LCS (longest common subsequence).
 */
export function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

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

// ─── Word-Level Diff ────────────────────────────────────────────────

function tokenizeWords(line: string): string[] {
  return line.match(/\S+|\s+/g) || [];
}

/**
 * Compute word-level diff between two lines.
 * Skips word-level diffing for very long lines (>500 chars).
 */
export function computeWordDiff(
  oldLine: string,
  newLine: string
): { left: WordSegment[]; right: WordSegment[] } {
  if (oldLine.length > 500 || newLine.length > 500) {
    return {
      left: [{ type: "removed", text: oldLine }],
      right: [{ type: "added", text: newLine }],
    };
  }

  const oldTokens = tokenizeWords(oldLine);
  const newTokens = tokenizeWords(newLine);
  const m = oldTokens.length;
  const n = newTokens.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldTokens[i - 1] === newTokens[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const left: WordSegment[] = [];
  const right: WordSegment[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      left.push({ type: "unchanged", text: oldTokens[i - 1] });
      right.push({ type: "unchanged", text: newTokens[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      right.push({ type: "added", text: newTokens[j - 1] });
      j--;
    } else {
      left.push({ type: "removed", text: oldTokens[i - 1] });
      i--;
    }
  }

  left.reverse();
  right.reverse();

  return { left, right };
}

// ─── Side-by-Side Diff ─────────────────────────────────────────────

/**
 * Convert a line diff into paired lines for side-by-side view.
 * Adjacent removed+added lines are paired as "modified" with word-level highlights.
 */
export function computeSideBySideDiff(
  oldLines: string[],
  newLines: string[]
): SideBySidePair[] {
  const diff = computeDiff(oldLines, newLines);
  const pairs: SideBySidePair[] = [];
  let leftNo = 0;
  let rightNo = 0;

  let i = 0;
  while (i < diff.length) {
    const line = diff[i];

    if (line.type === "unchanged") {
      leftNo++;
      rightNo++;
      pairs.push({
        leftLineNo: leftNo,
        rightLineNo: rightNo,
        leftText: line.text,
        rightText: line.text,
        type: "unchanged",
      });
      i++;
    } else if (line.type === "removed") {
      // Collect consecutive removed lines
      const removedBlock: DiffLine[] = [];
      while (i < diff.length && diff[i].type === "removed") {
        removedBlock.push(diff[i]);
        i++;
      }
      // Collect consecutive added lines that follow
      const addedBlock: DiffLine[] = [];
      while (i < diff.length && diff[i].type === "added") {
        addedBlock.push(diff[i]);
        i++;
      }

      // Pair them up
      const maxLen = Math.max(removedBlock.length, addedBlock.length);
      for (let k = 0; k < maxLen; k++) {
        const removed = removedBlock[k];
        const added = addedBlock[k];

        if (removed && added) {
          // Modified line — compute word diff
          leftNo++;
          rightNo++;
          const wordDiff = computeWordDiff(removed.text, added.text);
          pairs.push({
            leftLineNo: leftNo,
            rightLineNo: rightNo,
            leftText: removed.text,
            rightText: added.text,
            type: "modified",
            leftHighlights: wordDiff.left,
            rightHighlights: wordDiff.right,
          });
        } else if (removed) {
          leftNo++;
          pairs.push({
            leftLineNo: leftNo,
            rightLineNo: null,
            leftText: removed.text,
            rightText: "",
            type: "removed",
          });
        } else if (added) {
          rightNo++;
          pairs.push({
            leftLineNo: null,
            rightLineNo: rightNo,
            leftText: "",
            rightText: added.text,
            type: "added",
          });
        }
      }
    } else if (line.type === "added") {
      rightNo++;
      pairs.push({
        leftLineNo: null,
        rightLineNo: rightNo,
        leftText: "",
        rightText: line.text,
        type: "added",
      });
      i++;
    }
  }

  return pairs;
}

// ─── Hunk Grouping ──────────────────────────────────────────────────

/**
 * Group side-by-side pairs into hunks, collapsing long runs of unchanged lines.
 */
export function groupIntoHunks(
  pairs: SideBySidePair[],
  contextLines = 3
): DiffHunk[] {
  if (pairs.length === 0) return [];

  // Find indices of changed lines
  const changedIndices: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].type !== "unchanged") {
      changedIndices.push(i);
    }
  }

  // If no changes, return single collapsed hunk
  if (changedIndices.length === 0) {
    return [{ type: "collapsed", pairs: [], collapsedCount: pairs.length }];
  }

  // Build visible ranges around each change
  const visible = new Set<number>();
  for (const idx of changedIndices) {
    for (let k = Math.max(0, idx - contextLines); k <= Math.min(pairs.length - 1, idx + contextLines); k++) {
      visible.add(k);
    }
  }

  const hunks: DiffHunk[] = [];
  let i = 0;

  while (i < pairs.length) {
    if (visible.has(i)) {
      // Visible hunk — collect all consecutive visible lines
      const hunkPairs: SideBySidePair[] = [];
      while (i < pairs.length && visible.has(i)) {
        hunkPairs.push(pairs[i]);
        i++;
      }
      hunks.push({ type: "changed", pairs: hunkPairs });
    } else {
      // Collapsed — count consecutive non-visible lines
      let count = 0;
      while (i < pairs.length && !visible.has(i)) {
        count++;
        i++;
      }
      hunks.push({ type: "collapsed", pairs: [], collapsedCount: count });
    }
  }

  return hunks;
}

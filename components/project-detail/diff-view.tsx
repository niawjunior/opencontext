"use client";

import { useState, useMemo } from "react";
import { Columns2, AlignJustify, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  computeDiff,
  computeSideBySideDiff,
  computeWordDiff,
  groupIntoHunks,
  type DiffLine,
  type WordSegment,
  type SideBySidePair,
  type DiffHunk,
} from "@/lib/diff";

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  className?: string;
}

export function DiffView({ oldContent, newContent, className }: DiffViewProps) {
  const [viewMode, setViewMode] = useState<"unified" | "side-by-side">("side-by-side");
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(new Set());

  const oldLines = useMemo(() => oldContent.split("\n"), [oldContent]);
  const newLines = useMemo(() => newContent.split("\n"), [newContent]);

  // Unified diff
  const unifiedDiff = useMemo(() => computeDiff(oldLines, newLines), [oldLines, newLines]);

  // Side-by-side diff with hunks
  const sideBySidePairs = useMemo(
    () => computeSideBySideDiff(oldLines, newLines),
    [oldLines, newLines]
  );
  const hunks = useMemo(
    () => groupIntoHunks(sideBySidePairs),
    [sideBySidePairs]
  );

  const stats = useMemo(() => {
    let added = 0, removed = 0;
    for (const line of unifiedDiff) {
      if (line.type === "added") added++;
      if (line.type === "removed") removed++;
    }
    return { added, removed };
  }, [unifiedDiff]);

  const toggleHunk = (index: number) => {
    setExpandedHunks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className={`flex flex-col ${className || ""}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <TooltipProvider>
          <div className="flex border rounded-md overflow-hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === "unified" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-6 w-6 rounded-none"
                  onClick={() => setViewMode("unified")}
                >
                  <AlignJustify className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Unified view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === "side-by-side" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-6 w-6 rounded-none"
                  onClick={() => setViewMode("side-by-side")}
                >
                  <Columns2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Side-by-side view</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <div className="ml-auto flex items-center gap-2 text-[10px] font-medium">
          {stats.added > 0 && (
            <span className="text-emerald-600">+{stats.added}</span>
          )}
          {stats.removed > 0 && (
            <span className="text-red-600">-{stats.removed}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {viewMode === "unified" ? (
          <UnifiedView diff={unifiedDiff} />
        ) : (
          <SideBySideView
            hunks={hunks}
            allPairs={sideBySidePairs}
            expandedHunks={expandedHunks}
            onToggleHunk={toggleHunk}
          />
        )}
      </div>
    </div>
  );
}

// ─── Unified View ───────────────────────────────────────────────────

function UnifiedView({ diff }: { diff: DiffLine[] }) {
  let oldLineNo = 0;
  let newLineNo = 0;

  return (
    <div className="font-mono text-[11px] leading-5">
      {diff.map((line, i) => {
        if (line.type === "unchanged") {
          oldLineNo++;
          newLineNo++;
        } else if (line.type === "removed") {
          oldLineNo++;
        } else {
          newLineNo++;
        }

        const bgClass =
          line.type === "added"
            ? "bg-emerald-500/10"
            : line.type === "removed"
              ? "bg-red-500/10"
              : "";

        const gutterChar =
          line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

        const gutterColor =
          line.type === "added"
            ? "text-emerald-600"
            : line.type === "removed"
              ? "text-red-600"
              : "text-muted-foreground/50";

        return (
          <div key={i} className={`flex ${bgClass}`}>
            {/* Old line number */}
            <span className="w-10 shrink-0 text-right pr-1 text-[10px] text-muted-foreground/50 select-none tabular-nums">
              {line.type !== "added" ? oldLineNo : ""}
            </span>
            {/* New line number */}
            <span className="w-10 shrink-0 text-right pr-1 text-[10px] text-muted-foreground/50 select-none tabular-nums">
              {line.type !== "removed" ? newLineNo : ""}
            </span>
            {/* Gutter indicator */}
            <span className={`w-5 shrink-0 text-center select-none ${gutterColor}`}>
              {gutterChar}
            </span>
            {/* Content */}
            <span className="flex-1 whitespace-pre-wrap break-all pr-3">
              {line.text || "\u00A0"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Side-by-Side View ──────────────────────────────────────────────

function SideBySideView({
  hunks,
  allPairs,
  expandedHunks,
  onToggleHunk,
}: {
  hunks: DiffHunk[];
  allPairs: SideBySidePair[];
  expandedHunks: Set<number>;
  onToggleHunk: (index: number) => void;
}) {
  // Track which pairs belong to which collapsed hunk for expansion
  let pairOffset = 0;

  return (
    <div className="font-mono text-[11px] leading-5">
      {hunks.map((hunk, hunkIdx) => {
        if (hunk.type === "collapsed" && !expandedHunks.has(hunkIdx)) {
          const count = hunk.collapsedCount || 0;
          const startIdx = pairOffset;
          pairOffset += count;
          return (
            <button
              key={hunkIdx}
              className="w-full flex items-center justify-center gap-1.5 py-1 bg-muted/50 border-y text-[10px] text-muted-foreground hover:bg-muted cursor-pointer transition-colors"
              onClick={() => onToggleHunk(hunkIdx)}
            >
              <ChevronDown className="h-3 w-3" />
              Show {count} unchanged line{count !== 1 ? "s" : ""}
            </button>
          );
        }

        // Get pairs to render — either from hunk.pairs or from allPairs for expanded collapsed hunks
        let pairs: SideBySidePair[];
        if (hunk.type === "collapsed") {
          // Expanded collapsed hunk — get pairs from allPairs
          const count = hunk.collapsedCount || 0;
          pairs = allPairs.slice(pairOffset, pairOffset + count);
          pairOffset += count;
        } else {
          pairs = hunk.pairs;
          pairOffset += pairs.length;
        }

        return (
          <div key={hunkIdx}>
            {pairs.map((pair, pairIdx) => (
              <SideBySideLine key={`${hunkIdx}-${pairIdx}`} pair={pair} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SideBySideLine({ pair }: { pair: SideBySidePair }) {
  const leftBg =
    pair.type === "removed" || pair.type === "modified"
      ? "bg-red-500/10"
      : "";
  const rightBg =
    pair.type === "added" || pair.type === "modified"
      ? "bg-emerald-500/10"
      : "";

  return (
    <div className="flex">
      {/* Left panel */}
      <div className={`flex w-1/2 border-r ${leftBg}`}>
        <span className="w-10 shrink-0 text-right pr-1 text-[10px] text-muted-foreground/50 select-none tabular-nums">
          {pair.leftLineNo ?? ""}
        </span>
        <span className={`w-5 shrink-0 text-center select-none ${
          pair.type === "removed" || pair.type === "modified" ? "text-red-600" : "text-muted-foreground/50"
        }`}>
          {pair.type === "removed" || pair.type === "modified" ? "-" : " "}
        </span>
        <span className="flex-1 whitespace-pre-wrap break-all pr-2">
          {pair.leftHighlights ? (
            <WordHighlightedText segments={pair.leftHighlights} side="left" />
          ) : (
            pair.leftText || "\u00A0"
          )}
        </span>
      </div>

      {/* Right panel */}
      <div className={`flex w-1/2 ${rightBg}`}>
        <span className="w-10 shrink-0 text-right pr-1 text-[10px] text-muted-foreground/50 select-none tabular-nums">
          {pair.rightLineNo ?? ""}
        </span>
        <span className={`w-5 shrink-0 text-center select-none ${
          pair.type === "added" || pair.type === "modified" ? "text-emerald-600" : "text-muted-foreground/50"
        }`}>
          {pair.type === "added" || pair.type === "modified" ? "+" : " "}
        </span>
        <span className="flex-1 whitespace-pre-wrap break-all pr-2">
          {pair.rightHighlights ? (
            <WordHighlightedText segments={pair.rightHighlights} side="right" />
          ) : (
            pair.rightText || "\u00A0"
          )}
        </span>
      </div>
    </div>
  );
}

function WordHighlightedText({
  segments,
  side,
}: {
  segments: WordSegment[];
  side: "left" | "right";
}) {
  if (segments.length === 0) return <span>{"\u00A0"}</span>;

  return (
    <>
      {segments.map((seg, i) => {
        const isHighlighted =
          (side === "left" && seg.type === "removed") ||
          (side === "right" && seg.type === "added");

        return (
          <span
            key={i}
            className={
              isHighlighted
                ? side === "left"
                  ? "bg-red-500/25 rounded-sm"
                  : "bg-emerald-500/25 rounded-sm"
                : ""
            }
          >
            {seg.text}
          </span>
        );
      })}
    </>
  );
}

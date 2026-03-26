"use client";

import { useState, useEffect } from "react";
import { GitCommit, Clock, FileText, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatRelativeDate } from "@/lib/format";
import type { Module } from "@/lib/types";
import { useElectron } from "@/hooks/use-electron";

interface GitHistoryPanelProps {
  projectId: string;
  module: Module;
}

interface Commit {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
  filesChanged: string[];
}

export function GitHistoryPanel({ projectId, module }: GitHistoryPanelProps) {
  const api = useElectron();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);
  const [maxCount, setMaxCount] = useState(20);

  useEffect(() => {
    if (!api) return;
    setLoading(true);
    api.git
      .moduleHistory(projectId, module.id, { maxCount })
      .then((result: unknown) => setCommits(result as Commit[]))
      .catch(() => setCommits([]))
      .finally(() => setLoading(false));
  }, [api, projectId, module.id, maxCount]);

  if (loading && commits.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading history...
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        No commits found for this module
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col">
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <GitCommit className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-medium">Recent Changes</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {commits.length}
          </Badge>
        </div>
        <div className="overflow-y-auto max-h-[300px]">
          {commits.map((commit) => (
            <div
              key={commit.sha}
              className="flex items-start gap-2 px-3 py-2 border-b last:border-0 hover:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <code className="text-[10px] text-muted-foreground font-mono cursor-default">
                        {commit.shortSha}
                      </code>
                    </TooltipTrigger>
                    <TooltipContent>{commit.sha}</TooltipContent>
                  </Tooltip>
                  <span className="text-[10px] font-medium truncate flex-1">
                    {commit.message}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {commit.author}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {formatRelativeDate(commit.date)}
                  </span>
                  {commit.filesChanged.length > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <FileText className="h-2.5 w-2.5" />
                      {commit.filesChanged.length} file{commit.filesChanged.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {commits.length >= maxCount && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs mx-2 my-1"
            onClick={() => setMaxCount((c) => c + 20)}
            disabled={loading}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Load more
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}

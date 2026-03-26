"use client";

import { FileCode, FileText, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Module } from "@/lib/types";

interface SourceFilesPanelProps {
  module: Module;
}

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]);

function getFileIcon(path: string) {
  const ext = path.slice(path.lastIndexOf("."));
  return CODE_EXTENSIONS.has(ext) ? FileCode : FileText;
}

export function SourceFilesPanel({ module }: SourceFilesPanelProps) {
  const files = module.sourceFiles || [];
  const changedSet = new Set(module.staleness?.changedFiles || []);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground gap-1">
        <AlertCircle className="h-4 w-4" />
        <span>No source files tracked yet</span>
        <span className="text-[10px]">Accept a context update to start tracking</span>
      </div>
    );
  }

  const changedCount = files.filter((f) => changedSet.has(f)).length;

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <FileCode className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-medium">Source Files</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {files.length}
        </Badge>
        {changedCount > 0 && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            {changedCount} changed
          </Badge>
        )}
        {module.gitSnapshot && (
          <span className="text-[10px] text-muted-foreground ml-auto font-mono">
            {module.gitSnapshot.commitSha.slice(0, 7)}
          </span>
        )}
      </div>
      <div className="overflow-y-auto max-h-[300px]">
        {files.map((file) => {
          const Icon = getFileIcon(file);
          const isChanged = changedSet.has(file);
          return (
            <div
              key={file}
              className={`flex items-center gap-2 px-3 py-1.5 border-b last:border-0 ${
                isChanged ? "bg-red-500/5" : ""
              }`}
            >
              <Icon className={`h-3 w-3 shrink-0 ${isChanged ? "text-red-500" : "text-muted-foreground"}`} />
              <span className={`text-[10px] font-mono truncate ${isChanged ? "text-red-600" : ""}`}>
                {file}
              </span>
              {isChanged && (
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0 ml-auto" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

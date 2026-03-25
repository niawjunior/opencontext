"use client";

import { useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { computeDiff, type DiffLine } from "@/lib/diff";
import type { Module } from "@/lib/types";

interface SyncContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: Module | null;
  oldContext: string;
  newContext: string;
  onAccept: (context: string) => void;
  onReject: () => void;
}

export function SyncContextDialog({
  open,
  onOpenChange,
  module,
  oldContext,
  newContext,
  onAccept,
  onReject,
}: SyncContextDialogProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");

  const diff = computeDiff(
    oldContext.split("\n"),
    newContext.split("\n")
  );

  const added = diff.filter((l) => l.type === "added").length;
  const removed = diff.filter((l) => l.type === "removed").length;

  const handleEdit = () => {
    setEditContent(newContext);
    setEditing(true);
  };

  const handleAccept = () => {
    onAccept(editing ? editContent : newContext);
    setEditing(false);
  };

  const handleReject = () => {
    setEditing(false);
    onReject();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setEditing(false);
      }
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Sync Context</DialogTitle>
          <DialogDescription className="text-xs">
            Review the updated context for{" "}
            <span className="font-medium text-foreground">{module?.name}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="flex items-center gap-2">
          {module && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {module.type}
            </Badge>
          )}
          {module?.path && (
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              {module.path}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {added > 0 && (
              <span className="text-[10px] text-emerald-600 font-medium">+{added}</span>
            )}
            {removed > 0 && (
              <span className="text-[10px] text-red-600 font-medium">-{removed}</span>
            )}
          </div>
        </div>

        {/* Diff view or Edit view */}
        <div className="flex-1 min-h-0">
          {editing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="h-full min-h-[300px] font-mono text-xs resize-none"
              placeholder="Edit the new context..."
            />
          ) : (
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-3 font-mono text-xs">
                {diff.map((line, i) => (
                  <DiffLineView key={i} line={line} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleReject}
          >
            <X className="h-3 w-3 mr-1" />
            Keep Current
          </Button>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleEdit}
            >
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleAccept}
          >
            <Check className="h-3 w-3 mr-1" />
            Accept {editing ? "Edited" : "New"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiffLineView({ line }: { line: DiffLine }) {
  const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
  const bg =
    line.type === "added"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : line.type === "removed"
        ? "bg-red-500/10 text-red-700 dark:text-red-400"
        : "";

  return (
    <div className={`px-2 py-0.5 whitespace-pre-wrap break-words ${bg}`}>
      <span className="select-none opacity-50 mr-2">{prefix}</span>
      {line.text}
    </div>
  );
}

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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DiffView } from "./diff-view";
import { formatRelativeDate } from "@/lib/format";
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

  const meta = module?.pendingContextMeta;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) setEditing(false);
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Sync Context</DialogTitle>
          <DialogDescription className="text-xs">
            Review the updated context for{" "}
            <span className="font-medium text-foreground">{module?.name}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Module info + metadata */}
        <div className="flex items-center gap-2 flex-wrap">
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
          {meta?.updatedAt && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              Updated{meta.source ? ` via ${meta.source}` : ""}{" "}
              {formatRelativeDate(meta.updatedAt)}
              {meta.previousPendingAt && (
                <span className="text-amber-600 ml-1">
                  (replaced prior from {formatRelativeDate(meta.previousPendingAt)})
                </span>
              )}
            </span>
          )}
        </div>

        {/* Diff view or Edit view */}
        <div className="flex-1 min-h-0 rounded-md border overflow-hidden flex flex-col">
          {editing ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="h-full min-h-[400px] font-mono text-xs resize-none border-0 rounded-none"
                placeholder="Edit the new context..."
              />
            </div>
          ) : (
            <DiffView
              oldContent={oldContext}
              newContent={newContext}
              className="h-full min-h-0"
            />
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

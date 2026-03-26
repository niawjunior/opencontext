"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Module } from "@/lib/types";

interface ContextEditorProps {
  module?: Module;
  fullContext?: string;
  onSave?: (content: string) => Promise<void>;
  onSaveFullContext?: (content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onSync?: (module: Module) => void;
  syncing?: boolean;
}

export function ContextEditor({
  module,
  fullContext,
  onSave,
  onSaveFullContext,
  onDirtyChange,
  onSync,
  syncing,
}: ContextEditorProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (module) {
      setContent(module.context);
      setDirty(false);
      onDirtyChange?.(false);
    } else if (fullContext !== undefined) {
      setContent(fullContext);
      setDirty(false);
      onDirtyChange?.(false);
    }
  }, [module, fullContext]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      if (module && onSave) {
        await onSave(content);
      } else if (onSaveFullContext) {
        await onSaveFullContext(content);
      }
      setDirty(false);
      onDirtyChange?.(false);
      toast.success("Context saved");
    } finally {
      setSaving(false);
    }
  }, [content, dirty, module, onSave, onSaveFullContext, onDirtyChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  const lineCount = content.split("\n").length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
        <div className="flex items-center gap-2 min-w-0">
          {module ? (
            <>
              <span className="text-xs font-medium truncate">
                {module.name}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                {module.type}
              </Badge>
              {module.staleness?.status && module.staleness.status !== "unknown" && (
                <Badge
                  variant={module.staleness.status === "fresh" ? "secondary" : "destructive"}
                  className="text-[10px] px-1.5 py-0 shrink-0"
                >
                  {module.staleness.status === "fresh"
                    ? "Fresh"
                    : `${module.staleness.commitsBehind} commit${module.staleness.commitsBehind !== 1 ? "s" : ""} behind`}
                </Badge>
              )}
              {dirty && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              )}
            </>
          ) : (
            <span className="text-xs font-medium">Full Context Document</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {lineCount} lines
          </span>
          <kbd className="hidden sm:inline text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded font-mono">
            {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+S
          </kbd>
          {module && onSync && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => onSync(module)}
              disabled={syncing}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            <Save className="h-3 w-3 mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
          onDirtyChange?.(true);
        }}
        onKeyDown={handleKeyDown}
        className="flex-1 min-h-0 font-mono text-xs resize-none rounded-none border-0 focus-visible:ring-0"
        placeholder="Write context in markdown format..."
      />
    </div>
  );
}

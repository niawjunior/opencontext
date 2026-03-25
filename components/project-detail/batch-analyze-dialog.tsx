"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Check, X, Sparkles, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useElectron } from "@/hooks/use-electron";
import type { Module } from "@/lib/types";

type ModuleStatus = "pending" | "analyzing" | "done" | "failed" | "skipped";

interface BatchAnalyzeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectPath: string;
  modules: Module[];
  onComplete: () => Promise<void>;
}

export function BatchAnalyzeDialog({
  open,
  onOpenChange,
  projectId,
  projectPath,
  modules,
  onComplete,
}: BatchAnalyzeDialogProps) {
  const api = useElectron();
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ModuleStatus>>({});
  const [reAnalyze, setReAnalyze] = useState(false);
  const cancelled = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Only analyze modules that have a path
  const analyzable = modules.filter((m) => m.path.trim());

  useEffect(() => {
    if (open) {
      const initial: Record<string, ModuleStatus> = {};
      for (const mod of analyzable) {
        initial[mod.id] = "pending";
      }
      setStatuses(initial);
      setRunning(false);
      setReAnalyze(false);
      cancelled.current = false;
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedCount = Object.values(statuses).filter(
    (s) => s === "done" || s === "failed" || s === "skipped"
  ).length;
  const progress = analyzable.length > 0 ? Math.round((completedCount / analyzable.length) * 100) : 0;

  const handleStart = async () => {
    if (!api) return;
    setRunning(true);
    cancelled.current = false;

    let succeeded = 0;
    let failed = 0;

    for (const mod of analyzable) {
      if (cancelled.current) break;

      // Skip modules that already have context (unless re-analyze is on)
      if (!reAnalyze && mod.context?.trim()) {
        setStatuses((prev) => ({ ...prev, [mod.id]: "skipped" }));
        succeeded++;
        continue;
      }

      setStatuses((prev) => ({ ...prev, [mod.id]: "analyzing" }));

      try {
        const result = await api.context.analyzeModule(
          projectPath,
          mod.path.trim(),
          mod.type
        );
        await api.modules.update(projectId, mod.id, { context: result });
        setStatuses((prev) => ({ ...prev, [mod.id]: "done" }));
        succeeded++;
      } catch {
        setStatuses((prev) => ({ ...prev, [mod.id]: "failed" }));
        failed++;
      }
    }

    if (!cancelled.current) {
      await onComplete();
      toast.success(
        `Analyzed ${succeeded} module${succeeded !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}`
      );
    }
    setRunning(false);
  };

  const handleCancel = () => {
    cancelled.current = true;
  };

  const StatusIcon = ({ status }: { status: ModuleStatus }) => {
    switch (status) {
      case "analyzing":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case "done":
        return <Check className="h-3 w-3 text-emerald-500" />;
      case "failed":
        return <X className="h-3 w-3 text-destructive" />;
      case "skipped":
        return <Check className="h-3 w-3 text-muted-foreground" />;
      default:
        return <span className="h-3 w-3 rounded-full bg-muted-foreground/20 block" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Analyze All Modules</DialogTitle>
          <DialogDescription className="text-xs">
            Use Claude CLI to generate context for each module.{" "}
            {reAnalyze
              ? "All modules will be re-analyzed."
              : "Modules that already have context will be skipped."}
          </DialogDescription>
        </DialogHeader>

        {analyzable.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <p className="text-xs text-muted-foreground">
              No modules with paths to analyze. Add module paths first.
            </p>
          </div>
        ) : (
          <>
            {!running && completedCount === 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="re-analyze"
                  checked={reAnalyze}
                  onCheckedChange={(checked) => setReAnalyze(checked === true)}
                />
                <Label htmlFor="re-analyze" className="text-xs text-muted-foreground cursor-pointer">
                  Re-analyze modules that already have context
                </Label>
              </div>
            )}
            <Progress value={progress} className="h-1" />
            <p className="text-[10px] text-muted-foreground text-center">
              {running
                ? `Analyzing ${completedCount + 1} of ${analyzable.length}...`
                : completedCount > 0
                  ? `${completedCount} of ${analyzable.length} complete`
                  : `${analyzable.length} module${analyzable.length !== 1 ? "s" : ""} to analyze`}
            </p>

            <ScrollArea className="max-h-[250px]" ref={scrollRef}>
              <div className="space-y-0.5">
                {analyzable.map((mod) => (
                  <div
                    key={mod.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
                  >
                    <StatusIcon status={statuses[mod.id] || "pending"} />
                    <span className="font-medium truncate flex-1">{mod.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {statuses[mod.id] === "skipped" ? "has context" : statuses[mod.id] || "pending"}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (running) handleCancel();
              else onOpenChange(false);
            }}
          >
            {running ? "Stop" : "Close"}
          </Button>
          {!running && analyzable.length > 0 && completedCount < analyzable.length && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleStart}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Start Analysis
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

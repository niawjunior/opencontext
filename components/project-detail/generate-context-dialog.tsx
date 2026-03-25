"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Loader2, Copy, FileText } from "lucide-react";
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
import { toast } from "sonner";
import { useElectron } from "@/hooks/use-electron";

interface GenerateContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onGenerated: () => void;
}

export function GenerateContextDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onGenerated,
}: GenerateContextDialogProps) {
  const api = useElectron();
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setOutput("");
      setError("");
      setGenerating(false);
    }
  }, [open]);

  useEffect(() => {
    if (!api || !open) return;
    const cleanup = api.context.onGenerateProgress((data: unknown) => {
      const progress = data as { chunk: string };
      setOutput((prev) => prev + progress.chunk);
    });
    return cleanup;
  }, [api, open]);

  // Auto-scroll output
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [output]);

  const handleGenerate = async () => {
    if (!api) return;
    setGenerating(true);
    setOutput("");
    setError("");
    try {
      await api.context.generate(projectId);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    toast.success("Output copied to clipboard");
  };

  const lineCount = output ? output.split("\n").length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Generate Context</DialogTitle>
          <DialogDescription className="text-xs">
            Use Claude CLI to analyze &quot;{projectName}&quot; and generate a
            comprehensive context document.
          </DialogDescription>
        </DialogHeader>

        {generating && (
          <Progress className="h-1 animate-pulse" value={100} />
        )}

        {!output && !error && !generating && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium">Ready to generate</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                This will analyze the project and create a context document
              </p>
            </div>
          </div>
        )}

        {(output || error) && (
          <div className="rounded-md border bg-muted/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Output
                </span>
                {lineCount > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {lineCount} lines
                  </span>
                )}
              </div>
              {output && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] px-1.5"
                  onClick={handleCopy}
                >
                  <Copy className="h-2.5 w-2.5 mr-1" />
                  Copy
                </Button>
              )}
            </div>
            <ScrollArea className="h-[300px] p-3" ref={scrollRef}>
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {output}
                {error && (
                  <>
                    {output && "\n\n"}
                    <span className="text-destructive border-t border-destructive/20 pt-2 block">
                      {error}
                    </span>
                  </>
                )}
              </pre>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onOpenChange(false)}
          >
            {generating ? "Close" : "Cancel"}
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                Generate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

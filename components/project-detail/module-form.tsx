"use client";

import { useState, useEffect } from "react";
import { Loader2, FolderOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useElectron } from "@/hooks/use-electron";
import type { Module, ModuleType } from "@/lib/types";

const MODULE_TYPES: { value: ModuleType; label: string }[] = [
  { value: "page", label: "Page" },
  { value: "component", label: "Component" },
  { value: "module", label: "Module" },
  { value: "api", label: "API" },
  { value: "hook", label: "Hook" },
  { value: "util", label: "Utility" },
  { value: "config", label: "Config" },
];

interface ModuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editModule: Module | null;
  projectPath: string;
  onSubmit: (data: {
    name: string;
    type: ModuleType;
    path: string;
    context: string;
  }) => Promise<void>;
}

export function ModuleForm({
  open,
  onOpenChange,
  editModule,
  projectPath,
  onSubmit,
}: ModuleFormProps) {
  const api = useElectron();
  const [name, setName] = useState("");
  const [type, setType] = useState<ModuleType>("component");
  const [modulePath, setModulePath] = useState("");
  const [context, setContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (editModule) {
      setName(editModule.name);
      setType(editModule.type);
      setModulePath(editModule.path);
      setContext(editModule.context);
    } else {
      setName("");
      setType("component");
      setModulePath("");
      setContext("");
    }
  }, [editModule, open]);

  const handleBrowsePath = async () => {
    if (!api) return;
    const selected = await api.dialog.selectPath({
      title: "Select Module File or Folder",
      defaultPath: projectPath,
    });
    if (selected && projectPath && selected.startsWith(projectPath)) {
      setModulePath(selected.slice(projectPath.length).replace(/^\//, ""));
    } else if (selected) {
      setModulePath(selected);
    }
  };

  const handleAnalyze = async () => {
    if (!api || !modulePath.trim() || !projectPath) return;
    setAnalyzing(true);
    try {
      const result = await api.context.analyzeModule(
        projectPath,
        modulePath.trim(),
        type
      );
      setContext(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("spawn")) {
        toast.error("Claude CLI not found. Set its path in Settings > General.");
      } else {
        toast.error("Analysis failed. Check that the path exists and try again.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        type,
        path: modulePath.trim(),
        context: context.trim(),
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-sm">
            {editModule ? "Edit Module" : "Add Module"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {editModule
              ? "Update module metadata and context."
              : "Add a new module to track its context."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-4 py-4">
          {/* Name + Type on same row */}
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mod-name" className="text-xs">
                Name
              </Label>
              <Input
                id="mod-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. UserProfile"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mod-type" className="text-xs">
                Type
              </Label>
              <Select value={type} onValueChange={(v) => setType(v as ModuleType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mod-path" className="text-xs">
              Path
            </Label>
            <div className="flex gap-1.5">
              <Input
                id="mod-path"
                value={modulePath}
                onChange={(e) => setModulePath(e.target.value)}
                placeholder="e.g. src/components/UserProfile.tsx"
                className="h-8 text-xs font-mono flex-1"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={handleBrowsePath}
                      type="button"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Browse project files</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Relative to project root
            </p>
          </div>

          <div className="space-y-1.5 flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <Label htmlFor="mod-context" className="text-xs">
                Context
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={handleAnalyze}
                      disabled={!modulePath.trim() || analyzing}
                      type="button"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" />
                          Auto-generate
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {modulePath.trim()
                      ? "Use Claude CLI to analyze this module and generate context"
                      : "Set a path first to auto-generate context"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              id="mod-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Describe what this module does, its interfaces, usage patterns..."
              rows={10}
              className="font-mono text-xs flex-1 min-h-[120px] resize-none"
              disabled={analyzing}
            />
            <p className="text-[10px] text-muted-foreground">
              {analyzing
                ? "Analyzing module with Claude CLI..."
                : "Markdown supported. Auto-generate or write manually."}
            </p>
          </div>
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t bg-background shrink-0 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Saving...
              </>
            ) : editModule ? (
              "Update"
            ) : (
              "Add"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

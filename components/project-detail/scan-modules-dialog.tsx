"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Search, CheckSquare, Square } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useElectron } from "@/hooks/use-electron";
import type { Module, ModuleType, ScannedModule } from "@/lib/types";

const TYPE_LABELS: Record<ModuleType, string> = {
  page: "Pages",
  component: "Components",
  module: "Modules",
  api: "APIs",
  hook: "Hooks",
  util: "Utilities",
  config: "Config",
};

interface ScanModulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectPath: string;
  existingModules: Module[];
  onComplete: () => Promise<void>;
}

export function ScanModulesDialog({
  open,
  onOpenChange,
  projectId,
  projectPath,
  existingModules,
  onComplete,
}: ScanModulesDialogProps) {
  const api = useElectron();
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addProgress, setAddProgress] = useState(0);
  const [scannedModules, setScannedModules] = useState<ScannedModule[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasScanned, setHasScanned] = useState(false);

  // Reset and auto-scan when dialog opens
  useEffect(() => {
    if (!open) return;
    setScannedModules([]);
    setSelected(new Set());
    setHasScanned(false);
    setAdding(false);
    setAddProgress(0);

    if (api) {
      handleScan();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const existingPaths = useMemo(
    () => new Set(existingModules.map((m) => m.path)),
    [existingModules]
  );

  // Filter out already-existing modules
  const newModules = useMemo(
    () => scannedModules.filter((m) => !existingPaths.has(m.path)),
    [scannedModules, existingPaths]
  );

  const grouped = useMemo(() => {
    const map = new Map<ModuleType, ScannedModule[]>();
    for (const mod of newModules) {
      const group = map.get(mod.type) || [];
      group.push(mod);
      map.set(mod.type, group);
    }
    return map;
  }, [newModules]);

  const handleScan = async () => {
    if (!api) return;
    setScanning(true);
    try {
      const results = (await api.projects.scanModules(projectPath)) as ScannedModule[];
      setScannedModules(results);
      // Select all new modules by default
      const newPaths = results
        .filter((m) => !existingPaths.has(m.path))
        .map((m) => m.path);
      setSelected(new Set(newPaths));
      setHasScanned(true);
    } catch {
      toast.error("Failed to scan project directory");
    } finally {
      setScanning(false);
    }
  };

  const toggleModule = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleType = (type: ModuleType) => {
    const typeMods = grouped.get(type) || [];
    const allSelected = typeMods.every((m) => selected.has(m.path));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const mod of typeMods) {
        if (allSelected) next.delete(mod.path);
        else next.add(mod.path);
      }
      return next;
    });
  };

  const handleAdd = async () => {
    if (!api) return;
    const toAdd = newModules.filter((m) => selected.has(m.path));
    if (toAdd.length === 0) return;

    setAdding(true);
    setAddProgress(0);

    let added = 0;
    for (const mod of toAdd) {
      try {
        await api.modules.add(projectId, {
          name: mod.name,
          type: mod.type,
          path: mod.path,
          context: "",
        });
        added++;
        setAddProgress(Math.round((added / toAdd.length) * 100));
      } catch {
        // Skip failed modules
      }
    }

    await onComplete();
    toast.success(`Added ${added} module${added !== 1 ? "s" : ""}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Scan Project</DialogTitle>
          <DialogDescription className="text-xs">
            Auto-detect modules from your project structure. Already-added modules are excluded.
          </DialogDescription>
        </DialogHeader>

        {scanning && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Scanning project files...</p>
          </div>
        )}

        {hasScanned && !scanning && newModules.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Search className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium">No new modules found</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {scannedModules.length > 0
                  ? "All detected modules are already added to this project."
                  : "No matching file patterns found in this project."}
              </p>
            </div>
          </div>
        )}

        {hasScanned && !scanning && newModules.length > 0 && (
          <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <span className="text-xs text-muted-foreground">
                {selected.size} of {newModules.length} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => {
                  if (selected.size === newModules.length) {
                    setSelected(new Set());
                  } else {
                    setSelected(new Set(newModules.map((m) => m.path)));
                  }
                }}
              >
                {selected.size === newModules.length ? (
                  <>
                    <Square className="h-3 w-3 mr-1" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-3 w-3 mr-1" />
                    Select All
                  </>
                )}
              </Button>
            </div>

            <div className="overflow-y-auto max-h-[50vh] mt-2 pr-1">
              <div className="space-y-3">
                {Array.from(grouped.entries()).map(([type, mods]) => {
                  const allSelected = mods.every((m) => selected.has(m.path));
                  const someSelected = mods.some((m) => selected.has(m.path));
                  return (
                    <div key={type}>
                      <button
                        className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 hover:text-foreground transition-colors"
                        onClick={() => toggleType(type)}
                      >
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          className="h-3 w-3"
                        />
                        {TYPE_LABELS[type]}
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {mods.length}
                        </Badge>
                      </button>
                      <div className="space-y-0.5 pl-5">
                        {mods.map((mod) => (
                          <label
                            key={mod.path}
                            className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={selected.has(mod.path)}
                              onCheckedChange={() => toggleModule(mod.path)}
                              className="h-3 w-3"
                            />
                            <span className="font-medium shrink-0">{mod.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                              {mod.path}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {adding && <Progress value={addProgress} className="h-1 shrink-0 mt-2" />}
          </div>
        )}

        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={adding}
          >
            Cancel
          </Button>
          {hasScanned && newModules.length > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleAdd}
              disabled={selected.size === 0 || adding}
            >
              {adding ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${selected.size} Module${selected.size !== 1 ? "s" : ""}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

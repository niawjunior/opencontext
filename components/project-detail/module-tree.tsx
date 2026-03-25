"use client";

import { useState, useMemo } from "react";
import {
  FileText,
  Component,
  Box,
  Globe,
  Anchor,
  Wrench,
  Settings,
  Pencil,
  Trash2,
  Search,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { formatRelativeDate } from "@/lib/format";
import type { Module, ModuleType } from "@/lib/types";

const typeConfig: Record<ModuleType, { icon: React.ElementType; label: string }> = {
  page: { icon: FileText, label: "Pages" },
  component: { icon: Component, label: "Components" },
  module: { icon: Box, label: "Modules" },
  api: { icon: Globe, label: "APIs" },
  hook: { icon: Anchor, label: "Hooks" },
  util: { icon: Wrench, label: "Utilities" },
  config: { icon: Settings, label: "Config" },
};

interface ModuleTreeProps {
  modules: Module[];
  selectedId?: string;
  staleModuleIds?: Set<string>;
  onSelect: (module: Module) => void;
  onEdit: (module: Module) => void;
  onDelete: (moduleId: string) => void;
  onSync: (module: Module) => void;
  onAddModule: () => void;
}

export function ModuleTree({
  modules,
  selectedId,
  staleModuleIds,
  onSelect,
  onEdit,
  onDelete,
  onSync,
  onAddModule,
}: ModuleTreeProps) {
  const [search, setSearch] = useState("");
  const [deletingModule, setDeletingModule] = useState<Module | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return modules;
    const q = search.toLowerCase();
    return modules.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.path.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q)
    );
  }, [modules, search]);

  const grouped = useMemo(() => {
    const map = new Map<ModuleType, Module[]>();
    for (const mod of filtered) {
      const group = map.get(mod.type) || [];
      group.push(mod);
      map.set(mod.type, group);
    }
    return map;
  }, [filtered]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Search bar */}
        <div className="flex items-center gap-2 p-2.5 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter modules..."
              className="h-7 text-xs pl-7 border-0 bg-muted/50 focus-visible:ring-1"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onAddModule}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add module</TooltipContent>
          </Tooltip>
        </div>

        {/* Tree content */}
        {modules.length === 0 ? (
          <Empty className="flex-1 border-0 px-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Box className="h-4 w-4 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>No modules yet</EmptyTitle>
              <EmptyDescription>
                Add modules to track context for your project
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" className="h-7 text-xs" onClick={onAddModule}>
                <Plus className="h-3 w-3 mr-1" />
                Add Module
              </Button>
            </EmptyContent>
          </Empty>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-xs text-muted-foreground">
              No modules matching &quot;{search}&quot;
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Accordion
              type="multiple"
              defaultValue={Array.from(grouped.keys())}
              className="px-2 py-1.5"
            >
              {Array.from(grouped.entries()).map(([type, mods]) => {
                const config = typeConfig[type];
                const Icon = config.icon;
                return (
                  <AccordionItem key={type} value={type} className="border-0">
                    <AccordionTrigger className="text-xs px-2 py-2 hover:no-underline">
                      <span className="flex items-center gap-2 uppercase tracking-wider text-muted-foreground font-medium">
                        <Icon className="h-3 w-3" />
                        {config.label}
                        <span className="text-[10px] tabular-nums">
                          {mods.length}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <div className="space-y-0.5 pl-1">
                        {mods.map((mod) => (
                          <div
                            key={mod.id}
                            className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-default text-xs hover:bg-accent transition-colors ${
                              selectedId === mod.id
                                ? "bg-accent text-accent-foreground"
                                : ""
                            }`}
                            onClick={() => onSelect(mod)}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    mod.pendingContext
                                      ? "bg-amber-500 ring-2 ring-amber-500/30"
                                      : (staleModuleIds?.has(mod.id) || (!mod.pendingContext && mod.pendingContextMeta?.source === "git-hook"))
                                        ? "bg-amber-500"
                                        : mod.context
                                          ? "bg-emerald-500"
                                          : "bg-muted-foreground/30"
                                  }`}
                                />
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {mod.pendingContext
                                  ? `Pending review${mod.pendingContextMeta?.updatedAt ? ` (${formatRelativeDate(mod.pendingContextMeta.updatedAt)} via ${mod.pendingContextMeta.source || "unknown"})` : ""} — click to review`
                                  : (!mod.pendingContext && mod.pendingContextMeta?.source === "git-hook")
                                    ? `Source changed via git push${mod.pendingContextMeta?.updatedAt ? ` (${formatRelativeDate(mod.pendingContextMeta.updatedAt)})` : ""} — click sync to update`
                                    : staleModuleIds?.has(mod.id)
                                      ? "Source changed — click sync to update"
                                      : mod.context
                                        ? "Has context"
                                        : "No context yet"}
                              </TooltipContent>
                            </Tooltip>
                            <span className="flex-1 truncate">{mod.name}</span>
                            <div className="hidden group-hover:flex gap-0.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSync(mod);
                                    }}
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {mod.context ? "Re-sync context" : "Analyze"}
                                </TooltipContent>
                              </Tooltip>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEdit(mod);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingModule(mod);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingModule} onOpenChange={(open) => !open && setDeletingModule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deletingModule?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Its context will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deletingModule) onDelete(deletingModule.id);
                setDeletingModule(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

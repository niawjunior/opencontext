"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Sparkles, Clock, Box, GripVertical, Loader2, FileText, Search as SearchIcon, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { ModuleTree } from "./module-tree";
import { ContextEditor } from "./context-editor";
import { ContextPreview } from "./context-preview";
import { ModuleForm } from "./module-form";
import { ScanModulesDialog } from "./scan-modules-dialog";
import { BatchAnalyzeDialog } from "./batch-analyze-dialog";
import { SyncContextDialog } from "./sync-context-dialog";
import { CoverageView } from "./coverage-view";
import { SetupClaudeDialog } from "./setup-claude-dialog";
import { GitHistoryPanel } from "./git-history-panel";
import { SourceFilesPanel } from "./source-files-panel";
import { toast } from "sonner";
import { useElectron } from "@/hooks/use-electron";
import { formatRelativeDate } from "@/lib/format";
import type { Project, Module, ModuleType, ContextDocument } from "@/lib/types";

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

export function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const api = useElectron();
  const [project, setProject] = useState<Project | null>(null);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [contextDoc, setContextDoc] = useState<ContextDocument | null>(null);
  const [showModuleForm, setShowModuleForm] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [showBatchAnalyze, setShowBatchAnalyze] = useState(false);

  // Claude Code setup
  const [claudeSetupStatus, setClaudeSetupStatus] = useState({
    configured: false,
    hasClaudeMd: false,
    hasHuskyHook: false,
  });
  const [showSetupDialog, setShowSetupDialog] = useState(false);

  // Sync context state
  const [syncingModule, setSyncingModule] = useState<Module | null>(null);
  const [syncResult, setSyncResult] = useState<{ oldContext: string; newContext: string } | null>(null);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Unsaved changes tracking
  const [hasDirtyEditor, setHasDirtyEditor] = useState(false);
  const [pendingModule, setPendingModule] = useState<Module | null>(null);

  // Bottom panel tab
  const [bottomTab, setBottomTab] = useState<"files" | "history">("files");

  // Resizable split pane
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.min(Math.max(ev.clientX - rect.left, 180), rect.width * 0.5);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const loadProject = useCallback(async () => {
    if (!api) return;
    const p = (await api.projects.get(projectId)) as Project | null;
    setProject(p);
    const doc = (await api.context.getFull(projectId)) as ContextDocument | null;
    setContextDoc(doc);
    // Check Claude Code setup
    if (p?.path) {
      const status = await api.mcp.checkProjectSetup(p.path);
      setClaudeSetupStatus(status);
    }

    // Check git staleness in background (non-blocking)
    if (p) {
      api.git.checkProjectStaleness(projectId).then(() => {
        // Reload to pick up updated staleness data
        api.projects.get(projectId).then((updated) => {
          if (updated) setProject(updated as Project);
        });
      }).catch(() => {});
    }
  }, [api, projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Auto-refresh when store data changes (e.g., MCP update, git staleness)
  useEffect(() => {
    if (!api) return;
    const unsubscribe = api.onProjectChanged((changedProjectId: string) => {
      if (changedProjectId === projectId) {
        // Reload project data
        api.projects.get(projectId).then((updated) => {
          if (updated) {
            setProject(updated as Project);
            // If a module is selected, refresh it with latest data
            if (selectedModule) {
              const refreshed = (updated as Project).modules.find(
                (m) => m.id === selectedModule.id
              );
              if (refreshed) setSelectedModule(refreshed);
            }
          }
        });
        // Also refresh context doc
        api.context.getFull(projectId).then((doc) => {
          if (doc) setContextDoc(doc as ContextDocument);
        });
      }
    });
    return unsubscribe;
  }, [api, projectId, selectedModule?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectModule = (mod: Module) => {
    // If module has pending context, open review dialog
    if (mod.pendingContext) {
      setSyncingModule(mod);
      setSyncResult({ oldContext: mod.context || "", newContext: mod.pendingContext });
      setShowSyncDialog(true);
      setSelectedModule(mod);
      return;
    }
    // Stale/outdated modules with existing context — trigger resync to show diff
    const isStale = mod.staleness?.status === "stale" || mod.staleness?.status === "outdated";
    if (isStale && mod.context?.trim()) {
      setSelectedModule(mod);
      handleSyncModule(mod);
      return;
    }
    if (hasDirtyEditor && selectedModule?.id !== mod.id) {
      setPendingModule(mod);
    } else {
      setSelectedModule(mod);
    }
  };

  const handleAddModule = async (data: {
    name: string;
    type: ModuleType;
    path: string;
    context: string;
  }) => {
    if (!api) return;
    await api.modules.add(projectId, data);
    await loadProject();
    setShowModuleForm(false);
  };

  const handleUpdateModule = async (
    moduleId: string,
    data: { name?: string; type?: ModuleType; path?: string; context?: string }
  ) => {
    if (!api) return;
    await api.modules.update(projectId, moduleId, data);
    await loadProject();
    if (selectedModule?.id === moduleId) {
      const updated = project?.modules.find((m) => m.id === moduleId);
      if (updated) setSelectedModule({ ...updated, ...data } as Module);
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!api) return;
    await api.modules.delete(projectId, moduleId);
    if (selectedModule?.id === moduleId) setSelectedModule(null);
    await loadProject();
  };

  const handleSaveContext = async (content: string) => {
    if (!api || !selectedModule) return;
    await api.modules.update(projectId, selectedModule.id, { context: content });
    await loadProject();
  };

  const handleSaveFullContext = async (content: string) => {
    if (!api) return;
    const doc = (await api.context.saveFull(projectId, content)) as ContextDocument;
    setContextDoc(doc);
  };

  const handleGenerate = async () => {
    if (!api || generating) return;
    setGenerating(true);
    try {
      const result = (await api.context.generate(projectId)) as {
        success: boolean;
        document: ContextDocument;
      };
      setContextDoc(result.document);
      await loadProject();
      toast.success("Full context built from module contexts");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Build failed: ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSyncModule = async (mod: Module) => {
    if (!api || !project) return;
    setSyncing(true);
    setSyncingModule(mod);
    try {
      if (!mod.context?.trim()) {
        // No existing context — just analyze directly
        const result = await api.context.analyzeModule(project.path, mod.path.trim(), mod.type);
        await api.modules.update(projectId, mod.id, {
          context: result,
          lastAnalyzedAt: new Date().toISOString(),
        });
        await loadProject();
        if (selectedModule?.id === mod.id) {
          setSelectedModule({ ...mod, context: result });
        }
        toast.success(`Context generated for ${mod.name}`);
      } else {
        // Has context — resync and show diff
        const res = (await api.context.resyncModule(project.path, mod.path.trim(), mod.type)) as {
          newContext: string;
        };
        setSyncResult({ oldContext: mod.context, newContext: res.newContext });
        setShowSyncDialog(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Sync failed: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleAcceptSync = async (context: string) => {
    if (!api || !syncingModule) return;

    // If this was a pending context review, use the approve handler
    if (syncingModule.pendingContext) {
      await api.modules.approvePending(projectId, syncingModule.id);
    } else {
      await api.modules.update(projectId, syncingModule.id, {
        context,
        lastAnalyzedAt: new Date().toISOString(),
        pendingContextMeta: undefined,
        staleness: { status: "fresh", commitsBehind: 0, lastCheckedAt: new Date().toISOString() },
      });
    }

    await loadProject();
    if (selectedModule?.id === syncingModule.id) {
      setSelectedModule({
        ...syncingModule,
        context,
        pendingContext: undefined,
        staleness: { status: "fresh", commitsBehind: 0, lastCheckedAt: new Date().toISOString() },
      });
    }
    setShowSyncDialog(false);
    setSyncResult(null);
    setSyncingModule(null);
    toast.success(`Context updated for ${syncingModule.name}`);
  };

  const handleRejectSync = async () => {
    if (!api || !syncingModule) return;

    // If this was a pending context review, clear it
    if (syncingModule.pendingContext) {
      await api.modules.rejectPending(projectId, syncingModule.id);
      await loadProject();
      if (selectedModule?.id === syncingModule.id) {
        setSelectedModule({ ...syncingModule, pendingContext: undefined });
      }
      toast.info(`Pending context rejected for ${syncingModule.name}`);
    }

    setShowSyncDialog(false);
    setSyncResult(null);
    setSyncingModule(null);
  };

  if (!project) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4 flex-1">
          <Skeleton className="h-[400px] w-[280px] rounded-lg" />
          <Skeleton className="h-[400px] flex-1 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Breadcrumb + Actions */}
      <div className="flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer text-xs"
                onClick={onBack}
              >
                Projects
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-xs font-medium">
                {project.name}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  {generating ? "Building..." : "Build Context"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Combine all module contexts into one full document</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowBatchAnalyze(true)}
                  disabled={!project.modules.length}
                >
                  <Loader2 className="h-3 w-3 mr-1" />
                  Analyze All
                </Button>
              </TooltipTrigger>
              <TooltipContent>Use Claude CLI to analyze all modules and generate context</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowScanDialog(true)}
                >
                  <SearchIcon className="h-3 w-3 mr-1" />
                  Scan
                </Button>
              </TooltipTrigger>
              <TooltipContent>Auto-detect modules from your project files</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={claudeSetupStatus.configured ? "outline" : "default"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowSetupDialog(true)}
                >
                  <Plug className="h-3 w-3 mr-1" />
                  {claudeSetupStatus.configured ? "Connected" : "Setup Claude Code"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {claudeSetupStatus.configured
                  ? "Claude Code is configured — click to manage automation options"
                  : "Configure .mcp.json, CLAUDE.md instructions, and git hooks"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowModuleForm(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Module
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a new module to this project</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Title + metadata */}
      <div>
        <h2 className="text-base font-semibold">{project.name}</h2>
        {project.path && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
            {project.path}
          </p>
        )}
        {project.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {project.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
            <Box className="h-2.5 w-2.5" />
            {project.modules.length} module{project.modules.length !== 1 ? "s" : ""}
          </Badge>
          {project.lastUpdated && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatRelativeDate(project.lastUpdated)}
            </Badge>
          )}
          {(() => {
            const pendingCount = project.modules.filter(
              (m) => m.pendingContext
            ).length;
            const staleCount = project.modules.filter(
              (m) => m.staleness?.status === "stale" || m.staleness?.status === "outdated"
            ).length;
            return (
              <>
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
                    {pendingCount} pending review{pendingCount !== 1 ? "s" : ""}
                  </Badge>
                )}
                {staleCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                    {staleCount} stale
                  </Badge>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="modules" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit">
          <TabsTrigger value="modules" className="text-xs">
            Modules
          </TabsTrigger>
          <TabsTrigger value="full-context" className="text-xs">
            Full Context
          </TabsTrigger>
          <TabsTrigger value="coverage" className="text-xs">
            Coverage
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-xs">
            Preview (llms.txt)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-3 flex-1 min-h-0 flex flex-col">
          {project.modules.length === 0 ? (
            <Empty className="flex-1 rounded-lg border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Box className="h-5 w-5 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>No modules yet</EmptyTitle>
                <EmptyDescription>
                  Scan your project to auto-detect modules, or add them manually.
                </EmptyDescription>
              </EmptyHeader>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowScanDialog(true)}
                >
                  <SearchIcon className="h-3 w-3 mr-1.5" />
                  Scan Project
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowModuleForm(true)}
                >
                  <Plus className="h-3 w-3 mr-1.5" />
                  Add Module
                </Button>
              </div>
            </Empty>
          ) : (
            <div ref={containerRef} className="rounded-lg border flex-1 flex min-h-0 max-h-[calc(100vh-16rem)]">
              {/* Left: Module Tree */}
              <div
                className="shrink-0 overflow-hidden border-r h-full"
                style={{ width: sidebarWidth }}
              >
                <ModuleTree
                  modules={project.modules}
                  selectedId={selectedModule?.id}
                  onSelect={handleSelectModule}
                  onEdit={(mod) => {
                    setEditingModule(mod);
                    setShowModuleForm(true);
                  }}
                  onDelete={handleDeleteModule}
                  onSync={handleSyncModule}
                  onAddModule={() => setShowModuleForm(true)}
                />
              </div>

              {/* Resize handle */}
              <div
                className="shrink-0 w-2 cursor-col-resize flex items-center justify-center hover:bg-accent/50 active:bg-accent transition-colors"
                onMouseDown={handleMouseDown}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/40" />
              </div>

              {/* Right: Editor + Info Panels */}
              <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                {selectedModule ? (
                  <>
                    <div className="flex-1 min-h-0">
                      <ContextEditor
                        module={selectedModule}
                        onSave={handleSaveContext}
                        onDirtyChange={setHasDirtyEditor}
                        onSync={handleSyncModule}
                        syncing={syncing && syncingModule?.id === selectedModule.id}
                      />
                    </div>
                    {/* Bottom panel: Source Files / History */}
                    <div className="border-t shrink-0 max-h-[40%] overflow-hidden flex flex-col">
                      <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/30">
                        <button
                          className={`text-[10px] px-2 py-0.5 rounded ${bottomTab === "files" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                          onClick={() => setBottomTab("files")}
                        >
                          Source Files
                        </button>
                        <button
                          className={`text-[10px] px-2 py-0.5 rounded ${bottomTab === "history" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                          onClick={() => setBottomTab("history")}
                        >
                          History
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto">
                        {bottomTab === "files" ? (
                          <SourceFilesPanel module={selectedModule} />
                        ) : (
                          <GitHistoryPanel projectId={projectId} module={selectedModule} />
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <Empty className="h-full border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Box className="h-4 w-4 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>No module selected</EmptyTitle>
                      <EmptyDescription>
                        Select a module from the tree to edit its context
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="full-context" className="mt-3 flex-1 min-h-0 flex flex-col">
          {!contextDoc?.fullContext ? (
            <Empty className="flex-1 rounded-lg border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>No full context yet</EmptyTitle>
                <EmptyDescription>
                  Click &quot;Build Context&quot; to combine all module contexts into one document,
                  or write it manually.
                </EmptyDescription>
              </EmptyHeader>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleGenerate}
                  disabled={generating || !project.modules.length}
                >
                  <Sparkles className="h-3 w-3 mr-1.5" />
                  Build Context
                </Button>
              </div>
            </Empty>
          ) : (
            <ContextEditor
              fullContext={contextDoc.fullContext}
              onSaveFullContext={handleSaveFullContext}
            />
          )}
        </TabsContent>

        <TabsContent value="coverage" className="mt-3 flex-1 min-h-0 flex flex-col">
          <CoverageView
            projectId={projectId}
            onAddModule={(prefill) => {
              setEditingModule(null);
              setShowModuleForm(true);
              // Prefill is handled by passing initial data — we'll use a ref
              // For now, open the form (user can fill from there)
            }}
            onSelectModule={(moduleId) => {
              const mod = project.modules.find((m) => m.id === moduleId);
              if (mod) setSelectedModule(mod);
            }}
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-3 flex-1 min-h-0 flex flex-col">
          <ContextPreview project={project} contextDoc={contextDoc} />
        </TabsContent>
      </Tabs>

      {/* Module Form */}
      <ModuleForm
        open={showModuleForm}
        onOpenChange={(open) => {
          setShowModuleForm(open);
          if (!open) setEditingModule(null);
        }}
        editModule={editingModule}
        projectPath={project.path}
        onSubmit={async (data) => {
          if (editingModule) {
            await handleUpdateModule(editingModule.id, data);
          } else {
            await handleAddModule(data);
          }
          setEditingModule(null);
        }}
      />

      {/* Scan Modules Dialog */}
      <ScanModulesDialog
        open={showScanDialog}
        onOpenChange={setShowScanDialog}
        projectId={projectId}
        projectPath={project.path}
        existingModules={project.modules}
        onComplete={loadProject}
      />

      {/* Batch Analyze Dialog */}
      <BatchAnalyzeDialog
        open={showBatchAnalyze}
        onOpenChange={setShowBatchAnalyze}
        projectId={projectId}
        projectPath={project.path}
        modules={project.modules}
        onComplete={loadProject}
      />

      {/* Setup Claude Code Dialog */}
      <SetupClaudeDialog
        open={showSetupDialog}
        onOpenChange={(open) => {
          setShowSetupDialog(open);
          // Re-check setup status when dialog opens (e.g., hook may have been deleted)
          if (open && project?.path) {
            api?.mcp.checkProjectSetup(project.path).then(setClaudeSetupStatus);
          }
        }}
        projectId={projectId}
        projectPath={project.path}
        status={claudeSetupStatus}
        onComplete={loadProject}
      />

      {/* Sync Context Dialog */}
      <SyncContextDialog
        open={showSyncDialog}
        onOpenChange={(open) => {
          setShowSyncDialog(open);
          if (!open) {
            setSyncResult(null);
            setSyncingModule(null);
          }
        }}
        module={syncingModule}
        oldContext={syncResult?.oldContext || ""}
        newContext={syncResult?.newContext || ""}
        onAccept={handleAcceptSync}
        onReject={handleRejectSync}
      />

      {/* Unsaved changes warning */}
      <AlertDialog open={!!pendingModule} onOpenChange={(open) => !open && setPendingModule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in &quot;{selectedModule?.name}&quot;. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setHasDirtyEditor(false);
                setSelectedModule(pendingModule);
                setPendingModule(null);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Square,
  Copy,
  Check,
  Terminal,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import { useMcpStatus } from "@/hooks/use-mcp-status";
import { useElectron } from "@/hooks/use-electron";
import type { McpConfigSnippet } from "@/lib/types";

export default function SettingsPage() {
  const api = useElectron();
  const { settings, update } = useSettings();
  const mcp = useMcpStatus();
  const [claudePath, setClaudePath] = useState("");
  const [debounceMs, setDebounceMs] = useState("2000");
  const [copied, setCopied] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [dataPath, setDataPath] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [mcpConfig, setMcpConfig] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (settings) {
      setClaudePath(settings.claudeCliPath);
      setDebounceMs(String(settings.fileWatcher.debounceMs));
    }
  }, [settings]);

  useEffect(() => {
    if (api) {
      api.getAppVersion().then(setAppVersion);
      api.mcp.getConfig().then((config) => {
        setMcpConfig(JSON.stringify(config, null, 2));
      });
      api.getDataPath().then(setDataPath);
    }
  }, [api]);

  // Auto-save helper with debounce
  const autoSave = useCallback(
    (data: Record<string, unknown>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await update(data);
          setSaved(true);
          if (savedIndicatorRef.current) clearTimeout(savedIndicatorRef.current);
          savedIndicatorRef.current = setTimeout(() => setSaved(false), 2000);
        } catch {
          toast.error("Failed to save settings");
        }
      }, 1000);
    },
    [update]
  );

  // Auto-save when claudePath changes (after initial load)
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    if (!settings) return;
    autoSave({
      claudeCliPath: claudePath,
      fileWatcher: {
        ...settings.fileWatcher,
        debounceMs: parseInt(debounceMs) || 2000,
      },
    });
  }, [claudePath, debounceMs, autoSave, settings]);

  const handleDetectCli = async () => {
    if (!api) return;
    setDetecting(true);
    try {
      const detected = await api.settings.detectCli();
      if (detected) {
        setClaudePath(detected);
        toast.success(`Found Claude CLI at ${detected}`);
      } else {
        toast.error("Claude CLI not found. Install it or set the path manually.");
      }
    } finally {
      setDetecting(false);
    }
  };

  const handleBrowseCli = async () => {
    if (!api) return;
    const file = await api.dialog.selectFile({
      title: "Select Claude CLI Executable",
    });
    if (file) setClaudePath(file);
  };

  const copyConfig = async () => {
    await navigator.clipboard.writeText(mcpConfig);
    setCopied(true);
    toast.success("Config copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!settings) {
    return (
      <PageContainer title="Settings">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Settings" description="Configure Open Context">
      <Tabs defaultValue="general">
        <div className="flex items-center gap-3">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="mcp">MCP Server</TabsTrigger>
            <TabsTrigger value="watcher">File Watcher</TabsTrigger>
          </TabsList>
          {saved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 animate-in fade-in">
              <Check className="h-3 w-3 text-emerald-500" />
              Saved
            </span>
          )}
        </div>

        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Claude CLI</CardTitle>
              <CardDescription>
                Path to the Claude CLI executable used for module analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="claude-path">CLI Path</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="claude-path"
                    value={claudePath}
                    onChange={(e) => setClaudePath(e.target.value)}
                    placeholder="claude"
                    className="flex-1 font-mono text-sm h-8"
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={handleBrowseCli}
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Browse for executable</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={handleDetectCli}
                          disabled={detecting}
                        >
                          {detecting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Terminal className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Auto-detect Claude CLI</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Changes are saved automatically
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span>{appVersion || "0.1.0"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data Directory</span>
                <span className="text-xs font-mono truncate max-w-[400px]">
                  {dataPath || "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>MCP Server Status</CardTitle>
                  <CardDescription>
                    The MCP server exposes your project contexts to Claude Code
                  </CardDescription>
                </div>
                <Badge variant={mcp.running ? "default" : "secondary"}>
                  {mcp.running ? "Running" : "Stopped"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                {mcp.running ? (
                  <Button variant="destructive" size="sm" onClick={mcp.stop}>
                    <Square className="h-3 w-3 mr-1" />
                    Stop
                  </Button>
                ) : (
                  <Button size="sm" onClick={mcp.start}>
                    <Play className="h-3 w-3 mr-1" />
                    Start
                  </Button>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <Label>Auto-start on launch</Label>
                <Switch
                  checked={settings.mcpServer.autoStart}
                  onCheckedChange={(checked) =>
                    update({ mcpServer: { autoStart: checked } })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Claude Code Configuration</CardTitle>
              <CardDescription>
                Add this to your <code className="text-xs">.mcp.json</code> or{" "}
                <code className="text-xs">~/.claude.json</code> to connect
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative rounded-md bg-muted/50 border">
                <div className="flex items-center justify-between px-3 py-1.5 border-b">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    MCP config snippet
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] px-1.5"
                    onClick={copyConfig}
                  >
                    {copied ? (
                      <Check className="h-2.5 w-2.5 mr-1" />
                    ) : (
                      <Copy className="h-2.5 w-2.5 mr-1" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                  {mcpConfig || "Loading..."}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="watcher" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>File Watcher</CardTitle>
              <CardDescription>
                Watch project directories for changes and get notified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Enable file watching</Label>
                <Switch
                  checked={settings.fileWatcher.enabled}
                  onCheckedChange={(checked) =>
                    update({
                      fileWatcher: { ...settings.fileWatcher, enabled: checked },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="debounce">Debounce interval (ms)</Label>
                <Input
                  id="debounce"
                  type="number"
                  value={debounceMs}
                  onChange={(e) => setDebounceMs(e.target.value)}
                  className="w-32 h-8"
                />
                <p className="text-[10px] text-muted-foreground">
                  Changes are saved automatically
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

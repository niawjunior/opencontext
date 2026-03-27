"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Copy,
  Check,
  Terminal,
  FolderOpen,
  Loader2,
  Globe,
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
import { Badge } from "@/components/ui/badge";
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
import { useElectron } from "@/hooks/use-electron";
import type { McpConfigSnippet } from "@/lib/types";

export default function SettingsPage() {
  const api = useElectron();
  const { settings, update } = useSettings();
  const [claudePath, setClaudePath] = useState("");
  const [copied, setCopied] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [dataPath, setDataPath] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [mcpConfig, setMcpConfig] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [orgId, setOrgId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (settings) {
      setClaudePath(settings.claudeCliPath);
      setSupabaseUrl(settings.supabaseUrl || "");
      setSupabaseKey(settings.supabaseKey || "");
      setOrgId(settings.orgId || "");
      setApiKey(settings.apiKey || "");
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

  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    if (!settings) return;
    autoSave({ claudeCliPath: claudePath });
  }, [claudePath, autoSave, settings]);

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

  // Auto-save database settings
  const dbInitialLoadRef = useRef(true);
  useEffect(() => {
    if (dbInitialLoadRef.current) {
      dbInitialLoadRef.current = false;
      return;
    }
    if (!settings) return;
    autoSave({ supabaseUrl, supabaseKey, orgId, apiKey });
  }, [supabaseUrl, supabaseKey, orgId, apiKey, autoSave, settings]);

  const handleTestConnection = async () => {
    if (!api) return;
    setTestingConnection(true);
    try {
      // Save current credentials first
      await update({ supabaseUrl, supabaseKey, orgId });
      // Trigger store reconnection
      api.reconnectStore();
      // Wait a moment for the store to reconnect
      await new Promise((r) => setTimeout(r, 500));
      // Try listing projects
      const projects = await api.projects.list();
      toast.success(`Connected! Found ${projects.length} project(s).`);
    } catch (err) {
      toast.error(`Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTestingConnection(false);
    }
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
            <TabsTrigger value="database">Database</TabsTrigger>
            <TabsTrigger value="mcp">MCP Server</TabsTrigger>
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

        <TabsContent value="database" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Supabase Connection</CardTitle>
              <CardDescription>
                Connect to your Supabase database for project data storage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supabase-url">Supabase URL</Label>
                <Input
                  id="supabase-url"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supabase-key">Service Role Key</Label>
                <Input
                  id="supabase-key"
                  type="password"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  className="font-mono text-sm h-8"
                />
                <p className="text-[10px] text-muted-foreground">
                  Found in Supabase Dashboard &gt; Settings &gt; API &gt; service_role key
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-id">Organization ID</Label>
                <Input
                  id="org-id"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="oc_live_..."
                  className="font-mono text-sm h-8"
                />
                <p className="text-[10px] text-muted-foreground">
                  Used for MCP server authentication. Included in .mcp.json and CLI commands.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !supabaseUrl || !supabaseKey || !orgId}
                >
                  {testingConnection ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Test Connection
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Changes are saved automatically
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Remote MCP Server</CardTitle>
                  <CardDescription>
                    The MCP server runs remotely and exposes your project contexts to Claude Code
                  </CardDescription>
                </div>
                <Badge variant="default">
                  <Globe className="h-3 w-3 mr-1" />
                  Remote
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                No local server process needed. Claude Code connects directly to the remote MCP server via HTTP.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Claude Code Configuration</CardTitle>
              <CardDescription>
                Add this to your <code className="text-xs">.mcp.json</code> to connect, or use the Setup button on any project
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

      </Tabs>
    </PageContainer>
  );
}

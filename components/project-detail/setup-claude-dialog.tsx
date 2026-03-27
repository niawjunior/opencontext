"use client";

import { useState, useEffect } from "react";
import { Plug, FileText, GitBranch, Terminal, Check, Loader2, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useElectron } from "@/hooks/use-electron";
import { useSettings } from "@/hooks/use-settings";

interface SetupStatus {
  configured: boolean;
  hasClaudeMd: boolean;
  hasHuskyHook: boolean;
}

interface SetupClaudeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectPath: string;
  status: SetupStatus;
  onComplete: () => void;
}

export function SetupClaudeDialog({
  open,
  onOpenChange,
  projectId,
  projectPath,
  status,
  onComplete,
}: SetupClaudeDialogProps) {
  const api = useElectron();
  const { settings } = useSettings();
  const [setting, setSetting] = useState(false);
  const [mcpJson, setMcpJson] = useState(true);
  const [claudeMd, setClaudeMd] = useState(true);
  const [huskyHook, setHuskyHook] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const apiKey = settings?.apiKey || "";
  const cliCommand = `claude mcp add --transport http open-context ${
    apiKey
      ? `https://open-context-mcp.vercel.app/mcp --header 'Authorization: Bearer ${apiKey}'`
      : "https://open-context-mcp.vercel.app/mcp --header 'Authorization: Bearer <your-api-key>'"
  }`;

  const copyCliCommand = async () => {
    await navigator.clipboard.writeText(cliCommand);
    setCopiedCmd(true);
    toast.success("Command copied to clipboard");
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleSetup = async () => {
    if (!api) return;
    setSetting(true);
    try {
      const result = await api.mcp.setupProject(projectId, {
        mcpJson,
        claudeMd,
        huskyHook,
      });
      toast.success(`Setup complete! ${result.filesWritten.length} file(s) written.`);
      onComplete();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Setup failed: ${msg}`);
    } finally {
      setSetting(false);
    }
  };

  const options = [
    {
      id: "mcp-json",
      icon: Plug,
      label: ".mcp.json",
      description: "MCP server URL (commit this). Each dev adds their API key via `claude mcp add`",
      checked: mcpJson,
      onChange: setMcpJson,
      done: status.configured,
    },
    {
      id: "claude-md",
      icon: FileText,
      label: "CLAUDE.md instructions",
      description:
        "Tells Claude when and how to update context — includes MCP tool usage, CLI commands, and update triggers",
      checked: claudeMd,
      onChange: setClaudeMd,
      done: status.hasClaudeMd,
    },
    {
      id: "husky-hook",
      icon: GitBranch,
      label: "Git pre-push hook",
      description:
        "Smart context update on push — auto-detects husky or uses native git hooks",
      checked: huskyHook,
      onChange: setHuskyHook,
      done: status.hasHuskyHook,
    },
  ];

  const allDone = status.configured && status.hasClaudeMd && status.hasHuskyHook;
  const nothingSelected = ![mcpJson, claudeMd, huskyHook].some(Boolean);
  const selectedCount = [mcpJson, claudeMd, huskyHook].filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Setup Claude Code Integration
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure your project so Claude Code automatically has access to your
            context documentation. Choose what to set up:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {options.map((opt) => (
            <div
              key={opt.id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <Checkbox
                id={opt.id}
                checked={opt.checked}
                onCheckedChange={(checked) => opt.onChange(checked === true)}
                disabled={opt.done}
              />
              <div className="flex-1 min-w-0">
                <Label
                  htmlFor={opt.id}
                  className="text-xs font-medium flex items-center gap-2 cursor-pointer"
                >
                  <opt.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {opt.label}
                  {opt.done && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 gap-1 text-emerald-600"
                    >
                      <Check className="h-2.5 w-2.5" />
                      Done
                    </Badge>
                  )}
                </Label>
                <p className="text-[10px] text-muted-foreground mt-0.5 ml-5.5">
                  {opt.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Remote MCP info */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Remote MCP Server</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Run this command to add your API key to Claude Code.
            For team members, generate per-developer keys in the Team tab.
          </p>
          <div className="mt-2">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">
              Your CLI command (run once):
            </p>
            <div className="relative rounded-md bg-background border">
              <pre className="p-2 pr-8 text-[10px] font-mono whitespace-pre-wrap overflow-x-auto">
                {cliCommand}
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-5 w-5"
                onClick={copyCliCommand}
              >
                {copiedCmd ? (
                  <Check className="h-2.5 w-2.5" />
                ) : (
                  <Copy className="h-2.5 w-2.5" />
                )}
              </Button>
            </div>
            {!apiKey && (
              <p className="text-[10px] text-amber-500 mt-1">
                Set your API key in Settings → Database to include authentication.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onOpenChange(false)}
          >
            {allDone ? "Close" : "Cancel"}
          </Button>
          {!allDone && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSetup}
              disabled={setting || nothingSelected}
            >
              {setting ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Plug className="h-3 w-3 mr-1" />
              )}
              {setting ? "Setting up..." : `Setup (${selectedCount} item${selectedCount !== 1 ? "s" : ""})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

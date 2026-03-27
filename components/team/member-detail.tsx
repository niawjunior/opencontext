"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  Ban,
  FolderOpen,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useElectron } from "@/hooks/use-electron";
import type { MemberDetail as MemberDetailType, ProjectIndexEntry } from "@/lib/types";

interface MemberDetailProps {
  memberId: string;
  onDeleted: () => void;
}

export function MemberDetail({ memberId, onDeleted }: MemberDetailProps) {
  const api = useElectron();
  const [member, setMember] = useState<MemberDetailType | null>(null);
  const [projects, setProjects] = useState<ProjectIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const loadMember = useCallback(async () => {
    if (!api) return;
    try {
      const [m, p] = await Promise.all([
        api.team.getMember(memberId),
        api.projects.list(),
      ]);
      setMember(m);
      setProjects(p);
    } catch (err) {
      toast.error(`Failed to load member: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [api, memberId]);

  useEffect(() => {
    setLoading(true);
    setGeneratedKey(null);
    loadMember();
  }, [loadMember]);

  const handleGenerateKey = async () => {
    if (!api || !keyName.trim()) return;
    setGeneratingKey(true);
    try {
      const result = await api.team.generateKey(memberId, keyName.trim());
      setGeneratedKey(result.rawKey);
      setKeyName("");
      await loadMember();
      toast.success("API key generated");
    } catch (err) {
      toast.error(`Failed to generate key: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!api) return;
    try {
      await api.team.revokeKey(keyId);
      await loadMember();
      toast.success("Key revoked");
    } catch (err) {
      toast.error(`Failed to revoke key: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleToggleProject = async (projectId: string, assigned: boolean) => {
    if (!api) return;
    try {
      if (assigned) {
        await api.team.unassignProject(memberId, projectId);
      } else {
        await api.team.assignProject(memberId, projectId);
      }
      await loadMember();
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleDelete = async () => {
    if (!api) return;
    try {
      await api.team.deleteMember(memberId);
      toast.success("Member deleted");
      onDeleted();
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const copyToClipboard = async (text: string, type: "key" | "cmd") => {
    await navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
    toast.success("Copied to clipboard");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (!member) {
    return (
      <p className="text-sm text-muted-foreground">Member not found</p>
    );
  }

  const assignedIds = new Set(member.projects.map((p) => p.id));
  const activeKeys = member.apiKeys.filter((k) => !k.revokedAt);
  const revokedKeys = member.apiKeys.filter((k) => k.revokedAt);
  const cliCommand = generatedKey
    ? `claude mcp add --transport http open-context https://open-context-mcp.vercel.app/mcp --header 'Authorization: Bearer ${generatedKey}'`
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{member.name}</h2>
          {member.email && (
            <p className="text-xs text-muted-foreground">{member.email}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Delete
        </Button>
      </div>

      {/* API Keys */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xs">API Keys</CardTitle>
              <CardDescription className="text-[10px]">
                Keys for MCP server authentication
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                setKeyDialogOpen(true);
                setGeneratedKey(null);
              }}
            >
              <Plus className="h-2.5 w-2.5 mr-1" />
              Generate Key
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {activeKeys.length === 0 && revokedKeys.length === 0 && (
            <p className="text-[10px] text-muted-foreground py-2 text-center">
              No API keys yet. Generate one to get started.
            </p>
          )}
          {activeKeys.map((k) => (
            <div
              key={k.id}
              className="flex items-center gap-2 rounded-md border p-2"
            >
              <Key className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{k.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {k.keyPrefix}
                </div>
              </div>
              {k.lastUsedAt && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  Used {new Date(k.lastUsedAt).toLocaleDateString()}
                </span>
              )}
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                Active
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-destructive hover:text-destructive"
                onClick={() => handleRevokeKey(k.id)}
              >
                <Ban className="h-2.5 w-2.5" />
              </Button>
            </div>
          ))}
          {revokedKeys.map((k) => (
            <div
              key={k.id}
              className="flex items-center gap-2 rounded-md border p-2 opacity-50"
            >
              <Key className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{k.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {k.keyPrefix}
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                Revoked
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Project Access */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs">Project Access</CardTitle>
          <CardDescription className="text-[10px]">
            Select which projects this member can access via MCP
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {projects.length === 0 && (
            <p className="text-[10px] text-muted-foreground py-2 text-center">
              No projects in this organization
            </p>
          )}
          {projects.map((p) => {
            const assigned = assignedIds.has(p.id);
            return (
              <label
                key={p.id}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={assigned}
                  onCheckedChange={() => handleToggleProject(p.id, assigned)}
                />
                <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs">{p.name}</span>
              </label>
            );
          })}
        </CardContent>
      </Card>

      {/* Generate Key Dialog */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Generate API Key</DialogTitle>
            <DialogDescription className="text-xs">
              {generatedKey
                ? "Copy this key now — it won't be shown again."
                : `Create a new API key for ${member.name}`}
            </DialogDescription>
          </DialogHeader>

          {!generatedKey ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="key-name" className="text-xs">
                  Key Name
                </Label>
                <Input
                  id="key-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder={`${member.name}'s laptop`}
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleGenerateKey()}
                />
              </div>
              <DialogFooter>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleGenerateKey}
                  disabled={generatingKey || !keyName.trim()}
                >
                  {generatingKey && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  Generate
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-3">
              {/* Raw key */}
              <div className="space-y-1.5">
                <Label className="text-xs">API Key</Label>
                <div className="relative">
                  <Input
                    readOnly
                    value={generatedKey}
                    className="h-8 text-[10px] font-mono pr-8"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-0.5 h-7 w-7"
                    onClick={() => copyToClipboard(generatedKey, "key")}
                  >
                    {copiedKey ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* CLI command */}
              {cliCommand && (
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Terminal className="h-3 w-3" />
                    Setup Command
                  </Label>
                  <div className="relative rounded-md bg-muted/50 border">
                    <pre className="p-2 pr-8 text-[10px] font-mono whitespace-pre-wrap overflow-x-auto">
                      {cliCommand}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-5 w-5"
                      onClick={() => copyToClipboard(cliCommand, "cmd")}
                    >
                      {copiedCmd ? (
                        <Check className="h-2.5 w-2.5" />
                      ) : (
                        <Copy className="h-2.5 w-2.5" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    The developer runs this once in their terminal to connect
                    Claude Code to Open Context.
                  </p>
                </div>
              )}

              <p className="text-[10px] text-amber-500 font-medium">
                Save this key now. It cannot be shown again.
              </p>

              <DialogFooter>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setKeyDialogOpen(false)}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Delete {member.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will revoke all their API keys and remove project access.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-7 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

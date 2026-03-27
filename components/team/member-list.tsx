"use client";

import { useState } from "react";
import { Plus, Key, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useElectron } from "@/hooks/use-electron";
import type { MemberSummary } from "@/lib/types";

interface MemberListProps {
  members: MemberSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMemberCreated: () => void;
}

export function MemberList({
  members,
  selectedId,
  onSelect,
  onMemberCreated,
}: MemberListProps) {
  const api = useElectron();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!api || !name.trim()) return;
    setCreating(true);
    try {
      await api.team.createMember({
        name: name.trim(),
        email: email.trim() || undefined,
      });
      toast.success(`Member "${name.trim()}" created`);
      setName("");
      setEmail("");
      setDialogOpen(false);
      onMemberCreated();
    } catch (err) {
      toast.error(
        `Failed to create member: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Members</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      <div className="space-y-1">
        {members.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No team members yet
          </p>
        )}
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
              selectedId === m.id
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted/50"
            }`}
          >
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{m.name}</div>
              {m.email && (
                <div className="text-[10px] text-muted-foreground truncate">
                  {m.email}
                </div>
              )}
            </div>
            {m.keyCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                <Key className="h-2.5 w-2.5" />
                {m.keyCount}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="member-name" className="text-xs">
                Name
              </Label>
              <Input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alice"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-email" className="text-xs">
                Email <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alice@example.com"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
            >
              {creating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Create Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

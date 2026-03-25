"use client";

import { useState } from "react";
import { FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useElectron } from "@/hooks/use-electron";

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    path: string;
    description: string;
  }) => Promise<void>;
}

export function AddProjectDialog({
  open,
  onOpenChange,
  onSubmit,
}: AddProjectDialogProps) {
  const api = useElectron();
  const [name, setName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectFolder = async () => {
    if (!api) return;
    const folder = await api.dialog.selectFolder();
    if (folder) {
      setProjectPath(folder);
      if (!name) {
        const parts = folder.split("/");
        setName(parts[parts.length - 1] || "");
      }
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !projectPath.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), path: projectPath.trim(), description: description.trim() });
      setName("");
      setProjectPath("");
      setDescription("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Project</DialogTitle>
          <DialogDescription>
            Register a project to manage its context for LLMs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="path">Project Path</Label>
            <div className="flex gap-2">
              <Input
                id="path"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/Users/you/projects/my-project"
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={selectFolder}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of the project..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !projectPath.trim() || submitting}
          >
            {submitting ? "Adding..." : "Add Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

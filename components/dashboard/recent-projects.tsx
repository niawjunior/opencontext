"use client";

import { FolderOpen } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/format";
import type { ProjectIndexEntry } from "@/lib/types";

interface RecentProjectsProps {
  projects: ProjectIndexEntry[];
  onSelect: (id: string) => void;
}

export function RecentProjects({ projects, onSelect }: RecentProjectsProps) {
  const recent = [...projects]
    .sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    )
    .slice(0, 5);

  if (recent.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
          <CardDescription>No projects yet. Add one to get started.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Projects</CardTitle>
        <CardDescription>Recently updated projects</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {recent.map((project) => (
          <Button
            key={project.id}
            variant="ghost"
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={() => onSelect(project.id)}
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col items-start text-left min-w-0">
              <span className="font-medium text-sm">{project.name}</span>
              <span className="text-xs text-muted-foreground truncate max-w-full">
                {project.path}
              </span>
            </div>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {formatRelativeDate(project.lastUpdated)}
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

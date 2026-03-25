"use client";

import {
  FolderOpen,
  Blocks,
  Radio,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/format";
import type { ProjectIndexEntry } from "@/lib/types";

interface StatsCardsProps {
  projects: ProjectIndexEntry[];
  totalModules: number;
  mcpRunning: boolean;
}

export function StatsCards({ projects, totalModules, mcpRunning }: StatsCardsProps) {
  const lastUpdated = projects.length > 0
    ? formatRelativeDate(
        new Date(
          Math.max(...projects.map((p) => new Date(p.lastUpdated).getTime()))
        ).toISOString()
      )
    : "N/A";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{projects.length}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Modules</CardTitle>
          <Blocks className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalModules}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">MCP Server</CardTitle>
          <Radio className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Badge variant={mcpRunning ? "default" : "secondary"}>
            {mcpRunning ? "Running" : "Stopped"}
          </Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{lastUpdated}</div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, Circle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useElectron } from "@/hooks/use-electron";
import type { CoverageItem } from "@/lib/types";

interface CoverageData {
  totalItems: number;
  coveredItems: number;
  coveragePercent: number;
  items: CoverageItem[];
}

interface CoverageViewProps {
  projectId: string;
  onAddModule: (prefill: { name: string; type: string; path: string }) => void;
  onSelectModule: (moduleId: string) => void;
}

export function CoverageView({ projectId, onAddModule, onSelectModule }: CoverageViewProps) {
  const api = useElectron();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CoverageData | null>(null);

  useEffect(() => {
    if (!api) return;
    setLoading(true);
    (api.projects.getCoverage(projectId) as Promise<CoverageData>)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [api, projectId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.totalItems === 0) {
    return (
      <Empty className="flex-1 rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Circle className="h-5 w-5 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>No scannable modules found</EmptyTitle>
          <EmptyDescription>
            Could not detect any modules in this project to measure coverage against.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const covered = data.items.filter((i) => i.covered);
  const uncovered = data.items.filter((i) => !i.covered);

  return (
    <div className="rounded-lg border flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium">Context Coverage</span>
          <Badge
            variant={data.coveragePercent >= 80 ? "default" : "secondary"}
            className="text-[10px] px-1.5 py-0"
          >
            {data.coveredItems}/{data.totalItems} covered ({data.coveragePercent}%)
          </Badge>
        </div>
        <Progress value={data.coveragePercent} className="h-1.5" />
      </div>

      {/* Items */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Covered */}
          {covered.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 px-1">
                Covered ({covered.length})
              </p>
              <div className="space-y-0.5">
                {covered.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => item.moduleId && onSelectModule(item.moduleId)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="font-medium truncate flex-1">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                      {item.path}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uncovered */}
          {uncovered.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 px-1">
                Not covered ({uncovered.length})
              </p>
              <div className="space-y-0.5">
                {uncovered.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-accent transition-colors"
                  >
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    <span className="truncate flex-1">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                      {item.path}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2 shrink-0"
                      onClick={() =>
                        onAddModule({
                          name: item.name,
                          type: "module",
                          path: item.path,
                        })
                      }
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

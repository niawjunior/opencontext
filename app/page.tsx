"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/shared/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { McpStatusCard } from "@/components/dashboard/mcp-status";
import { useProjects } from "@/hooks/use-projects";
import { useMcpStatus } from "@/hooks/use-mcp-status";
import { useElectron } from "@/hooks/use-electron";
import type { Project } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const api = useElectron();
  const { projects, loading } = useProjects();
  const mcp = useMcpStatus();
  const [totalModules, setTotalModules] = useState(0);

  useEffect(() => {
    async function countModules() {
      if (!api || projects.length === 0) {
        setTotalModules(0);
        return;
      }
      let count = 0;
      for (const p of projects) {
        const full = (await api.projects.get(p.id)) as Project | null;
        if (full) count += full.modules.length;
      }
      setTotalModules(count);
    }
    countModules();
  }, [api, projects]);

  return (
    <PageContainer
      title="Dashboard"
      description="Overview of your context management"
    >
      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-48 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
        </div>
      ) : (
        <>
          <StatsCards
            projects={projects}
            totalModules={totalModules}
            mcpRunning={mcp.running}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <RecentProjects
              projects={projects}
              onSelect={(id) => router.push(`/projects?open=${id}`)}
            />
            <McpStatusCard
              running={mcp.running}
              onStart={mcp.start}
              onStop={mcp.stop}
            />
          </div>
        </>
      )}
    </PageContainer>
  );
}

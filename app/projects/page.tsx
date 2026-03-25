"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectList } from "@/components/projects/project-list";
import { AddProjectDialog } from "@/components/projects/add-project-dialog";
import { ProjectDetail } from "@/components/project-detail/project-detail";
import { useProjects } from "@/hooks/use-projects";

function ProjectsContent() {
  const { projects, loading, createProject, deleteProject } = useProjects();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Handle deep-link from dashboard
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) setSelectedId(openId);
  }, [searchParams]);

  if (selectedId) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <ProjectDetail
          projectId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  return (
    <PageContainer
      title="Projects"
      description="Manage project contexts for LLMs"
      actions={
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3 mr-1" />
          Add Project
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ProjectList
          projects={projects}
          onSelect={setSelectedId}
          onDelete={deleteProject}
        />
      )}

      <AddProjectDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onSubmit={async (data) => {
          const project = await createProject(data);
          if (project) setSelectedId(project.id);
        }}
      />
    </PageContainer>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer title="Projects">
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </PageContainer>
      }
    >
      <ProjectsContent />
    </Suspense>
  );
}

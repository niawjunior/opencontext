"use client";

import { useState, useEffect, useCallback } from "react";
import { useElectron } from "./use-electron";
import type { ProjectIndexEntry, Project } from "@/lib/types";

export function useProjects() {
  const api = useElectron();
  const [projects, setProjects] = useState<ProjectIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const list = (await api.projects.list()) as ProjectIndexEntry[];
      setProjects(list);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getProject = useCallback(
    async (id: string): Promise<Project | null> => {
      if (!api) return null;
      return (await api.projects.get(id)) as Project | null;
    },
    [api]
  );

  const createProject = useCallback(
    async (data: { name: string; path: string; description: string }) => {
      if (!api) return null;
      const project = (await api.projects.create(data)) as Project;
      await refresh();
      return project;
    },
    [api, refresh]
  );

  const updateProject = useCallback(
    async (
      id: string,
      data: Partial<{ name: string; path: string; description: string }>
    ) => {
      if (!api) return null;
      const project = (await api.projects.update(id, data)) as Project;
      await refresh();
      return project;
    },
    [api, refresh]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      if (!api) return;
      await api.projects.delete(id);
      await refresh();
    },
    [api, refresh]
  );

  return {
    projects,
    loading,
    refresh,
    getProject,
    createProject,
    updateProject,
    deleteProject,
  };
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc/client";
import { useOrg } from "@/components/org-provider";

const STORAGE_KEY = "aural:currentProjectId";

export interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  createdBy: string | null;
  _count: { interviews: number; sessions?: number };
}

interface ProjectContextValue {
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  setCurrentProject: (projectId: string) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  currentProject: null,
  setCurrentProject: () => {},
  isLoading: true,
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { currentOrg } = useOrg();

  const { data: projects = [], isLoading } = trpc.project.list.useQuery(
    { organizationId: currentOrg?.id ?? "" },
    { enabled: !!currentOrg, staleTime: 30_000 },
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  // Reset project selection when org changes
  useEffect(() => {
    setSelectedProjectId(null);
  }, [currentOrg?.id]);

  const currentProject = useMemo(() => {
    if (projects.length === 0) return null;
    const found = projects.find((p) => p.id === selectedProjectId);
    return found ?? projects[0];
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (currentProject && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, currentProject.id);
    }
  }, [currentProject]);

  const setCurrentProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, projectId);
    }
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects: projects as ProjectInfo[],
      currentProject: currentProject as ProjectInfo | null,
      setCurrentProject,
      isLoading,
    }),
    [projects, currentProject, setCurrentProject, isLoading],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}

"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ProjectId = "farreach" | "hero-pumps";

export interface ProjectConfig {
  id: ProjectId;
  name: string;
  code: string;
  // Whether this project has email sync
  hasEmailSync: boolean;
  // Whether this project has quotations
  hasQuotations: boolean;
}

export const PROJECTS: Record<ProjectId, ProjectConfig> = {
  farreach: {
    id: "farreach",
    name: "Farreach",
    code: "FR",
    hasEmailSync: false,
    hasQuotations: true,
  },
  "hero-pumps": {
    id: "hero-pumps",
    name: "Hero-Pumps",
    code: "HP",
    hasEmailSync: true,
    hasQuotations: false,
  },
};

interface ProjectContextValue {
  project: ProjectConfig;
  projectId: ProjectId;
  setProjectId: (id: ProjectId) => void;
  // Build API URL with project param
  apiUrl: (path: string) => string;
}

const STORAGE_KEY = "ssa-active-project";

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectIdState] = useState<ProjectId>("farreach");
  const [mounted, setMounted] = useState(false);

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ProjectId | null;
    if (stored && PROJECTS[stored]) {
      setProjectIdState(stored);
    }
    setMounted(true);
  }, []);

  // Persist to localStorage
  const setProjectId = useCallback((id: ProjectId) => {
    setProjectIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const project = PROJECTS[projectId];

  const apiUrl = useCallback(
    (path: string) => {
      const sep = path.includes("?") ? "&" : "?";
      return `${path}${sep}project=${projectId}`;
    },
    [projectId]
  );

  return (
    <ProjectContext.Provider value={{ project, projectId, setProjectId, apiUrl }}>
      {mounted ? children : null}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

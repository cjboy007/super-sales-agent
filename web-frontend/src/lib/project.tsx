"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ProjectId = string;

export interface ProjectConfig {
  id: ProjectId;
  name: string;
  emoji: string;
  // Whether this project has email sync
  hasEmailSync: boolean;
  // Whether this project has quotations
  hasQuotations: boolean;
}

export interface BetaAccessSession {
  workspaces?: string[];
  defaultWorkspace?: string | null;
  wildcard?: boolean;
  phone?: string;
  trialStartedAt?: string;
  trialExpiresAt?: string;
  contactPhone?: string;
}

export const PROJECTS: Record<string, ProjectConfig> = {
  farreach: {
    id: "farreach",
    name: "Farreach",
    emoji: "🔌",
    hasEmailSync: false,
    hasQuotations: true,
  },
  "hero-pumps": {
    id: "hero-pumps",
    name: "Hero-Pumps",
    emoji: "🏭",
    hasEmailSync: true,
    hasQuotations: false,
  },
};

interface ProjectContextValue {
  project: ProjectConfig;
  projectId: ProjectId;
  setProjectId: (id: ProjectId) => void;
  allowedWorkspaces: ProjectConfig[];
  canSwitchWorkspace: boolean;
  betaToken: string;
  setBetaToken: (token: string) => void;
  applyBetaAccessSession: (token: string, session: BetaAccessSession) => void;
  clearBetaToken: () => void;
  // Build API URL with project param
  apiUrl: (path: string) => string;
  authHeaders: () => Record<string, string>;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const STORAGE_KEY = "ssa-active-project";
const BETA_TOKEN_STORAGE_KEY = "ssa-beta-token";

const ProjectContext = createContext<ProjectContextValue | null>(null);

function titleFromId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || id;
}

function emojiForWorkspace(id: string): string {
  if (id === "farreach") return "🔌";
  if (id === "hero-pumps") return "🏭";
  return "◼";
}

function workspaceConfig(id: string, input: Partial<ProjectConfig> = {}): ProjectConfig {
  const existing = PROJECTS[id];
  return {
    id,
    name: input.name || existing?.name || titleFromId(id),
    emoji: input.emoji || existing?.emoji || emojiForWorkspace(id),
    hasEmailSync: input.hasEmailSync ?? existing?.hasEmailSync ?? true,
    hasQuotations: input.hasQuotations ?? existing?.hasQuotations ?? true,
  };
}

function workspacesFromSession(session: BetaAccessSession): ProjectConfig[] {
  const workspaces = Array.isArray(session.workspaces) ? session.workspaces : [];
  const scoped = workspaces.filter((workspace) => workspace && workspace !== "*");
  return scoped.map((workspace) => workspaceConfig(workspace));
}

function workspacesFromRuntime(value: unknown): ProjectConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const workspace = item as Record<string, unknown>;
      const id = typeof workspace.id === "string" ? workspace.id.trim() : "";
      if (!id) return [];
      const capabilities = workspace.capabilities && typeof workspace.capabilities === "object"
        ? workspace.capabilities as Record<string, unknown>
        : {};
      return [workspaceConfig(id, {
        name: typeof workspace.name === "string" ? workspace.name : undefined,
        hasEmailSync: capabilities.emailSync === true,
        hasQuotations: capabilities.quotations === true,
      })];
    });
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): HeadersInit {
  const headers = new Headers();
  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectIdState] = useState<ProjectId>("farreach");
  const [betaToken, setBetaTokenState] = useState("");
  const [allowedWorkspaces, setAllowedWorkspaces] = useState<ProjectConfig[]>([]);

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setProjectIdState(stored);
    }
    const storedBetaToken = localStorage.getItem(BETA_TOKEN_STORAGE_KEY) || "";
    setBetaTokenState(storedBetaToken);
    if (!storedBetaToken) {
      setAllowedWorkspaces(Object.values(PROJECTS));
    }
  }, []);

  // Persist to localStorage
  const setProjectId = useCallback((id: ProjectId) => {
    setProjectIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const chooseWorkspace = useCallback((workspaces: ProjectConfig[], preferred?: string | null) => {
    if (workspaces.length === 0) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "";
    const next = workspaces.find((workspace) => workspace.id === preferred)
      || workspaces.find((workspace) => workspace.id === stored)
      || workspaces[0];
    setProjectId(next.id);
  }, [setProjectId]);

  const persistBetaToken = useCallback((token: string) => {
    const normalized = token.trim();
    setBetaTokenState(normalized);
    if (typeof window === "undefined") return;
    if (normalized) {
      localStorage.setItem(BETA_TOKEN_STORAGE_KEY, normalized);
      document.cookie = `${BETA_TOKEN_STORAGE_KEY}=${encodeURIComponent(normalized)}; Path=/; SameSite=Lax; Max-Age=2592000`;
    } else {
      localStorage.removeItem(BETA_TOKEN_STORAGE_KEY);
      document.cookie = `${BETA_TOKEN_STORAGE_KEY}=; Path=/; SameSite=Lax; Max-Age=0`;
    }
  }, []);

  const applyBetaAccessSession = useCallback((token: string, session: BetaAccessSession) => {
    const scopedWorkspaces = workspacesFromSession(session);
    if (scopedWorkspaces.length > 0) {
      setAllowedWorkspaces(scopedWorkspaces);
      chooseWorkspace(scopedWorkspaces, session.defaultWorkspace);
    }
    persistBetaToken(token);
  }, [chooseWorkspace, persistBetaToken]);

  const clearBetaToken = useCallback(() => {
    persistBetaToken("");
    setAllowedWorkspaces(Object.values(PROJECTS));
  }, [persistBetaToken]);

  useEffect(() => {
    if (!betaToken) {
      setAllowedWorkspaces(Object.values(PROJECTS));
      return;
    }

    let cancelled = false;
    fetch("/api/runtime?action=workspaces", {
      headers: { Authorization: `Bearer ${betaToken}` },
    })
      .then(async (response) => {
        if (!response.ok) return [];
        const json = await response.json() as { data?: unknown };
        return workspacesFromRuntime(json.data);
      })
      .then((workspaces) => {
        if (cancelled || workspaces.length === 0) return;
        setAllowedWorkspaces(workspaces);
        chooseWorkspace(workspaces);
      })
      .catch(() => {
        // Keep the current local workspace list if the session metadata cannot be refreshed.
      });

    return () => {
      cancelled = true;
    };
  }, [betaToken, chooseWorkspace]);

  const project = allowedWorkspaces.find((workspace) => workspace.id === projectId) || workspaceConfig(projectId);
  const canSwitchWorkspace = allowedWorkspaces.length > 1;

  const apiUrl = useCallback(
    (path: string) => {
      const sep = path.includes("?") ? "&" : "?";
      return `${path}${sep}project=${projectId}`;
    },
    [projectId]
  );

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    if (betaToken) headers.Authorization = `Bearer ${betaToken}`;
    return headers;
  }, [betaToken]);

  const apiFetch = useCallback(
    (path: string, init: RequestInit = {}) => {
      return fetch(apiUrl(path), {
        ...init,
        headers: mergeHeaders(authHeaders(), init.headers),
      });
    },
    [apiUrl, authHeaders]
  );

  return (
    <ProjectContext.Provider value={{ project, projectId, setProjectId, allowedWorkspaces, canSwitchWorkspace, betaToken, setBetaToken: persistBetaToken, applyBetaAccessSession, clearBetaToken, apiUrl, authHeaders, apiFetch }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

import { NextRequest, NextResponse } from "next/server";
import { TRIAL_SESSION_COOKIE, validateTrialSessionToken, type TrialAccessSession } from "./trial-auth";

export interface WorkspaceAccessSession {
  tokenId: "open";
  workspaces: string[];
  trial?: TrialAccessSession;
}

type AccessSuccess = { ok: true; session: WorkspaceAccessSession };
type AccessFailure = { ok: false; response: NextResponse };
export type AccessResult = AccessSuccess | AccessFailure;
type WorkspaceAccessSuccess = AccessSuccess & { workspaceId: string; explicitWorkspace: boolean };
export type WorkspaceAccessResult = WorkspaceAccessSuccess | AccessFailure;

function trialSessionFromRequest(request?: NextRequest): TrialAccessSession | undefined {
  const token = request?.cookies.get(TRIAL_SESSION_COOKIE)?.value || "";
  if (!token) return undefined;
  const trial = validateTrialSessionToken(token);
  return trial.ok ? trial.session : undefined;
}

function openSession(request?: NextRequest): WorkspaceAccessSession {
  const trial = trialSessionFromRequest(request);
  return {
    tokenId: "open",
    workspaces: ["*"],
    ...(trial ? { trial } : {}),
  };
}

export function requireWorkspaceSession(request?: NextRequest): AccessResult {
  return { ok: true, session: openSession(request) };
}

export function hasWorkspaceAccess(_session: WorkspaceAccessSession, _workspaceId: string): boolean {
  return true;
}

export function hasAdminAccess(_session: WorkspaceAccessSession): boolean {
  return true;
}

export function filterWorkspaceScoped<T extends { workspaceId: string }>(
  _session: WorkspaceAccessSession,
  items: T[]
): T[] {
  return items;
}

export function requireWorkspaceAccess(request: NextRequest, _workspaceId: string): AccessResult {
  return requireWorkspaceSession(request);
}

function explicitWorkspaceId(request: NextRequest, body?: Record<string, unknown> | null): string {
  const bodyWorkspace = body?.workspaceId;
  if (typeof bodyWorkspace === "string" && bodyWorkspace.trim()) return bodyWorkspace.trim();
  const bodyProject = body?.project;
  if (typeof bodyProject === "string" && bodyProject.trim()) return bodyProject.trim();
  return request.nextUrl.searchParams.get("project")?.trim() || request.nextUrl.searchParams.get("workspaceId")?.trim() || "";
}

export function resolveWorkspaceId(request: NextRequest, body?: Record<string, unknown> | null): string {
  return explicitWorkspaceId(request, body) || "farreach";
}

export function requireResolvedWorkspaceAccess(
  request: NextRequest,
  body?: Record<string, unknown> | null
): WorkspaceAccessResult {
  const workspaceId = resolveWorkspaceId(request, body);
  return {
    ok: true,
    session: openSession(request),
    workspaceId,
    explicitWorkspace: Boolean(explicitWorkspaceId(request, body)),
  };
}

export function requireAdminWorkspaceAccess(request: NextRequest): AccessResult {
  return requireWorkspaceSession(request);
}

export function workspaceAccessIsScopedForRuntime(): boolean {
  return false;
}

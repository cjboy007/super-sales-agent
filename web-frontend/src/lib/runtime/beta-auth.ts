import { NextRequest, NextResponse } from "next/server";

export interface BetaAuthSession {
  tokenId: string;
  workspaces: string[];
}

type AuthSuccess = { ok: true; session: BetaAuthSession };
type AuthFailure = { ok: false; response: NextResponse };
export type AuthResult = AuthSuccess | AuthFailure;

export function validateBetaToken(token: string): AuthResult {
  return {
    ok: true,
    session: {
      tokenId: token ? "legacy-token-ignored" : "local-open",
      workspaces: ["*"],
    },
  };
}

export function requireBetaAuth(request: NextRequest): AuthResult {
  void request;
  return validateBetaToken("");
}

export function hasWorkspaceAccess(session: BetaAuthSession, workspaceId: string): boolean {
  return session.workspaces.includes("*") || session.workspaces.includes(workspaceId);
}

export function hasAdminAccess(session: BetaAuthSession): boolean {
  return session.workspaces.includes("*");
}

export function filterWorkspaceScoped<T extends { workspaceId: string }>(
  session: BetaAuthSession,
  items: T[]
): T[] {
  if (session.workspaces.includes("*")) return items;
  const allowed = new Set(session.workspaces);
  return items.filter((item) => allowed.has(item.workspaceId));
}

export function requireWorkspaceAccess(request: NextRequest, workspaceId: string): AuthResult {
  void workspaceId;
  return requireBetaAuth(request);
}

export function requireAdminBetaAuth(request: NextRequest): AuthResult {
  return requireBetaAuth(request);
}

export function resolveWorkspaceId(request: NextRequest, body?: Record<string, unknown> | null): string {
  const bodyWorkspace = body?.workspaceId;
  if (typeof bodyWorkspace === "string" && bodyWorkspace.trim()) return bodyWorkspace.trim();
  return request.nextUrl.searchParams.get("project") || "farreach";
}

export function betaAuthIsConfiguredForRuntime(): boolean {
  return false;
}

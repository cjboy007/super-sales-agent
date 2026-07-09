import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  requireAdminWorkspaceAccess,
  requireResolvedWorkspaceAccess,
  requireWorkspaceAccess,
  requireWorkspaceSession,
  workspaceAccessIsScopedForRuntime,
} from "./workspace-access";

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("workspace access", () => {
  it("keeps runtime access open", () => {
    const session = requireWorkspaceSession(request("http://localhost/api/runtime"));
    const workspace = requireWorkspaceAccess(request("http://localhost/api/leads?project=hero-pumps"), "hero-pumps");
    const admin = requireAdminWorkspaceAccess(request("http://localhost/api/config"));

    expect(session.ok).toBe(true);
    expect(workspace.ok).toBe(true);
    expect(admin.ok).toBe(true);
    if (session.ok) expect(session.session.workspaces).toEqual(["*"]);
    expect(workspaceAccessIsScopedForRuntime()).toBe(false);
  });

  it("resolves explicit workspace from query params or body and defaults to farreach", () => {
    const fromQuery = requireResolvedWorkspaceAccess(request("http://localhost/api/customers?project=hero-pumps"));
    const fromBody = requireResolvedWorkspaceAccess(request("http://localhost/api/customers"), { workspaceId: "acme" });
    const fallback = requireResolvedWorkspaceAccess(request("http://localhost/api/customers"));

    expect(fromQuery.ok && fromQuery.workspaceId).toBe("hero-pumps");
    expect(fromBody.ok && fromBody.workspaceId).toBe("acme");
    expect(fallback.ok && fallback.workspaceId).toBe("farreach");
  });
});

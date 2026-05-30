import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  requireBetaAuth,
  requireAdminBetaAuth,
  requireWorkspaceAccess,
  resolveWorkspaceId,
} from "./beta-auth";

const originalToken = process.env.SSA_BETA_AUTH_TOKEN;
const originalTokens = process.env.SSA_BETA_AUTH_TOKENS;

afterEach(() => {
  if (originalToken === undefined) delete process.env.SSA_BETA_AUTH_TOKEN;
  else process.env.SSA_BETA_AUTH_TOKEN = originalToken;

  if (originalTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalTokens;
});

function request(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe("beta auth", () => {
  it("ignores legacy beta auth env vars and leaves the app open locally", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "beta-123", workspaces: ["farreach"] },
    ]);

    const result = requireBetaAuth(request("http://localhost/api/runtime"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.workspaces).toEqual(["*"]);
    }
  });

  it("does not use bearer tokens for workspace scoping", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
      { token: "hero-token", workspaces: ["hero-pumps"] },
    ]);

    const result = requireWorkspaceAccess(
      request("http://localhost/api/leads?project=farreach", "farreach-token"),
      "farreach"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.workspaces).toEqual(["*"]);
    }
  });

  it("allows local cross-workspace routing without token checks", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
    ]);

    const result = requireWorkspaceAccess(
      request("http://localhost/api/leads?project=hero-pumps", "farreach-token"),
      "hero-pumps"
    );

    expect(result.ok).toBe(true);
  });

  it("does not add a separate admin token gate for settings", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
      { token: "admin-token", workspaces: ["*"] },
    ]);

    const scoped = requireAdminBetaAuth(request("http://localhost/api/config", "farreach-token"));
    const admin = requireAdminBetaAuth(request("http://localhost/api/config", "admin-token"));

    expect(scoped.ok).toBe(true);
    expect(admin.ok).toBe(true);
  });

  it("supports legacy single-token mode for private self-hosted deployments", () => {
    process.env.SSA_BETA_AUTH_TOKEN = "single-token";
    delete process.env.SSA_BETA_AUTH_TOKENS;

    const result = requireWorkspaceAccess(
      request("http://localhost/api/leads?project=hero-pumps", "single-token"),
      "hero-pumps"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.workspaces).toEqual(["*"]);
    }
  });

  it("resolves body workspace over query workspace for mutation routes", () => {
    const workspace = resolveWorkspaceId(
      request("http://localhost/api/runtime?project=farreach"),
      { workspaceId: "hero-pumps" }
    );

    expect(workspace).toBe("hero-pumps");
  });
});

import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  requireBetaAuth,
  requireAdminBetaAuth,
  requireWorkspaceAccess,
  requireResolvedWorkspaceAccess,
  betaAuthIsConfiguredForRuntime,
} from "./beta-auth";

const originalToken = process.env.SSA_BETA_AUTH_TOKEN;
const originalTokens = process.env.SSA_BETA_AUTH_TOKENS;
const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLocalGateway = process.env.SSA_LOCAL_GATEWAY;
const originalDeploymentMode = process.env.SSA_DEPLOYMENT_MODE;
const originalAuthRequired = process.env.SSA_BETA_AUTH_REQUIRED;
const originalTrialEnabled = process.env.SSA_TRIAL_ACCESS_ENABLED;
const originalTrialSmsProvider = process.env.SSA_TRIAL_SMS_PROVIDER;
const originalTrialReadOnly = process.env.SSA_TRIAL_READ_ONLY;

afterEach(() => {
  if (originalToken === undefined) delete process.env.SSA_BETA_AUTH_TOKEN;
  else process.env.SSA_BETA_AUTH_TOKEN = originalToken;

  if (originalTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalTokens;

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalLocalGateway === undefined) delete process.env.SSA_LOCAL_GATEWAY;
  else process.env.SSA_LOCAL_GATEWAY = originalLocalGateway;

  if (originalDeploymentMode === undefined) delete process.env.SSA_DEPLOYMENT_MODE;
  else process.env.SSA_DEPLOYMENT_MODE = originalDeploymentMode;

  if (originalAuthRequired === undefined) delete process.env.SSA_BETA_AUTH_REQUIRED;
  else process.env.SSA_BETA_AUTH_REQUIRED = originalAuthRequired;

  if (originalTrialEnabled === undefined) delete process.env.SSA_TRIAL_ACCESS_ENABLED;
  else process.env.SSA_TRIAL_ACCESS_ENABLED = originalTrialEnabled;

  if (originalTrialSmsProvider === undefined) delete process.env.SSA_TRIAL_SMS_PROVIDER;
  else process.env.SSA_TRIAL_SMS_PROVIDER = originalTrialSmsProvider;

  if (originalTrialReadOnly === undefined) delete process.env.SSA_TRIAL_READ_ONLY;
  else process.env.SSA_TRIAL_READ_ONLY = originalTrialReadOnly;
});

function request(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe("beta auth", () => {
  it("leaves the app open locally when beta auth is not configured", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-auth-open-test-"));
    process.env.SSA_DATA_ROOT = tempRoot;
    delete process.env.SSA_LOCAL_GATEWAY;
    delete process.env.SSA_DEPLOYMENT_MODE;
    delete process.env.SSA_BETA_AUTH_REQUIRED;
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;

    const result = requireBetaAuth(request("http://localhost/api/runtime"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.workspaces).toEqual(["*"]);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires a configured beta token in local gateway mode", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-auth-gateway-test-"));
    process.env.SSA_DATA_ROOT = tempRoot;
    process.env.SSA_LOCAL_GATEWAY = "true";
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;

    const result = requireBetaAuth(request("http://localhost/api/runtime"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires a configured beta token for external beta requests", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "beta-123", workspaces: ["farreach"] },
    ]);

    const result = requireBetaAuth(request("http://localhost/api/runtime"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("uses bearer tokens for workspace scoping", () => {
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
      expect(result.session.workspaces).toEqual(["farreach"]);
    }
  });

  it("accepts browser session cookies for beta access", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "cookie-token", workspaces: ["farreach"] },
    ]);

    const result = requireWorkspaceAccess(
      new NextRequest("http://localhost/api/customers?project=farreach", {
        headers: { Cookie: "ssa-beta-token=cookie-token" },
      }),
      "farreach"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.workspaces).toEqual(["farreach"]);
    }
  });

  it("blocks cross-workspace routing for scoped beta tokens", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
    ]);

    const result = requireWorkspaceAccess(
      request("http://localhost/api/leads?project=hero-pumps", "farreach-token"),
      "hero-pumps"
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("requires admin workspace scope for settings and operations", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
      { token: "admin-token", workspaces: ["*"] },
    ]);

    const scoped = requireAdminBetaAuth(request("http://localhost/api/config", "farreach-token"));
    const admin = requireAdminBetaAuth(request("http://localhost/api/config", "admin-token"));

    expect(scoped.ok).toBe(false);
    if (!scoped.ok) expect(scoped.response.status).toBe(403);
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

  it("loads server-side beta tokens from the runtime data root for packaged beta deployments", async () => {
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;
    process.env.SSA_LOCAL_GATEWAY = "true";
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-auth-config-test-"));
    process.env.SSA_DATA_ROOT = tempRoot;
    fs.mkdirSync(path.join(tempRoot, "security"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "security", "beta-auth.json"), JSON.stringify({
      tokens: [
        { name: "farreach-beta", token: "file-token", workspaces: ["farreach"] },
      ],
    }), "utf-8");
    expect(betaAuthIsConfiguredForRuntime()).toBe(true);
    const result = requireWorkspaceAccess(
      request("http://localhost/api/leads?project=farreach", "file-token"),
      "farreach"
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.workspaces).toEqual(["farreach"]);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("defaults a one-workspace beta token to its assigned workspace when no project is provided", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "alpha-a-token", workspaces: ["alpha-a"] },
    ]);

    const result = requireResolvedWorkspaceAccess(
      request("http://localhost/api/customers", "alpha-a-token")
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspaceId).toBe("alpha-a");
      expect(result.explicitWorkspace).toBe(false);
      expect(result.session.workspaces).toEqual(["alpha-a"]);
    }
  });

  it("rejects an ambiguous wildcard beta token when no project is provided", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "admin-token", workspaces: ["*"] },
    ]);

    const result = requireResolvedWorkspaceAccess(
      request("http://localhost/api/customers", "admin-token")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("rejects an ambiguous multi-workspace beta token when no project is provided", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "multi-token", workspaces: ["alpha-a", "alpha-b"] },
    ]);

    const result = requireResolvedWorkspaceAccess(
      request("http://localhost/api/customers", "multi-token")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("still defaults local open development to farreach when beta auth is not configured", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-auth-local-resolve-test-"));
    process.env.SSA_DATA_ROOT = tempRoot;
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;

    const result = requireResolvedWorkspaceAccess(request("http://localhost/api/customers"));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workspaceId).toBe("farreach");
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("ignores stale browser beta tokens for local open development when beta auth is not configured", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-auth-stale-local-token-test-"));
    process.env.SSA_DATA_ROOT = tempRoot;
    delete process.env.SSA_LOCAL_GATEWAY;
    delete process.env.SSA_DEPLOYMENT_MODE;
    delete process.env.SSA_BETA_AUTH_REQUIRED;
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;

    const result = requireResolvedWorkspaceAccess(new NextRequest("http://localhost/api/assistant/query?project=demo-exporter", {
      method: "POST",
      headers: { Cookie: "ssa-beta-token=old-invalid-token" },
      body: JSON.stringify({ question: "What is the current priority?" }),
    }), { question: "What is the current priority?" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspaceId).toBe("demo-exporter");
      expect(result.session.tokenId).toBe("local-token-ignored");
      expect(result.session.workspaces).toEqual(["*"]);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("keeps loopback localhost open when only file-based beta tokens exist and the browser has a stale token", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-auth-local-file-token-test-"));
    process.env.SSA_DATA_ROOT = tempRoot;
    delete process.env.SSA_LOCAL_GATEWAY;
    delete process.env.SSA_DEPLOYMENT_MODE;
    delete process.env.SSA_BETA_AUTH_REQUIRED;
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;
    fs.mkdirSync(path.join(tempRoot, "security"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "security", "beta-auth.json"), JSON.stringify({
      tokens: [
        { name: "local-operator", token: "valid-file-token", workspaces: ["*"] },
      ],
    }), "utf-8");

    const result = requireResolvedWorkspaceAccess(new NextRequest("http://127.0.0.1:3003/api/assistant/query?project=demo-exporter", {
      method: "POST",
      headers: { Cookie: "ssa-beta-token=old-invalid-token" },
      body: JSON.stringify({ question: "What is the current priority?" }),
    }), { question: "What is the current priority?" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspaceId).toBe("demo-exporter");
      expect(result.session.tokenId).toBe("local-token-ignored");
      expect(result.session.workspaces).toEqual(["*"]);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("accepts a verified trial session cookie for workspace access", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-auth-trial-test-"));
    process.env.SSA_DATA_ROOT = tempRoot;
    process.env.SSA_TRIAL_ACCESS_ENABLED = "true";
    process.env.SSA_TRIAL_SMS_PROVIDER = "mock";
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;
    const { requestTrialSmsCode, verifyTrialSmsCode } = await import("./trial-auth");

    await requestTrialSmsCode({ phone: "1xxxxxxxxxx", ip: "203.0.113.10" });
    const store = JSON.parse(fs.readFileSync(path.join(tempRoot, "security", "trial-access.json"), "utf-8"));
    const code = store.challenges[0].mockCode;
    const verified = await verifyTrialSmsCode({ phone: "1xxxxxxxxxx", code, ip: "203.0.113.10" });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const result = requireResolvedWorkspaceAccess(new NextRequest("http://localhost/api/customers", {
      headers: { Cookie: `ssa-trial-session=${verified.sessionToken}` },
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspaceId).toBe("farreach");
      expect(result.session.tokenId).toContain("trial-");
      expect(result.session.workspaces).toEqual(["farreach"]);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("blocks trial write requests when read-only trial mode is enabled", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-beta-auth-trial-readonly-test-"));
    process.env.SSA_DATA_ROOT = tempRoot;
    process.env.SSA_TRIAL_ACCESS_ENABLED = "true";
    process.env.SSA_TRIAL_SMS_PROVIDER = "mock";
    process.env.SSA_TRIAL_READ_ONLY = "true";
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;
    const { requestTrialSmsCode, verifyTrialSmsCode } = await import("./trial-auth");

    await requestTrialSmsCode({ phone: "1xxxxxxxxxx", ip: "203.0.113.10" });
    const store = JSON.parse(fs.readFileSync(path.join(tempRoot, "security", "trial-access.json"), "utf-8"));
    const verified = await verifyTrialSmsCode({ phone: "1xxxxxxxxxx", code: store.challenges[0].mockCode, ip: "203.0.113.10" });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const read = requireResolvedWorkspaceAccess(new NextRequest("http://localhost/api/customers", {
      headers: { Cookie: `ssa-trial-session=${verified.sessionToken}` },
    }));
    const write = requireResolvedWorkspaceAccess(new NextRequest("http://localhost/api/customers", {
      method: "POST",
      headers: { Cookie: `ssa-trial-session=${verified.sessionToken}` },
    }));

    expect(read.ok).toBe(true);
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.response.status).toBe(403);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { middleware } from "./middleware";

const originalToken = process.env.SSA_BETA_AUTH_TOKEN;
const originalTokens = process.env.SSA_BETA_AUTH_TOKENS;
const originalRequired = process.env.SSA_BETA_AUTH_REQUIRED;
const originalLocalGateway = process.env.SSA_LOCAL_GATEWAY;
const originalDeploymentMode = process.env.SSA_DEPLOYMENT_MODE;
const originalTrialEnabled = process.env.SSA_TRIAL_ACCESS_ENABLED;

afterEach(() => {
  if (originalToken === undefined) delete process.env.SSA_BETA_AUTH_TOKEN;
  else process.env.SSA_BETA_AUTH_TOKEN = originalToken;

  if (originalTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalTokens;

  if (originalRequired === undefined) delete process.env.SSA_BETA_AUTH_REQUIRED;
  else process.env.SSA_BETA_AUTH_REQUIRED = originalRequired;

  if (originalLocalGateway === undefined) delete process.env.SSA_LOCAL_GATEWAY;
  else process.env.SSA_LOCAL_GATEWAY = originalLocalGateway;

  if (originalDeploymentMode === undefined) delete process.env.SSA_DEPLOYMENT_MODE;
  else process.env.SSA_DEPLOYMENT_MODE = originalDeploymentMode;

  if (originalTrialEnabled === undefined) delete process.env.SSA_TRIAL_ACCESS_ENABLED;
  else process.env.SSA_TRIAL_ACCESS_ENABLED = originalTrialEnabled;
});

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { Cookie: cookie.includes("=") ? cookie : `ssa-beta-token=${cookie}` } : undefined,
  });
}

describe("beta access middleware", () => {
  it("keeps local development open when beta access is not configured", () => {
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;
    delete process.env.SSA_BETA_AUTH_REQUIRED;

    const response = middleware(request("/leads"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects protected pages to beta access when a token is configured", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "beta-token", workspaces: ["farreach"] },
    ]);

    const response = middleware(request("/leads"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/beta-access?next=%2Fleads");
  });

  it("keeps proxied production redirects on the public host", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "beta-token", workspaces: ["farreach"] },
    ]);

    const response = middleware(new NextRequest("http://localhost:3210/leads", {
      headers: {
        Host: "qwensales.com",
        "X-Forwarded-Host": "qwensales.com",
        "X-Forwarded-Proto": "https",
      },
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://qwensales.com/beta-access?next=%2Fleads");
  });


  it("lets valid beta cookie sessions open protected pages", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "beta-token", workspaces: ["farreach"] },
    ]);

    const response = middleware(request("/leads", "beta-token"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("can require page access for server-side token files without reading the file in middleware", () => {
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;
    process.env.SSA_BETA_AUTH_REQUIRED = "true";

    const missingToken = middleware(request("/leads"));
    const withCookie = middleware(request("/leads", "runtime-file-token"));

    expect(missingToken.status).toBe(307);
    expect(missingToken.headers.get("location")).toBe("http://localhost/beta-access?next=%2Fleads");
    expect(withCookie.status).toBe(200);
    expect(withCookie.headers.get("location")).toBeNull();
  });

  it("fails closed in local gateway mode when no page token source is projected into the environment", () => {
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;
    process.env.SSA_LOCAL_GATEWAY = "true";

    const missingToken = middleware(request("/leads"));
    const arbitraryCookie = middleware(request("/leads", "runtime-file-token"));

    expect(missingToken.status).toBe(307);
    expect(arbitraryCookie.status).toBe(307);
    expect(arbitraryCookie.headers.get("location")).toBe("http://localhost/beta-access?next=%2Fleads");
  });

  it("does not trust a cookie in forced page mode when environment tokens are configured", () => {
    process.env.SSA_BETA_AUTH_REQUIRED = "true";
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "configured-token", workspaces: ["farreach"] },
    ]);

    const response = middleware(request("/leads", "wrong-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/beta-access?next=%2Fleads");
  });

  it("leaves API requests to route-level auth handlers", () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "beta-token", workspaces: ["farreach"] },
    ]);

    const response = middleware(request("/api/customers?project=farreach"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the public user guide reachable before access is saved", () => {
    process.env.SSA_BETA_AUTH_REQUIRED = "true";

    const response = middleware(request("/user-guide"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("uses trial session cookies as the page access gate in trial mode", () => {
    process.env.SSA_TRIAL_ACCESS_ENABLED = "true";
    delete process.env.SSA_BETA_AUTH_TOKEN;
    delete process.env.SSA_BETA_AUTH_TOKENS;

    const missing = middleware(request("/leads"));
    const present = middleware(request("/leads", "ssa-trial-session=trial-session-token"));

    expect(missing.status).toBe(307);
    expect(missing.headers.get("location")).toBe("http://localhost/beta-access?next=%2Fleads");
    expect(present.status).toBe(200);
    expect(present.headers.get("location")).toBeNull();
  });
});

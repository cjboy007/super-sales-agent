import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
const originalLocalGateway = process.env.SSA_LOCAL_GATEWAY;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-files-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_BETA_AUTH_TOKENS;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  if (originalLocalGateway === undefined) delete process.env.SSA_LOCAL_GATEWAY;
  else process.env.SSA_LOCAL_GATEWAY = originalLocalGateway;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function requestFor(filePath: string, options: { project?: string; token?: string; download?: boolean } = {}): NextRequest {
  const project = options.project ? `&project=${encodeURIComponent(options.project)}` : "";
  const download = options.download ? "&download=true" : "";
  return new NextRequest(`http://localhost/api/files?path=${encodeURIComponent(filePath)}${project}${download}`, {
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : undefined,
  });
}

describe("/api/files route", () => {
  it("serves files through the runtime file adapter whitelist", async () => {
    const filePath = path.join(tempRoot, "companies", "farreach", "documents", "quote.txt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "local quote", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(filePath));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    expect(await response.text()).toBe("local quote");
  });

  it("serves workspace files through opaque registered tokens without encoding paths in the token", async () => {
    const { runtimeFileToken } = await import("@/lib/runtime");
    const filePath = path.join(tempRoot, "companies", "farreach", "documents", "token-quote.txt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "token quote", "utf-8");
    const { GET } = await import("./route");

    const token = runtimeFileToken(filePath, "farreach");
    const response = await GET(new NextRequest(`http://localhost/api/files?token=${encodeURIComponent(token)}&project=farreach`));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("token quote");
    expect(`http://localhost/api/files?token=${encodeURIComponent(token)}&project=farreach`).not.toContain(filePath);
    expect(`http://localhost/api/files?token=${encodeURIComponent(token)}&project=farreach`).not.toContain(tempRoot);
    expect(Buffer.from(token, "base64url").toString("utf-8")).not.toContain(filePath);
    expect(Buffer.from(token, "base64url").toString("utf-8")).not.toContain(tempRoot);
  });

  it("requires opaque file tokens instead of absolute path fallback in local gateway mode", async () => {
    process.env.SSA_LOCAL_GATEWAY = "true";
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "gateway-auth", workspaces: ["farreach"] },
    ]);
    const filePath = path.join(tempRoot, "companies", "farreach", "documents", "path-fallback.txt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "path fallback", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(filePath, {
      project: "farreach",
      token: "gateway-auth",
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("File token is required");
  });

  it("serves registered file tokens in local gateway mode", async () => {
    process.env.SSA_LOCAL_GATEWAY = "true";
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "gateway-auth", workspaces: ["farreach"] },
    ]);
    const { runtimeFileToken } = await import("@/lib/runtime");
    const filePath = path.join(tempRoot, "companies", "farreach", "documents", "gateway-token.txt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "gateway token", "utf-8");
    const { GET } = await import("./route");

    const token = runtimeFileToken(filePath, "farreach");
    const response = await GET(new NextRequest(`http://localhost/api/files?token=${encodeURIComponent(token)}&project=farreach`, {
      headers: { Authorization: "Bearer gateway-auth" },
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("gateway token");
  });

  it("rejects unregistered file tokens instead of decoding paths from the client", async () => {
    const filePath = path.join(tempRoot, "companies", "farreach", "documents", "forged-token.txt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "forged", "utf-8");
    const forgedToken = Buffer.from(filePath, "utf-8").toString("base64url");
    const { GET } = await import("./route");

    const response = await GET(new NextRequest(`http://localhost/api/files?token=${encodeURIComponent(forgedToken)}&project=farreach`));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("Invalid file token");
    expect(JSON.stringify(json)).not.toContain(filePath);
    expect(JSON.stringify(json)).not.toContain(tempRoot);
  });

  it("rejects cross-workspace file downloads even when the path is under the data root", async () => {
    const filePath = path.join(tempRoot, "companies", "hero-pumps", "documents", "quote.txt");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "hero quote", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(filePath, { project: "farreach", token: "farreach-token" }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain("outside allowed workspace directories");
  });

  it("does not serve shared runtime config through the workspace file route", async () => {
    const configPath = path.join(tempRoot, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ openaiApiKey: "encoded-secret" }), "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(configPath, { project: "farreach", token: "farreach-token" }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain("outside allowed workspace directories");
  });

  it("does not serve hidden workspace runtime files through the public file route", async () => {
    const tokenRegistryPath = path.join(tempRoot, "companies", "farreach", ".jadenos", "file-tokens.json");
    const decisionsPath = path.join(tempRoot, "companies", "farreach", "approvals", "side-effect-decisions.json");
    fs.mkdirSync(path.dirname(tokenRegistryPath), { recursive: true });
    fs.mkdirSync(path.dirname(decisionsPath), { recursive: true });
    fs.writeFileSync(tokenRegistryPath, JSON.stringify([{ token: "secret-token", path: "/tmp/customer.pdf" }]), "utf-8");
    fs.writeFileSync(decisionsPath, JSON.stringify([{ id: "side-effect-secret", payload: { to: "buyer@example.com" } }]), "utf-8");
    const { GET } = await import("./route");

    for (const internalPath of [tokenRegistryPath, decisionsPath]) {
      const response = await GET(requestFor(internalPath, { project: "farreach", token: "farreach-token" }));
      const json = await response.json();
      const serialized = JSON.stringify(json);

      expect(response.status).toBe(403);
      expect(json.error).toContain("Access denied");
      expect(serialized).not.toContain("secret-token");
      expect(serialized).not.toContain("side-effect-secret");
      expect(serialized).not.toContain("buyer@example.com");
      expect(serialized).not.toContain(tempRoot);
    }
  });

  it("rejects files outside the runtime file adapter whitelist", async () => {
    const outsidePath = path.join(os.tmpdir(), "outside-ssa-file.txt");
    fs.writeFileSync(outsidePath, "outside", "utf-8");
    const { GET } = await import("./route");

    const response = await GET(requestFor(outsidePath));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain("Access denied");
    fs.rmSync(outsidePath, { force: true });
  });
});

import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
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

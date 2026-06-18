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
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-worker-supervisor-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
    { name: "admin", token: "admin-token", workspaces: ["*"] },
  ]);
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(body: Record<string, unknown>, token = "admin-token"): NextRequest {
  return new NextRequest("http://localhost/api/worker-supervisor", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("/api/worker-supervisor route", () => {
  it("prepares a resident worker recovery setup and returns only business-facing status", async () => {
    const { POST } = await import("./route");

    const response = await POST(request({
      platform: "pm2",
      workspaceId: "farreach",
      workerId: "jaden-farreach-1",
      intervalMs: 5000,
      maxJobs: 5,
      maxAttempts: 3,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        status: "ready",
        workerLabel: "Jaden CRM worker",
        recovery: {
          autoRestart: true,
          startStop: true,
          healthCheck: true,
        },
        nextStep: expect.stringContaining("install"),
      },
    });
    expect(json.data).not.toHaveProperty("workspaceId");
    expect(json.data).not.toHaveProperty("commands");
    expect(json.data).not.toHaveProperty("platform");
    expect(json.data).not.toHaveProperty("configPath");
    expect(json.data).not.toHaveProperty("manifestPath");
    expect(json.data).not.toHaveProperty("dataRoot");

    const manifestPath = path.join(tempRoot, "runtime", "supervisors", "ssa-jaden-farreach-1.supervisor.json");
    const configPath = path.join(tempRoot, "runtime", "supervisors", "ecosystem.ssa-jaden-farreach-1.config.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(configPath)).toBe(true);

    const { summarizeWorkerSupervisorReadiness } = await import("@/lib/runtime/worker-supervisor");
    expect(summarizeWorkerSupervisorReadiness("farreach")).toMatchObject({
      status: "ready",
      configured: 1,
      reviewed: 1,
      capabilities: {
        autoRestart: true,
        startStop: true,
        healthCheck: true,
      },
    });

    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("pm2 ");
    expect(serialized).not.toContain("node ");
    expect(serialized).not.toContain("jaden-worker.mjs");
    expect(serialized).not.toContain("SSA_DATA_ROOT");
  });

  it("requires an admin beta token when beta access is configured", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { name: "workspace", token: "workspace-token", workspaces: ["farreach"] },
    ]);
    const { POST } = await import("./route");

    const response = await POST(request({ platform: "pm2" }, "workspace-token"));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Admin access is required.");
  });

  it("records worker control requests without executing or exposing supervisor commands", async () => {
    const { POST } = await import("./route");
    await POST(request({
      platform: "pm2",
      workspaceId: "farreach",
      workerId: "jaden-farreach-1",
    }));

    const response = await POST(request({
      action: "request-control",
      control: "restart",
      workspaceId: "farreach",
      workerId: "jaden-farreach-1",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        status: "requested",
        workerLabel: "Jaden CRM worker",
        actionLabel: "Restart worker",
        execution: "operator_review",
        nextStep: "Review the request in Operations and run it from the installed host supervisor.",
      },
    });
    expect(json.data).not.toHaveProperty("workspaceId");
    expect(json.data).not.toHaveProperty("requestId");

    const requestsDir = path.join(tempRoot, "runtime", "supervisors", "requests");
    const requestFiles = fs.readdirSync(requestsDir).filter((name) => name.endsWith(".json"));
    expect(requestFiles).toHaveLength(1);
    const audit = JSON.parse(fs.readFileSync(path.join(requestsDir, requestFiles[0]), "utf-8"));
    expect(audit).toMatchObject({
      id: expect.stringMatching(/^worker-control-/),
      workspaceId: "farreach",
      workerId: "jaden-farreach-1",
      control: "restart",
      status: "requested",
      execution: "operator_review",
    });

    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("pm2 ");
    expect(serialized).not.toContain("launchctl");
    expect(serialized).not.toContain("systemctl");
    expect(serialized).not.toContain("node ");
    expect(serialized).not.toContain("jaden-worker.mjs");
    expect(serialized).not.toContain("commands");
    expect(serialized).not.toContain("configPath");
  });
});

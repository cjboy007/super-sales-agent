import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
const originalAuthRequired = process.env.SSA_BETA_AUTH_REQUIRED;
const originalSecretsDir = process.env.SSA_SECRETS_DIR;
const originalProfile = process.env.SSA_PROFILE;
const originalEmailProfile = process.env.EMAIL_PROFILE;
const originalProfilePath = process.env.SSA_PROFILE_PATH;
const originalDemoOverride = process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES;
let tempRoot = "";

function writeRuntimeConfig(overrides: Record<string, unknown> = {}) {
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, "config.json"),
    JSON.stringify({
      imapHost: "imap.example.com",
      imapPort: "993",
      imapEncryption: "ssl",
      email: "sales@example.com",
      emailPassword: Buffer.from("mail-secret", "utf-8").toString("base64"),
      autoCapture: true,
      _encrypted: ["emailPassword"],
      ...overrides,
    }),
    "utf-8"
  );
}

function writeSupervisorManifest(overrides: Record<string, unknown> = {}) {
  const dir = path.join(tempRoot, "runtime", "supervisors");
  fs.mkdirSync(dir, { recursive: true });
  const workspaceId = typeof overrides.workspaceId === "string" ? overrides.workspaceId : "farreach";
  const workerId = typeof overrides.workerId === "string" ? overrides.workerId : `jaden-${workspaceId}-1`;
  const serviceName = `ssa-${workerId}`;
  fs.writeFileSync(
    path.join(dir, `${serviceName}.supervisor.json`),
    JSON.stringify({
      platform: "launchd",
      workspaceId,
      workerId,
      serviceName,
      restartPolicy: "always",
      commands: {
        start: "launchctl start hidden",
        stop: "launchctl stop hidden",
        restart: "launchctl restart hidden",
        health: "node hidden --status",
      },
      dataRoot: tempRoot,
      configPath: path.join(tempRoot, "runtime", "supervisors", "hidden.plist"),
      workerCommand: ["node", "hidden-worker"],
      statusCommand: ["node", "hidden-worker", "--status"],
      ...overrides,
    }),
    "utf-8"
  );
}

function request(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

function defaultRequest(): NextRequest {
  return request("http://localhost/api/health");
}

function workspaceRequest(token?: string, workspaceId = "farreach"): NextRequest {
  return request(`http://localhost/api/health?project=${workspaceId}`, token);
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-health-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_SECRETS_DIR = path.join(tempRoot, "isolated-profiles");
  process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES = "true";
  delete process.env.SSA_BETA_AUTH_TOKENS;
  delete process.env.SSA_PROFILE;
  delete process.env.EMAIL_PROFILE;
  delete process.env.SSA_PROFILE_PATH;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  if (originalAuthRequired === undefined) delete process.env.SSA_BETA_AUTH_REQUIRED;
  else process.env.SSA_BETA_AUTH_REQUIRED = originalAuthRequired;

  if (originalSecretsDir === undefined) delete process.env.SSA_SECRETS_DIR;
  else process.env.SSA_SECRETS_DIR = originalSecretsDir;

  if (originalProfile === undefined) delete process.env.SSA_PROFILE;
  else process.env.SSA_PROFILE = originalProfile;

  if (originalEmailProfile === undefined) delete process.env.EMAIL_PROFILE;
  else process.env.EMAIL_PROFILE = originalEmailProfile;

  if (originalProfilePath === undefined) delete process.env.SSA_PROFILE_PATH;
  else process.env.SSA_PROFILE_PATH = originalProfilePath;

  if (originalDemoOverride === undefined) delete process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES;
  else process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES = originalDemoOverride;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/health route", () => {
  it("returns an ok health payload", async () => {
    const { GET } = await import("./route");

    const response = await GET(defaultRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(new Date(json.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("requires workspace access for explicit project health details when beta auth is configured", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "alpha-a-token", workspaces: ["alpha-a"] },
    ]);
    const { GET } = await import("./route");

    const missing = await GET(request("http://localhost/api/health?project=alpha-a"));
    const crossWorkspace = await GET(new NextRequest("http://localhost/api/health?project=alpha-b", {
      headers: { Authorization: "Bearer alpha-a-token" },
    }));

    expect(missing.status).toBe(401);
    expect(crossWorkspace.status).toBe(403);
  });

  it("returns only global health without workspace readiness when beta auth is configured and no workspace is authorized", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "admin-token", workspaces: ["*"] },
    ]);
    const { GET } = await import("./route");

    const response = await GET(defaultRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta).toMatchObject({
      authConfigured: true,
      sideEffectsBlockedByDefault: true,
    });
    expect(json.beta).not.toHaveProperty("mailbox");
    expect(json.beta).not.toHaveProperty("realActions");
    expect(json.beta).not.toHaveProperty("workerRecovery");
    expect(json.beta).not.toHaveProperty("readiness");
  });

  it("includes worker readiness and queue health for beta operations", async () => {
    const { recordWorkerStatus } = await import("@/lib/runtime/worker-health");
    recordWorkerStatus({
      workerId: "health-api-worker",
      workspaceId: "farreach",
      startedAt: "2026-06-08T08:00:00.000Z",
      lastHeartbeatAt: "2026-06-08T08:00:30.000Z",
      status: "running",
      queue: {
        queued: 2,
        running: 0,
        completed: 5,
        failed: 1,
        retryable: 0,
      },
      alerts: ["1 failed job needs review"],
      lastActivityAt: "2026-06-08T08:00:30.000Z",
      lastActivitySummary: "Saw 3 mailbox messages, wrote 2 customer timeline items, wrote 1 order milestone, updated 1 customer record, recorded 1 lifecycle status change, and completed 1 queued task.",
      lastResult: {
        workerId: "health-api-worker",
        claimed: 1,
        completed: 1,
        failed: 0,
        retried: 0,
        exhausted: 0,
        inboxSynced: 3,
        crmActivities: 2,
        orderActivities: 1,
        customersUpdated: 1,
        lifecycleStatuses: 1,
        processedJobIds: ["job-1"],
      },
    });

    const { GET } = await import("./route");
    const response = await GET(defaultRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.worker).toMatchObject({
      status: "degraded",
      activity: {
        lastRunAt: "2026-06-08T08:00:30.000Z",
        lastActivityAt: "2026-06-08T08:00:30.000Z",
        lastActivitySummary: "Saw 3 mailbox messages, wrote 2 customer timeline items, wrote 1 order milestone, updated 1 customer record, recorded 1 lifecycle status change, and completed 1 queued task.",
        hasRecentActivity: true,
      },
      queue: {
        queued: 2,
        failed: 1,
      },
      latest: {
        status: "running",
        lastHeartbeatAt: "2026-06-08T08:00:30.000Z",
        recentRun: {
          claimed: 1,
          completed: 1,
          failed: 0,
          retried: 0,
          exhausted: 0,
          inboxSynced: 3,
          crmActivities: 2,
          orderActivities: 1,
          customersUpdated: 1,
          lifecycleStatuses: 1,
        },
      },
    });
    expect(json.worker.alerts).toContain("1 failed job needs review");
    const serialized = JSON.stringify(json.worker);
    expect(json.worker.latest).not.toHaveProperty("workerId");
    expect(json.worker).not.toHaveProperty("workers");
    expect(serialized).not.toContain("health-api-worker");
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("lastResult");
    expect(serialized).not.toContain("processedJobIds");
    expect(serialized).not.toContain("job-1");
  });

  it("reports beta readiness signals without exposing runtime paths or customer-page internals", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "admin-token", workspaces: ["*"] },
    ]);
    const { GET } = await import("./route");

    const response = await GET(workspaceRequest("admin-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta).toMatchObject({
      authConfigured: true,
      sideEffectsBlockedByDefault: true,
    });
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("dataRoot");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("channel_audit");
  });

  it("flags file-based beta tokens as incomplete until page access protection is enabled", async () => {
    delete process.env.SSA_BETA_AUTH_TOKENS;
    delete process.env.SSA_BETA_AUTH_REQUIRED;
    fs.mkdirSync(path.join(tempRoot, "security"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "security", "beta-auth.json"), JSON.stringify({
      tokens: [
        { name: "farreach-beta", token: "file-token", workspaces: ["farreach"] },
      ],
    }), "utf-8");
    const { GET } = await import("./route");

    const response = await GET(workspaceRequest("file-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.authConfigured).toBe(true);
    expect(json.beta.pageAccessProtected).toBe(false);
    expect(json.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "access-control",
        status: "needs_setup",
        detail: expect.stringContaining("server-side token"),
        action: expect.stringContaining("page access protection"),
      }),
    ]));
    expect(JSON.stringify(json.beta.readiness)).not.toContain("SSA_BETA_AUTH_REQUIRED");
  });

  it("returns a non-technical beta readiness checklist when external beta setup is incomplete", async () => {
    const { GET } = await import("./route");

    const response = await GET(defaultRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.readiness).toMatchObject({
      status: "needs_setup",
      ready: expect.any(Number),
      total: expect.any(Number),
      checks: expect.any(Array),
    });
    expect(json.beta.readiness.total).toBeGreaterThanOrEqual(6);
    expect(json.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "access-control",
        status: "needs_setup",
        label: expect.stringContaining("Beta access"),
      }),
      expect.objectContaining({
        id: "resident-worker",
        status: "needs_setup",
      }),
      expect.objectContaining({
        id: "real-action-safety",
        status: "ready",
      }),
      expect.objectContaining({
        id: "first-run-guidance",
        status: "ready",
        label: expect.stringContaining("First-run"),
        action: expect.stringContaining("onboarding"),
      }),
    ]));
    expect(json.beta.readiness.firstRunGuide).toEqual([
      expect.objectContaining({
        id: "start-onboarding",
        label: expect.stringContaining("onboarding"),
        href: "/jadenos/onboarding",
      }),
      expect.objectContaining({
        id: "seed-demo",
        label: expect.stringContaining("demo"),
        href: "/leads",
      }),
      expect.objectContaining({
        id: "connect-email",
        label: expect.stringContaining("email"),
        href: "/settings",
      }),
      expect.objectContaining({
        id: "import-customers",
        label: expect.stringContaining("customers"),
        href: "/intake",
      }),
      expect.objectContaining({
        id: "review-crm",
        label: expect.stringContaining("customer"),
        href: "/leads",
      }),
    ]);

    const serialized = JSON.stringify(json.beta.readiness);
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("SSA_BETA_AUTH");
    expect(serialized).not.toContain("SSA_ENABLE_REAL");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("workflow");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("channel_audit");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("curl");
    expect(serialized).not.toContain("POST");
  });

  it("does not mark a healthy worker as beta-ready until supervisor recovery is configured", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "admin-token", workspaces: ["*"] },
    ]);
    const { createSalesRuntime, seedDemoWorkspace } = await import("@/lib/runtime");
    const { recordWorkerStatus } = await import("@/lib/runtime/worker-health");
    const runtime = createSalesRuntime();
    seedDemoWorkspace(runtime, "farreach");
    recordWorkerStatus({
      workerId: "jaden-farreach-1",
      workspaceId: "farreach",
      startedAt: "2026-06-08T08:00:00.000Z",
      lastHeartbeatAt: new Date().toISOString(),
      status: "running",
      queue: {
        queued: 0,
        running: 0,
        completed: 3,
        failed: 0,
        retryable: 0,
      },
      alerts: [],
    });

    const { GET } = await import("./route");
    const response = await GET(workspaceRequest("admin-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.readiness.status).toBe("needs_setup");
    expect(json.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "worker-supervisor",
        status: "needs_setup",
        label: expect.stringContaining("Task recovery"),
      }),
      expect.objectContaining({
        id: "resident-worker",
        status: "ready",
      }),
    ]));
  });

  it("returns business-facing worker recovery capabilities without raw supervisor commands", async () => {
    writeSupervisorManifest();
    const { GET } = await import("./route");

    const response = await GET(defaultRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.workerRecovery).toMatchObject({
      status: "ready",
      configured: true,
      reviewed: true,
      capabilities: {
        autoRestart: true,
        startStop: true,
        healthCheck: true,
      },
      summary: "Task recovery is prepared with restart and health controls.",
      nextStep: "Keep the recovery setup installed and verify it after deployment changes.",
    });
    expect(json.beta.workerRecovery.availableActions).toEqual([
      "Start worker",
      "Stop worker",
      "Restart worker",
      "Check worker health",
    ]);

    const serialized = JSON.stringify(json.beta.workerRecovery);
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("dataRoot");
    expect(serialized).not.toContain("configPath");
    expect(serialized).not.toContain("workerCommand");
    expect(serialized).not.toContain("statusCommand");
    expect(serialized).not.toContain("commands");
    expect(serialized).not.toContain("launchctl");
    expect(serialized).not.toContain("systemctl");
    expect(serialized).not.toContain("pm2 ");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
  });

  it("evaluates worker recovery for the requested project instead of the default workspace", async () => {
    writeSupervisorManifest({
      workspaceId: "hero-pumps",
      workerId: "jaden-hero-pumps-1",
    });
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/health?project=hero-pumps"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.workerRecovery).toMatchObject({
      status: "ready",
      configured: true,
      reviewed: true,
      capabilities: {
        autoRestart: true,
        startStop: true,
        healthCheck: true,
      },
    });
    expect(json.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "worker-supervisor",
        status: "ready",
      }),
    ]));
    const serialized = JSON.stringify(json.beta.workerRecovery);
    expect(serialized).not.toContain("hero-pumps");
    expect(serialized).not.toContain("jaden-hero-pumps-1");
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("workerId");
  });

  it("returns real-action authorization status without exposing approval internals", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const executed = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "farreach",
      summary: "Send email to buyer@example.com: Quote PI-HEALTH-001",
      payload: {
        to: "buyer@example.com",
        subject: "Quote PI-HEALTH-001",
        jobId: "health-job-raw-1",
        provider: "smtp",
        payload: { path: tempRoot },
      },
      idempotencyKey: "farreach:email:buyer@example.com:Quote PI-HEALTH-001",
    });
    runtime.approveSideEffect(executed.id, { by: "Wilson" });
    runtime.recordSideEffectExecuted(executed.id, {
      result: {
        messageId: "smtp-message-health-1",
        provider: "smtp",
      },
    });
    const failed = runtime.requestSideEffect({
      kind: "crm.write",
      workspaceId: "farreach",
      summary: "Write CRM update for Health Buyer",
      payload: {
        customerName: "Health Buyer",
        subject: "Follow-up PI-HEALTH-002",
        channel_audit: "raw-channel-audit",
        dataRoot: tempRoot,
      },
      idempotencyKey: "farreach:crm:health-buyer:PI-HEALTH-002",
    });
    runtime.approveSideEffect(failed.id, { by: "Wilson" });
    runtime.recordSideEffectFailed(failed.id, {
      error: `CRM provider failed at ${tempRoot}/runtime/adapter.log`,
      canRetry: true,
    });

    const { GET } = await import("./route");
    const response = await GET(defaultRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.realActions).toMatchObject({
      status: "needs_review",
      blockedByDefault: true,
      counts: {
        requested: 2,
        approved: 1,
        executed: 1,
        failed: 1,
        retryable: 1,
      },
      summary: expect.stringContaining("waiting for review"),
      nextStep: expect.stringContaining("Review failed"),
    });
    expect(json.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "real-action-authorization",
        status: "needs_review",
        label: expect.stringContaining("Customer action"),
      }),
    ]));
    const serialized = JSON.stringify(json.beta.realActions);
    expect(serialized).not.toContain(executed.id);
    expect(serialized).not.toContain(failed.id);
    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).not.toContain("Health Buyer");
    expect(serialized).not.toContain("PI-HEALTH");
    expect(serialized).not.toContain("health-job-raw-1");
    expect(serialized).not.toContain("smtp-message-health-1");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("channel_audit");
    expect(serialized).not.toContain("dataRoot");
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("SSA_ENABLE_REAL");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
  });

  it("returns recent worker control requests as sanitized operational status", async () => {
    writeSupervisorManifest();
    const { requestWorkerControl } = await import("@/lib/runtime/worker-supervisor");
    requestWorkerControl({
      workspaceId: "farreach",
      workerId: "jaden-farreach-1",
      control: "restart",
      now: "2026-06-09T08:00:00.000Z",
    });
    const { GET } = await import("./route");

    const response = await GET(defaultRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.workerRecovery.recentRequests).toEqual([
      expect.objectContaining({
        actionLabel: "Restart worker",
        status: "requested",
        requestedAt: "2026-06-09T08:00:00.000Z",
        nextStep: "Review the request in Operations and run it from the installed host supervisor.",
      }),
    ]);
    expect(json.beta.workerRecovery.recentRequests[0]).not.toHaveProperty("requestId");
    expect(json.beta.workerRecovery.recentRequests[0]).not.toHaveProperty("workerId");
    expect(json.beta.workerRecovery.recentRequests[0]).not.toHaveProperty("workspaceId");
    expect(json.beta.workerRecovery.recentRequests[0]).not.toHaveProperty("control");
    const serialized = JSON.stringify(json.beta.workerRecovery);
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("jaden-farreach-1");
    expect(serialized).not.toContain("worker-control-");
    expect(serialized).not.toContain("launchctl");
    expect(serialized).not.toContain("systemctl");
    expect(serialized).not.toContain("pm2 ");
    expect(serialized).not.toContain("jaden-worker.mjs");
  });

  it("separates seeded customer activity from real mailbox sync readiness", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "admin-token", workspaces: ["*"] },
    ]);
    writeSupervisorManifest();
    const { createSalesRuntime, seedDemoWorkspace } = await import("@/lib/runtime");
    const { recordWorkerStatus } = await import("@/lib/runtime/worker-health");
    const runtime = createSalesRuntime();
    seedDemoWorkspace(runtime, "farreach");
    recordWorkerStatus({
      workerId: "ready-worker",
      workspaceId: "farreach",
      startedAt: "2026-06-08T08:00:00.000Z",
      lastHeartbeatAt: new Date().toISOString(),
      status: "running",
      queue: {
        queued: 0,
        running: 0,
        completed: 3,
        failed: 0,
        retryable: 0,
      },
      alerts: [],
      lastResult: {
        workerId: "ready-worker",
        claimed: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        exhausted: 0,
        inboxSynced: 0,
        lifecycleStatuses: 0,
        processedJobIds: [],
      },
    });

    const { GET } = await import("./route");
    const response = await GET(workspaceRequest("admin-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.readiness.status).toBe("needs_setup");
    expect(json.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "mailbox-sync",
        status: "needs_setup",
        label: expect.stringContaining("Mailbox"),
        detail: "Mailbox setup needs attention before incoming customer email can enter CRM.",
        action: "Complete the mailbox connection in Settings, then run automation again.",
      }),
      expect.objectContaining({
        id: "customer-activity",
        status: "ready",
      }),
    ]));
    expect(json.beta.mailbox).toMatchObject({
      status: "needs_setup",
      configured: false,
      autoCapture: true,
      recentlySynced: false,
      summary: "Mailbox setup needs attention before incoming customer email can enter CRM.",
      nextStep: "Complete the mailbox connection in Settings, then run automation again.",
      requiredActions: ["Add the mailbox password or app password."],
    });

    const serialized = JSON.stringify(json.beta.readiness);
    expect(serialized).not.toContain("sales@example.com");
    expect(serialized).not.toContain("imap.example.com");
    expect(serialized).not.toContain("993");
    expect(serialized).not.toContain("mail-secret");
    expect(serialized).not.toContain("emailPassword");
    const mailboxSerialized = JSON.stringify(json.beta.mailbox);
    expect(mailboxSerialized).not.toContain("sales@example.com");
    expect(mailboxSerialized).not.toContain("imap.example.com");
    expect(mailboxSerialized).not.toContain("993");
    expect(mailboxSerialized).not.toContain("mail-secret");
    expect(mailboxSerialized).not.toContain("emailPassword");
    expect(mailboxSerialized).not.toContain(tempRoot);
  });

  it("marks beta readiness ready when auth, worker, demo data, customer activity, and order timeline are present", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "admin-token", workspaces: ["*"] },
    ]);
    writeSupervisorManifest();
    writeRuntimeConfig();
    const { createSalesRuntime, seedDemoWorkspace } = await import("@/lib/runtime");
    const { recordWorkerStatus } = await import("@/lib/runtime/worker-health");
    const runtime = createSalesRuntime();
    seedDemoWorkspace(runtime, "farreach");
    const action = runtime.requestSideEffect({
      kind: "crm.write",
      workspaceId: "farreach",
      summary: "Write CRM update for readiness buyer",
      payload: {
        customerName: "Readiness Buyer",
        subject: "Approved readiness CRM update",
      },
      idempotencyKey: "farreach:crm:readiness-buyer:approved-readiness-crm-update",
    });
    runtime.approveSideEffect(action.id, { by: "Wilson" });
    runtime.recordSideEffectExecuted(action.id, {
      result: {
        status: "executed",
      },
    });
    recordWorkerStatus({
      workerId: "ready-worker",
      workspaceId: "farreach",
      startedAt: "2026-06-08T08:00:00.000Z",
      lastHeartbeatAt: new Date().toISOString(),
      status: "running",
      queue: {
        queued: 0,
        running: 0,
        completed: 3,
        failed: 0,
        retryable: 0,
      },
      alerts: [],
      lastResult: {
        workerId: "ready-worker",
        claimed: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        exhausted: 0,
        inboxSynced: 3,
        lifecycleStatuses: 1,
        processedJobIds: [],
      },
    });

    const { GET } = await import("./route");
    const response = await GET(workspaceRequest("admin-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.beta.readiness).toMatchObject({
      status: "ready",
      ready: expect.any(Number),
      total: expect.any(Number),
    });
    expect(json.beta.readiness.ready).toBe(json.beta.readiness.total);
    expect(json.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "access-control", status: "ready" }),
      expect.objectContaining({ id: "first-run-guidance", status: "ready" }),
      expect.objectContaining({ id: "resident-worker", status: "ready" }),
      expect.objectContaining({ id: "worker-supervisor", status: "ready" }),
      expect.objectContaining({ id: "mailbox-sync", status: "ready" }),
      expect.objectContaining({ id: "customer-activity", status: "ready" }),
      expect.objectContaining({ id: "order-timeline", status: "ready" }),
      expect.objectContaining({ id: "real-action-authorization", status: "ready" }),
      expect.objectContaining({ id: "operator-recovery", status: "ready" }),
    ]));

    const serialized = JSON.stringify(json.beta.readiness);
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("dataRoot");
    expect(serialized).not.toContain("configPath");
    expect(serialized).not.toContain("workerCommand");
    expect(serialized).not.toContain("launchctl");
  });
});

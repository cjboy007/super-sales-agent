import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerHealthSummary } from "./worker-health";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalSecretsDir = process.env.SSA_SECRETS_DIR;
const originalProfile = process.env.SSA_PROFILE;
const originalEmailProfile = process.env.EMAIL_PROFILE;
const originalProfilePath = process.env.SSA_PROFILE_PATH;
let tempRoot = "";

function worker(inboxSynced = 0, overrides: Partial<WorkerHealthSummary> = {}): WorkerHealthSummary {
  return {
    status: "ok",
    queue: {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      retryable: 0,
    },
    alerts: [],
    workers: [],
    latest: {
      workerId: "mailbox-worker",
      workspaceId: "farreach",
      startedAt: "2026-06-08T08:00:00.000Z",
      lastHeartbeatAt: "2026-06-08T08:00:30.000Z",
      status: "running",
      queue: {
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        retryable: 0,
      },
      alerts: [],
      lastResult: {
        workerId: "mailbox-worker",
        claimed: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        exhausted: 0,
        inboxSynced,
        lifecycleStatuses: 0,
        processedJobIds: [],
      },
    },
    ...overrides,
  };
}

function writeConfig(overrides: Record<string, unknown>) {
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, "config.json"),
    JSON.stringify({
      email: "sales@example.com",
      imapHost: "imap.example.com",
      imapPort: "993",
      emailPassword: Buffer.from("mail-secret", "utf-8").toString("base64"),
      autoCapture: true,
      _encrypted: ["emailPassword"],
      ...overrides,
    }),
    "utf-8"
  );
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-mailbox-readiness-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_SECRETS_DIR = path.join(tempRoot, "isolated-profiles");
  delete process.env.SSA_PROFILE;
  delete process.env.EMAIL_PROFILE;
  delete process.env.SSA_PROFILE_PATH;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  if (originalSecretsDir === undefined) delete process.env.SSA_SECRETS_DIR;
  else process.env.SSA_SECRETS_DIR = originalSecretsDir;
  if (originalProfile === undefined) delete process.env.SSA_PROFILE;
  else process.env.SSA_PROFILE = originalProfile;
  if (originalEmailProfile === undefined) delete process.env.EMAIL_PROFILE;
  else process.env.EMAIL_PROFILE = originalEmailProfile;
  if (originalProfilePath === undefined) delete process.env.SSA_PROFILE_PATH;
  else process.env.SSA_PROFILE_PATH = originalProfilePath;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("mailbox readiness", () => {
  it("needs setup when mailbox capture lacks credentials", async () => {
    writeConfig({ emailPassword: "" });
    const { summarizeMailboxReadiness } = await import("./mailbox-readiness");

    expect(summarizeMailboxReadiness(worker(5))).toMatchObject({
      status: "needs_setup",
      configured: false,
      autoCapture: true,
      recentlySynced: true,
      summary: "Mailbox setup needs attention before incoming customer email can enter CRM.",
      nextStep: "Complete the mailbox connection in Settings, then run the resident worker again.",
      requiredActions: ["Add the mailbox password or app password."],
    });
  });

  it("needs setup when automatic mailbox capture is disabled", async () => {
    writeConfig({ autoCapture: false });
    const { summarizeMailboxReadiness } = await import("./mailbox-readiness");

    expect(summarizeMailboxReadiness(worker(5))).toMatchObject({
      status: "needs_setup",
      configured: true,
      autoCapture: false,
      recentlySynced: true,
      requiredActions: ["Enable automatic mailbox capture."],
      nextStep: "Enable automatic mailbox capture so inbound customer messages create CRM activity.",
    });
  });

  it("needs review when mailbox is configured but no recent sync is visible", async () => {
    writeConfig({});
    const { summarizeMailboxReadiness } = await import("./mailbox-readiness");

    expect(summarizeMailboxReadiness(worker(0))).toMatchObject({
      status: "needs_review",
      configured: true,
      autoCapture: true,
      recentlySynced: false,
      requiredActions: ["Run the resident worker until a new inbound mail sync is visible."],
      nextStep: "Start or repair the resident worker, then confirm new mail appears in the customer timeline.",
    });
  });

  it("is ready when mailbox is configured and the worker recently synced mail", async () => {
    writeConfig({});
    const { summarizeMailboxReadiness } = await import("./mailbox-readiness");

    expect(summarizeMailboxReadiness(worker(3))).toMatchObject({
      status: "ready",
      configured: true,
      autoCapture: true,
      recentlySynced: true,
      requiredActions: [],
      nextStep: "Monitor new inbound mail in the customer timeline.",
    });
  });

  it("stays ready when a resident worker has recent mailbox activity followed by an idle heartbeat", async () => {
    writeConfig({});
    const { summarizeMailboxReadiness } = await import("./mailbox-readiness");

    expect(summarizeMailboxReadiness(worker(0, {
      activity: {
        lastRunAt: "2026-06-08T08:05:00.000Z",
        lastActivityAt: "2026-06-08T08:04:55.000Z",
        lastRunSummary: "Latest run found no new mail, queued tasks, customer updates, order updates, or lifecycle changes.",
        lastActivitySummary: "Saw 1 mailbox message and wrote 1 customer timeline item.",
        hasRecentActivity: true,
      },
    }))).toMatchObject({
      status: "ready",
      configured: true,
      autoCapture: true,
      recentlySynced: true,
      requiredActions: [],
    });
  });

  it("stays ready when the latest heartbeat is idle but the last activity was mailbox sync", async () => {
    writeConfig({});
    const { summarizeMailboxReadiness } = await import("./mailbox-readiness");

    expect(summarizeMailboxReadiness(worker(0, {
      activity: {
        lastRunAt: "2026-06-08T08:05:00.000Z",
        lastActivityAt: "2026-06-08T08:04:55.000Z",
        lastRunSummary: "Latest run found no new mail, queued tasks, customer updates, order updates, or lifecycle changes.",
        lastActivitySummary: "Saw 1 mailbox message and wrote 1 customer timeline item.",
        hasRecentActivity: false,
      },
    }))).toMatchObject({
      status: "ready",
      configured: true,
      autoCapture: true,
      recentlySynced: true,
      requiredActions: [],
    });
  });

  it("is ready when mailbox credentials live in an external workspace profile", async () => {
    writeConfig({
      email: "",
      imapHost: "",
      imapPort: "",
      emailPassword: "",
    });
    const secretsDir = path.join(tempRoot, "external-profiles");
    fs.mkdirSync(secretsDir, { recursive: true });
    fs.writeFileSync(
      path.join(secretsDir, "farreach.env"),
      [
        "IMAP_HOST=imap.external.example",
        "IMAP_PORT=993",
        "IMAP_USER=sales@external.example",
        "IMAP_PASS=external-mail-secret",
      ].join("\n"),
      "utf-8"
    );
    process.env.SSA_SECRETS_DIR = secretsDir;
    const { summarizeMailboxReadiness } = await import("./mailbox-readiness");

    const summary = summarizeMailboxReadiness(worker(3), { workspaceId: "farreach" });

    expect(summary).toMatchObject({
      status: "ready",
      configured: true,
      autoCapture: true,
      recentlySynced: true,
      requiredActions: [],
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("sales@external.example");
    expect(serialized).not.toContain("imap.external.example");
    expect(serialized).not.toContain("993");
    expect(serialized).not.toContain("external-mail-secret");
    expect(serialized).not.toContain(secretsDir);
  });

  it("returns only business-safe readiness text", async () => {
    writeConfig({ emailPassword: "" });
    const { summarizeMailboxReadiness } = await import("./mailbox-readiness");

    const serialized = JSON.stringify(summarizeMailboxReadiness(worker(5)));

    expect(serialized).not.toContain("sales@example.com");
    expect(serialized).not.toContain("imap.example.com");
    expect(serialized).not.toContain("993");
    expect(serialized).not.toContain("mail-secret");
    expect(serialized).not.toContain("emailPassword");
    expect(serialized).not.toContain(tempRoot);
  });
});

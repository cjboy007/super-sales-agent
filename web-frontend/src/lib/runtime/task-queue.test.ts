import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteTaskQueue, runtimeQueueDbPath } from "./task-queue";
import type { RuntimeJob, RuntimeWorkflowType } from "./types";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-task-queue-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function job(id: string, workflow: RuntimeWorkflowType = "email.reply", createdAt = new Date().toISOString()): RuntimeJob {
  return {
    id,
    workspaceId: "demo-exporter",
    workflow,
    status: "queued",
    input: { subject: "Quote request", email: "buyer@example.com" },
    steps: [
      {
        id: "side-effect-gate",
        kind: "side_effect",
        status: "queued",
        summary: "Create auditable side-effect request",
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };
}

describe("SqliteTaskQueue", () => {
  it("creates a SQLite runtime database under SSA_DATA_ROOT", () => {
    const queue = new SqliteTaskQueue();
    const saved = queue.enqueue(job("job-1"));

    expect(saved).toMatchObject({
      id: "job-1",
      status: "queued",
      attempts: 0,
    });
    expect(runtimeQueueDbPath()).toBe(path.join(tempRoot, "runtime", "ssa-runtime.db"));
    expect(fs.existsSync(path.join(tempRoot, "runtime", "ssa-runtime.db"))).toBe(true);
  });

  it("persists queued jobs across queue instances and lists newest first", () => {
    const older = "2026-05-27T01:00:00.000Z";
    const newer = "2026-05-27T02:00:00.000Z";
    new SqliteTaskQueue().enqueue(job("job-old", "email.reply", older));
    new SqliteTaskQueue().enqueue(job("job-new", "quotation.prepare", newer));

    const reopened = new SqliteTaskQueue();
    expect(reopened.list(10).map((item) => item.id)).toEqual(["job-new", "job-old"]);
    expect(reopened.get("job-old")).toMatchObject({
      id: "job-old",
      workflow: "email.reply",
      input: { subject: "Quote request", email: "buyer@example.com" },
    });
  });

  it("claims the oldest queued job with worker lease metadata", () => {
    const queue = new SqliteTaskQueue();
    queue.enqueue(job("job-old", "email.reply", "2026-05-27T01:00:00.000Z"));
    queue.enqueue(job("job-new", "quotation.prepare", "2026-05-27T02:00:00.000Z"));

    const claimed = queue.claimNext("worker-1", {
      now: new Date("2026-05-27T03:00:00.000Z"),
      leaseMs: 60_000,
    });

    expect(claimed).toMatchObject({
      id: "job-old",
      status: "running",
      attempts: 1,
      claimedBy: "worker-1",
      leaseUntil: "2026-05-27T03:01:00.000Z",
    });
    expect(queue.claimNext("worker-2", { now: new Date("2026-05-27T03:00:30.000Z") })?.id).toBe("job-new");
  });

  it("returns the atomically claimed row without a second post-claim lookup", () => {
    const queue = new SqliteTaskQueue();
    queue.enqueue(job("job-atomic", "email.reply", "2026-05-27T01:00:00.000Z"));
    const queueWithoutPostClaimRead = queue as SqliteTaskQueue & { get(id: string): RuntimeJob | null };
    queueWithoutPostClaimRead.get = () => {
      throw new Error("post-claim read should not run");
    };

    const claimed = queue.claimNext("worker-atomic", {
      now: new Date("2026-05-27T03:00:00.000Z"),
      leaseMs: 60_000,
    });

    expect(claimed).toMatchObject({
      id: "job-atomic",
      status: "running",
      attempts: 1,
      claimedBy: "worker-atomic",
    });
  });

  it("reclaims expired running leases but leaves active leases alone", () => {
    const queue = new SqliteTaskQueue();
    const expired = queue.enqueue({
      ...job("job-expired"),
      status: "running",
      attempts: 1,
      claimedBy: "worker-1",
      leaseUntil: "2026-05-27T03:00:00.000Z",
    });
    queue.enqueue({
      ...job("job-active"),
      status: "running",
      attempts: 1,
      claimedBy: "worker-1",
      leaseUntil: "2026-05-27T05:00:00.000Z",
      createdAt: "2026-05-27T01:00:00.000Z",
    });

    expect(expired.status).toBe("running");
    const claimed = queue.claimNext("worker-2", {
      now: new Date("2026-05-27T04:00:00.000Z"),
      leaseMs: 60_000,
    });

    expect(claimed).toMatchObject({
      id: "job-expired",
      attempts: 2,
      claimedBy: "worker-2",
    });
    expect(queue.claimNext("worker-3", { now: new Date("2026-05-27T04:00:00.000Z") })).toBeNull();
  });

  it("completes and fails jobs with auditable output and error state", () => {
    const queue = new SqliteTaskQueue();
    queue.enqueue(job("job-complete"));
    queue.enqueue(job("job-fail"));

    expect(queue.complete("job-complete", { decisionId: "side-effect-1", status: "blocked" })).toMatchObject({
      id: "job-complete",
      status: "completed",
      output: { decisionId: "side-effect-1", status: "blocked" },
    });
    expect(queue.fail("job-fail", "LLM provider unavailable")).toMatchObject({
      id: "job-fail",
      status: "failed",
      error: "LLM provider unavailable",
    });

    expect(queue.list(10).map((item) => [item.id, item.status])).toEqual([
      ["job-fail", "failed"],
      ["job-complete", "completed"],
    ]);
  });

  it("requeues failed attempts without resetting the attempt counter", () => {
    const queue = new SqliteTaskQueue();
    queue.enqueue(job("job-retry"));
    const claimed = queue.claimNext("worker-1", {
      now: new Date("2026-05-27T04:00:00.000Z"),
      leaseMs: 60_000,
    });

    expect(claimed).toMatchObject({
      id: "job-retry",
      status: "running",
      attempts: 1,
    });
    expect(queue.requeue("job-retry", "temporary failure")).toMatchObject({
      id: "job-retry",
      status: "queued",
      attempts: 1,
      claimedBy: undefined,
      leaseUntil: undefined,
      error: "temporary failure",
    });
    expect(queue.claimNext("worker-2", {
      now: new Date("2026-05-27T04:01:00.000Z"),
      leaseMs: 60_000,
    })).toMatchObject({
      id: "job-retry",
      attempts: 2,
      claimedBy: "worker-2",
    });
  });

  it("keeps blocked side-effect jobs inspectable in the queue ledger", () => {
    const queue = new SqliteTaskQueue();
    const saved = queue.enqueue({
      ...job("job-side-effect", "side_effect.request"),
      input: {
        kind: "email.send",
        summary: "Send quote follow-up",
        payload: { to: "buyer@example.com", subject: "Quote" },
      },
      steps: [
        {
          id: "approval",
          kind: "side_effect",
          status: "completed",
          summary: "Human approval required before customer send",
          output: {
            status: "blocked",
            reason: "Real execution requires explicit enablement",
          },
        },
      ],
    });

    expect(saved.steps[0]).toMatchObject({
      id: "approval",
      output: { status: "blocked" },
    });
    expect(new SqliteTaskQueue().get("job-side-effect")).toMatchObject({
      workflow: "side_effect.request",
      input: {
        kind: "email.send",
        summary: "Send quote follow-up",
      },
    });
  });
});

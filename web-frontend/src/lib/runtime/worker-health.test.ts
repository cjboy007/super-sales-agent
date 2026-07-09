import { describe, expect, it } from "vitest";
import { summarizeWorkerHealth, type WorkerStatusSnapshot } from "./worker-health";

const emptyQueue = {
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
  retryable: 0,
};

function status(overrides: Partial<WorkerStatusSnapshot>): WorkerStatusSnapshot {
  return {
    workerId: "jaden-farreach-1",
    workspaceId: "farreach",
    startedAt: "2026-06-09T08:00:00.000Z",
    lastHeartbeatAt: "2026-06-09T08:00:00.000Z",
    status: "running",
    queue: emptyQueue,
    alerts: [],
    ...overrides,
  };
}

describe("worker health summary", () => {
  it("raises an operator alert when no resident worker heartbeat exists", () => {
    const summary = summarizeWorkerHealth([], {
      now: new Date("2026-06-09T08:10:00.000Z"),
    });

    expect(summary.status).toBe("down");
    expect(summary.alerts).toEqual([
      "No resident worker heartbeat is visible. Start the worker before shared use.",
    ]);
  });

  it("raises an operator alert when the latest heartbeat is stale", () => {
    const summary = summarizeWorkerHealth([
      status({
        lastHeartbeatAt: "2026-06-09T08:00:00.000Z",
      }),
    ], {
      now: new Date("2026-06-09T08:12:00.000Z"),
      staleAfterMs: 10 * 60 * 1000,
    });

    expect(summary.status).toBe("stale");
    expect(summary.alerts).toEqual([
      "Worker heartbeat is stale. Check the resident process or recovery setup.",
    ]);
  });

  it("does not treat a recently stopped worker as healthy", () => {
    const summary = summarizeWorkerHealth([
      status({
        status: "stopped",
        lastHeartbeatAt: "2026-06-09T08:09:30.000Z",
      }),
    ], {
      now: new Date("2026-06-09T08:10:00.000Z"),
    });

    expect(summary.status).toBe("down");
    expect(summary.alerts).toEqual([
      "Resident worker is stopped. Start the worker before shared use.",
    ]);
  });

  it("keeps a running resident worker healthy when a newer stopped worker record exists", () => {
    const summary = summarizeWorkerHealth([
      status({
        workerId: "jaden-farreach-stopped",
        status: "stopped",
        lastHeartbeatAt: "2026-06-09T08:10:00.000Z",
      }),
      status({
        workerId: "jaden-farreach-running",
        status: "running",
        lastHeartbeatAt: "2026-06-09T08:09:30.000Z",
      }),
    ], {
      now: new Date("2026-06-09T08:10:30.000Z"),
    });

    expect(summary.status).toBe("ok");
    expect(summary.latest?.workerId).toBe("jaden-farreach-running");
    expect(summary.alerts).toEqual([]);
  });

  it("keeps failed and retryable queue alerts visible even when the snapshot omitted them", () => {
    const summary = summarizeWorkerHealth([
      status({
        queue: {
          queued: 2,
          running: 0,
          completed: 3,
          failed: 1,
          retryable: 2,
        },
        alerts: [],
      }),
    ], {
      now: new Date("2026-06-09T08:01:00.000Z"),
    });

    expect(summary.status).toBe("degraded");
    expect(summary.alerts).toEqual([
      "1 failed job needs review",
      "2 retryable jobs waiting",
    ]);
  });

  it("separates the latest heartbeat from the last worker activity", () => {
    const summary = summarizeWorkerHealth([
      status({
        lastHeartbeatAt: "2026-06-09T08:05:00.000Z",
        lastActivityAt: "2026-06-09T08:00:00.000Z",
        lastActivitySummary: "Completed 1 queued task and wrote 2 customer timeline items.",
        lastResult: {
          workerId: "jaden-farreach-1",
          claimed: 0,
          completed: 0,
          failed: 0,
          retried: 0,
          exhausted: 0,
          inboxSynced: 0,
          crmActivities: 0,
          orderActivities: 0,
          customersUpdated: 0,
          lifecycleStatuses: 0,
          processedJobIds: [],
        },
      }),
    ], {
      now: new Date("2026-06-09T08:05:30.000Z"),
    });

    expect(summary.activity).toEqual({
      lastRunAt: "2026-06-09T08:05:00.000Z",
      lastActivityAt: "2026-06-09T08:00:00.000Z",
      lastRunSummary: "Latest run found no new mail, queued tasks, customer updates, order updates, or lifecycle changes.",
      lastActivitySummary: "Completed 1 queued task and wrote 2 customer timeline items.",
      hasRecentActivity: false,
    });
  });

  it("derives worker activity from the latest result when no persisted activity summary exists", () => {
    const summary = summarizeWorkerHealth([
      status({
        lastHeartbeatAt: "2026-06-09T08:05:00.000Z",
        lastResult: {
          workerId: "jaden-farreach-1",
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
      }),
    ], {
      now: new Date("2026-06-09T08:05:30.000Z"),
    });

    expect(summary.activity).toEqual({
      lastRunAt: "2026-06-09T08:05:00.000Z",
      lastActivityAt: "2026-06-09T08:05:00.000Z",
      lastRunSummary: "Saw 3 mailbox messages, wrote 2 customer timeline items, wrote 1 order milestone, updated 1 customer record, recorded 1 lifecycle status change, and completed 1 queued task.",
      lastActivitySummary: "Saw 3 mailbox messages, wrote 2 customer timeline items, wrote 1 order milestone, updated 1 customer record, recorded 1 lifecycle status change, and completed 1 queued task.",
      hasRecentActivity: true,
    });
  });
});

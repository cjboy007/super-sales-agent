import { describe, expect, it } from "vitest";
import { summarizeOpsStatus } from "./ops-status-summary";

describe("summarizeOpsStatus", () => {
  it("prioritizes failed and retryable background work over normal running state", () => {
    expect(summarizeOpsStatus({
      worker: {
        status: "ok",
        queue: { queued: 2, running: 1, completed: 8, failed: 1, retryable: 1 },
        alerts: [],
      },
      actionReviews: 0,
    })).toMatchObject({
      level: "critical",
      badge: "!",
      navLabel: "Ops !",
      summary: "1 failed task needs review",
    });
  });

  it("shows approval count when customer-facing work is waiting for review", () => {
    expect(summarizeOpsStatus({
      worker: {
        status: "ok",
        queue: { queued: 0, running: 0, completed: 4, failed: 0, retryable: 0 },
        alerts: [],
      },
      actionReviews: 3,
    })).toMatchObject({
      level: "attention",
      badge: "3",
      navLabel: "Ops 3",
      summary: "3 actions waiting for review",
    });
  });

  it("uses a calm running state while background work is active", () => {
    expect(summarizeOpsStatus({
      worker: {
        status: "ok",
        queue: { queued: 2, running: 1, completed: 4, failed: 0, retryable: 0 },
        alerts: [],
      },
      actionReviews: 0,
    })).toMatchObject({
      level: "running",
      badge: "●",
      navLabel: "Ops ●",
      summary: "3 background tasks active",
    });
  });
});

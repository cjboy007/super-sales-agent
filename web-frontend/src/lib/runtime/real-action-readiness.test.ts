import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { summarizeRealActionReadiness } from "./real-action-readiness";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-real-action-readiness-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalCrmFlag === undefined) delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  else process.env.SSA_ENABLE_REAL_CRM_WRITE = originalCrmFlag;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("real action readiness", () => {
  it("needs setup until a controlled approval and execution record exists", () => {
    const runtime = createSalesRuntime();

    expect(summarizeRealActionReadiness(runtime)).toMatchObject({
      status: "needs_setup",
      blockedByDefault: true,
      counts: {
        requested: 0,
        pendingReview: 0,
        approved: 0,
        executed: 0,
        failed: 0,
        retryable: 0,
      },
      nextStep: expect.stringContaining("controlled approval test"),
    });
  });

  it("summarizes approval execution and retryable failures without leaking action internals", () => {
    const runtime = createSalesRuntime();
    const executed = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "farreach",
      summary: "Send quote to buyer@example.com",
      payload: {
        to: "buyer@example.com",
        subject: "PI-SECRET-001",
        provider: "smtp",
        dataRoot: tempRoot,
      },
      idempotencyKey: "farreach:email:buyer@example.com:PI-SECRET-001",
    });
    runtime.approveSideEffect(executed.id, { by: "Wilson" });
    runtime.recordSideEffectExecuted(executed.id, {
      result: {
        messageId: "smtp-secret-message",
      },
    });
    const failed = runtime.requestSideEffect({
      kind: "crm.write",
      workspaceId: "farreach",
      summary: "Write CRM update for Secret Buyer",
      payload: {
        customerName: "Secret Buyer",
        channel_audit: "raw-audit",
      },
      idempotencyKey: "farreach:crm:secret-buyer",
    });
    runtime.approveSideEffect(failed.id, { by: "Wilson" });
    runtime.recordSideEffectFailed(failed.id, {
      error: `CRM provider failed at ${tempRoot}/adapter.log`,
      canRetry: true,
    });

    const summary = summarizeRealActionReadiness(runtime);

    expect(summary).toMatchObject({
      status: "needs_review",
      blockedByDefault: true,
      counts: {
        requested: 2,
        pendingReview: 0,
        approved: 1,
        executed: 1,
        failed: 1,
        retryable: 1,
      },
      summary: expect.stringContaining("waiting for operator review"),
      nextStep: expect.stringContaining("Review failed"),
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(executed.id);
    expect(serialized).not.toContain(failed.id);
    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).not.toContain("Secret Buyer");
    expect(serialized).not.toContain("PI-SECRET");
    expect(serialized).not.toContain("smtp-secret-message");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("channel_audit");
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("SSA_ENABLE_REAL");
  });

  it("can scope readiness to one workspace", () => {
    const runtime = createSalesRuntime();
    const executed = runtime.requestSideEffect({
      kind: "crm.write",
      workspaceId: "farreach",
      summary: "Write CRM update for scoped readiness buyer",
      payload: {
        customerName: "Scoped Readiness Buyer",
        subject: "Scoped readiness CRM update",
      },
      idempotencyKey: "farreach:crm:scoped-readiness-buyer",
    });
    runtime.approveSideEffect(executed.id, { by: "Wilson" });
    runtime.recordSideEffectExecuted(executed.id, {
      result: { status: "executed" },
    });
    runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "hero-pumps",
      summary: "Send unrelated workspace smoke email",
      payload: {
        to: "buyer@example.com",
        subject: "Unrelated workspace smoke",
      },
      idempotencyKey: "hero-pumps:email:unrelated-smoke",
    });

    expect(summarizeRealActionReadiness(runtime, { workspaceId: "farreach" })).toMatchObject({
      status: "ready",
      counts: {
        requested: 1,
        pendingReview: 0,
        approved: 0,
        executed: 1,
        failed: 0,
        retryable: 0,
      },
    });
    expect(summarizeRealActionReadiness(runtime, { workspaceId: "hero-pumps" })).toMatchObject({
      status: "needs_review",
      counts: {
        requested: 1,
        pendingReview: 1,
        approved: 0,
        executed: 0,
        failed: 0,
        retryable: 1,
      },
    });
  });
});

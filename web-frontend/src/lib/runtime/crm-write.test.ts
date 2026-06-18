import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { readCustomerActivities } from "./customer-activity";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-crm-write-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalCrmFlag === undefined) delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  else process.env.SSA_ENABLE_REAL_CRM_WRITE = originalCrmFlag;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("CRM write execution", () => {
  it("rolls back customer timeline activity when a later CRM execution step fails", () => {
    const runtime = createSalesRuntime();
    const requested = runtime.requestCrmWrite({
      workspaceId: "farreach",
      customerId: "rollback-crm.example",
      customerName: "Rollback CRM Buyer",
      contactName: "Riley",
      contactEmail: "riley@rollback-crm.example",
      subject: "Confirm CRM rollback",
      summary: "This note should not remain if execution fails later.",
      occurredAt: "2026-06-09T10:00:00.000Z",
    });
    runtime.approveSideEffect(requested.decisionId, {
      by: "Wilson",
      note: "Approved for rollback test.",
    });
    process.env.SSA_ENABLE_REAL_CRM_WRITE = "true";
    vi.spyOn(runtime, "writeMemory").mockImplementation(() => {
      throw new Error("memory unavailable");
    });

    expect(() => runtime.executeCrmWrite({
      workspaceId: "farreach",
      decisionId: requested.decisionId,
    })).toThrow("memory unavailable");

    expect(readCustomerActivities("farreach")).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        customerId: "rollback-crm.example",
        subject: "Confirm CRM rollback",
      }),
    ]));
    expect(runtime.getSideEffect(requested.decisionId)).toMatchObject({
      status: "execution_failed",
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
      }),
    });
  });

  it("rolls back CRM execution memory and executed events when the final success update fails", () => {
    const runtime = createSalesRuntime();
    const requested = runtime.requestCrmWrite({
      workspaceId: "farreach",
      customerId: "late-rollback.example",
      customerName: "Late Rollback Buyer",
      contactName: "Lena",
      contactEmail: "lena@late-rollback.example",
      subject: "Confirm late rollback",
      summary: "No local CRM execution artifacts should remain after a late failure.",
      occurredAt: "2026-06-09T11:00:00.000Z",
    });
    runtime.approveSideEffect(requested.decisionId, {
      by: "Wilson",
      note: "Approved for late rollback test.",
    });
    process.env.SSA_ENABLE_REAL_CRM_WRITE = "true";
    vi.spyOn(runtime, "recordSideEffectExecuted").mockImplementation(() => {
      throw new Error("approval store unavailable");
    });

    expect(() => runtime.executeCrmWrite({
      workspaceId: "farreach",
      decisionId: requested.decisionId,
    })).toThrow("approval store unavailable");

    expect(readCustomerActivities("farreach")).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        customerId: "late-rollback.example",
        subject: "Confirm late rollback",
      }),
    ]));
    expect(runtime.searchMemory({
      workspaceId: "farreach",
      query: "Confirm late rollback",
      customerId: "late-rollback.example",
      limit: 10,
    })).toHaveLength(0);
    expect(runtime.listEvents(20, "farreach")).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "crm.write.executed",
        payload: expect.objectContaining({
          customerName: "Late Rollback Buyer",
        }),
      }),
    ]));
    expect(runtime.getSideEffect(requested.decisionId)).toMatchObject({
      status: "execution_failed",
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
      }),
    });
  });
});

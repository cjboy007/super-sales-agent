import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { runSalesLoopDrill } from "./sales-loop-drills";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
const originalPaymentFlag = process.env.SSA_ENABLE_REAL_PAYMENT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-loop-drills-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  delete process.env.SSA_ENABLE_REAL_PAYMENT;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;
  if (originalDocumentFlag === undefined) delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  else process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = originalDocumentFlag;
  if (originalPaymentFlag === undefined) delete process.env.SSA_ENABLE_REAL_PAYMENT;
  else process.env.SSA_ENABLE_REAL_PAYMENT = originalPaymentFlag;
  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("sales loop dry-run drills", () => {
  it.each([
    ["email_to_reply", "email.send", "email.interaction"],
    ["rfq_to_pi", "document.generate", "rfq"],
    ["order_lifecycle", "payment.write", "payment.milestone"],
  ] as const)("runs %s without real external execution", async (drillId, sideEffectKind, factType) => {
    const runtime = createSalesRuntime();
    const result = await runSalesLoopDrill(runtime, {
      workspaceId: "farreach",
      drillId,
      now: "2026-06-18T09:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.trace.length).toBeGreaterThanOrEqual(4);
    expect(result.trace.every((step) => step.status === "completed")).toBe(true);
    expect(result.sideEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: sideEffectKind,
        status: "blocked",
        realExecutionEnabled: false,
      }),
    ]));
    expect(result.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: factType,
        workspaceId: "farreach",
        idempotencyKey: expect.any(String),
        provenance: expect.any(Array),
      }),
    ]));
    expect(result.realExecutionAttempted).toBe(false);
  });
});

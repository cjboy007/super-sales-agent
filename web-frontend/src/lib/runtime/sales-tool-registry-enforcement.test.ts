import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { listSideEffectSalesTools } from "./sales-tool-registry";
import { requestSideEffect, recordSideEffectExecutionSuccess } from "./side-effect-gate";
import type { SideEffectDecision, SideEffectKind } from "./types";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

const ENFORCED_KINDS: SideEffectKind[] = [
  "email.send",
  "crm.write",
  "document.generate",
  "document.preview",
  "payment.write",
  "bank.read",
  "price.discount",
  "imap.fetch",
  "data.read",
  "feishu.notify",
];

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-tool-registry-enforcement-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function decisionPath(workspaceId: string) {
  return path.join(tempRoot, "companies", workspaceId, "approvals", "side-effect-decisions.json");
}

function writeLegacyDecision(decision: SideEffectDecision) {
  const filePath = decisionPath(decision.workspaceId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify([decision], null, 2), "utf-8");
}

describe("sales tool registry enforcement", () => {
  it("rejects direct high-risk side-effect requests that bypass the sales tool registry", () => {
    expect(() => requestSideEffect({
      kind: "email.send",
      workspaceId: "farreach",
      summary: "Direct send bypass",
      payload: {
        to: "buyer@example.com",
        subject: "Bypass",
      },
      idempotencyKey: "farreach:direct-bypass",
    })).toThrow(/sales tool registry/i);
  });

  it("routes runtime side-effect requests through registry enforcement with audit metadata", () => {
    const runtime = createSalesRuntime();
    const decision = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "farreach",
      summary: "Request email send through runtime",
      payload: {
        to: "buyer@example.com",
        subject: "Runtime request",
        body: "Draft body",
      },
      idempotencyKey: "farreach:runtime-email-request",
    });

    expect(decision).toMatchObject({
      kind: "email.send",
      workspaceId: "farreach",
      status: "blocked",
      tool: {
        toolId: "email.request_send",
        sideEffectKind: "email.send",
        approvalRequired: true,
        approvalRequirement: "operator_approval_required",
        requiredPermissions: expect.arrayContaining(["email.send.request"]),
      },
    });
    expect(decision.payload).toMatchObject({
      registryEnforced: true,
      toolId: "email.request_send",
      idempotencyKey: "farreach:runtime-email-request",
    });
    expect(decision.tool?.idempotencyStrategy).toContain("workspaceId");
    expect(decision.tool?.failureRetryBehavior).toContain("Retry");
    expect(decision.tool?.failureRetryBehavior).toContain("confirmation");
  });

  it("prevents execution records for legacy decisions that were not registry-enforced", () => {
    writeLegacyDecision({
      id: "legacy-email-decision",
      kind: "email.send",
      workspaceId: "farreach",
      status: "approved",
      reason: "Legacy approval without registry metadata.",
      realExecutionEnabled: true,
      createdAt: new Date().toISOString(),
      approvedBy: "local-operator",
      payload: {
        summary: "legacy",
        idempotencyKey: "farreach:legacy-email",
        to: "buyer@example.com",
        subject: "Legacy",
      },
    });

    expect(() => recordSideEffectExecutionSuccess("legacy-email-decision", {
      result: { messageId: "legacy-message" },
    })).toThrow(/sales tool registry/i);
  });

  it("has registry coverage for every enforced high-risk side-effect kind", () => {
    const coveredKinds = new Set(listSideEffectSalesTools().map((tool) => tool.sideEffectKind));

    for (const kind of ENFORCED_KINDS) {
      expect(coveredKinds.has(kind), `${kind} should have a registered sales tool`).toBe(true);
    }
  });
});

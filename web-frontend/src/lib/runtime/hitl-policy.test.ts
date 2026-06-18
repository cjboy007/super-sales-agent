import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import {
  evaluateHitlAction,
  getDefaultHitlPolicyMatrix,
  summarizeHitlReadiness,
  type AutomationMode,
  type DecisionLearningAction,
  type HitlActionKind,
  type HitlPolicyDecision,
  type HitlPolicyMatrix,
  type HitlPolicyRule,
} from "./hitl-policy";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-hitl-policy-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const reviewActions: HitlActionKind[] = [
  "email.send",
  "crm.write",
  "quotation.generate",
  "pi.generate",
  "price.discount",
];

const draftAndResearchActions: HitlActionKind[] = [
  "lead.discovery",
  "prospect.enrichment",
  "customer.scoring",
  "email.draft",
  "landing_page.draft",
  "video_script.draft",
];

describe("HITL policy kernel", () => {
  it("exposes the typed contract for automation modes, policy rules, and learning actions", () => {
    const mode: AutomationMode = "assist";
    const actionKind: HitlActionKind = "email.send";
    const decision: HitlPolicyDecision = "review";
    const learningAction: DecisionLearningAction = "update_policy";
    const rule: HitlPolicyRule = {
      actionKind,
      decision,
      risk: "high",
      requiresSideEffectGate: true,
      reason: "Customer-facing send requires review.",
    };
    const matrix: HitlPolicyMatrix = { [actionKind]: rule } as HitlPolicyMatrix;

    expect(mode).toBe("assist");
    expect(learningAction).toBe("update_policy");
    expect(matrix[actionKind]).toMatchObject(rule);
  });

  it("defaults irreversible and customer-facing actions to review or blocked", () => {
    const matrix = getDefaultHitlPolicyMatrix("hero-pumps");

    expect(matrix["payment.bank"].decision).toBe("blocked");
    expect(matrix["payment.bank"].requiresSideEffectGate).toBe(true);
    for (const actionKind of reviewActions) {
      expect(matrix[actionKind]).toMatchObject({
        decision: "review",
        requiresSideEffectGate: true,
      });
    }
  });

  it("keeps draft and research actions away from the side-effect gate", () => {
    const matrix = getDefaultHitlPolicyMatrix("hero-pumps");

    for (const actionKind of draftAndResearchActions) {
      expect(["auto", "review"]).toContain(matrix[actionKind].decision);
      expect(matrix[actionKind].requiresSideEffectGate).toBe(false);
    }
  });

  it("evaluates bank/payment as blocked and external customer actions as review", () => {
    expect(evaluateHitlAction({ workspaceId: "hero-pumps", actionKind: "payment.bank" })).toMatchObject({
      decision: "blocked",
      allowedToExecute: false,
    });

    for (const actionKind of reviewActions) {
      expect(evaluateHitlAction({ workspaceId: "hero-pumps", actionKind })).toMatchObject({
        decision: "review",
        allowedToExecute: false,
        requiresSideEffectGate: true,
      });
    }
  });

  it("summarizes existing side-effect decisions without exposing raw payload data", () => {
    const runtime = createSalesRuntime();
    runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "hero-pumps",
      summary: "Send buyer email",
      payload: {
        to: "buyer@example.com",
        secret: "never-show",
        rawPath: "/Users/wilson/private/customer.csv",
        SSA_DATA_ROOT: tempRoot,
      },
    });

    const summary = summarizeHitlReadiness(runtime, "hero-pumps");
    const serialized = JSON.stringify(summary);

    expect(summary.reviewQueue.blocked).toBe(1);
    expect(summary.reviewQueue.recent[0]).toMatchObject({
      actionKind: "email.send",
      status: "blocked",
    });
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("never-show");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("SSA_DATA_ROOT");
  });
});

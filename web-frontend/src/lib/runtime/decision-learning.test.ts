import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { runProspectingDryRun } from "./prospecting-loop";
import { runProductQuotationDraft } from "./product-quotation-drafts";
import { requestOutboundApproval } from "./outbound-approval-pipeline";
import {
  listDecisionLearningRecords,
  recordDecisionLearning,
  type DecisionLearningDecision,
  type DecisionLearningRecord,
} from "./decision-learning";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
const originalDiscountFlag = process.env.SSA_ENABLE_REAL_PRICE_DISCOUNT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-decision-learning-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  delete process.env.SSA_ENABLE_REAL_PRICE_DISCOUNT;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalCrmFlag === undefined) delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  else process.env.SSA_ENABLE_REAL_CRM_WRITE = originalCrmFlag;

  if (originalDocumentFlag === undefined) delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  else process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = originalDocumentFlag;

  if (originalDiscountFlag === undefined) delete process.env.SSA_ENABLE_REAL_PRICE_DISCOUNT;
  else process.env.SSA_ENABLE_REAL_PRICE_DISCOUNT = originalDiscountFlag;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function seedPriceMemory() {
  const dir = path.join(tempRoot, "companies", "hero-pumps", "pricing");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "price-memory.json"),
    JSON.stringify([
      {
        id: "PI-LEARN-11:0:industrial-pump",
        workspaceId: "hero-pumps",
        customer: "Learning Pump Buyer",
        contact: "Leah",
        email: "leah@example.com",
        country: "USA",
        product: "Industrial transfer pump",
        specification: "stainless steel / 380V",
        model: "HP-380",
        hsCode: "841370",
        quantity: 12,
        unitPrice: 430,
        unitCost: 270,
        costCurrency: "USD",
        supplier: "Hero Pump Factory",
        supplierCandidates: ["Hero Pump Factory"],
        currency: "USD",
        piNo: "PI-LEARN-11",
        date: "2026-05-20",
        incoterms: "FOB",
        source: "test",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ], null, 2),
    "utf-8"
  );
}

function createApproval(intendedActionType: "email_send" | "crm_write" | "quotation_generate" | "pi_generate" | "price_adjustment" = "email_send") {
  seedPriceMemory();
  const runtime = createSalesRuntime();
  const prospectingRun = runProspectingDryRun(runtime, {
    workspaceId: "hero-pumps",
    idempotencyKey: `hero-pumps:phase11:${intendedActionType}:prospecting`,
    seeds: [{
      companyName: "Learning Pump Buyer",
      website: "https://learning-pump.example",
      country: "US",
      industry: "industrial pump distribution",
      contactName: "Leah Stone",
      contactRole: "Procurement",
      contactEmail: "leah@learning-pump.example",
      sourceUrl: "https://directory.example/learning-pump",
      notes: "Imports replacement industrial transfer pump assemblies.",
    }],
  });
  const draftRun = runProductQuotationDraft(runtime, {
    workspaceId: "hero-pumps",
    prospectingRunId: prospectingRun.id,
    prospectingPacketId: prospectingRun.packets[0].id,
    idempotencyKey: `hero-pumps:phase11:${intendedActionType}:draft`,
  });
  const approvalRun = requestOutboundApproval(runtime, {
    workspaceId: "hero-pumps",
    sourceDraftRunId: draftRun.id,
    sourceDraftId: draftRun.drafts[0].quotationDraft.id,
    intendedActionType,
    idempotencyKey: `hero-pumps:phase11:${intendedActionType}:approval`,
  });
  return { runtime, approvalRun, candidate: approvalRun.candidates[0] };
}

describe("Decision Learning", () => {
  it("exposes an auditable policy memory contract that never auto-approves high-risk work", () => {
    const record: DecisionLearningRecord = {
      id: "decision-learning-record-1",
      workspaceId: "hero-pumps",
      approvalRunId: "outbound-approval-run-1",
      candidateId: "outbound-approval-candidate-1",
      sideEffectDecisionId: "email-send-1",
      actionKind: "email.send",
      decision: "update_policy",
      humanEdits: "Use buyer-specific pump model and remove unsupported delivery promise.",
      rejectionReason: "",
      policySuggestion: "Require model confirmation before approving pump emails.",
      scope: "workspace",
      rollbackNote: "Remove this suggestion if it blocks valid reviewed approvals.",
      createdAt: "2026-06-22T00:00:00.000Z",
      operator: "local-operator",
      confidence: 0.7,
      risk: "high",
      idempotencyKey: "hero-pumps:phase11:contract",
      autoApproval: false,
      autoEnforced: false,
      policySuggestionOnly: true,
      sideEffectGateStillRequired: true,
      highRiskStillReview: true,
      highRiskGuardrail: true,
      readOnlyUntilReviewed: true,
      autopilotReady: false,
      noPolicyAutoApproval: true,
    };

    expect(record).toMatchObject({
      workspaceId: "hero-pumps",
      actionKind: "email.send",
      decision: "update_policy",
      autoApproval: false,
      autoEnforced: false,
      policySuggestionOnly: true,
      sideEffectGateStillRequired: true,
      highRiskStillReview: true,
      noPolicyAutoApproval: true,
    });
  });

  it("records all human decision types against a Phase 10 candidate without executing anything", () => {
    const { runtime, approvalRun, candidate } = createApproval();
    const beforeSideEffects = runtime.listSideEffects(50);
    const decisions: DecisionLearningDecision[] = ["approve_once", "edit_then_approve", "reject", "update_policy"];

    const records = decisions.map((decision) => recordDecisionLearning({
      workspaceId: "hero-pumps",
      approvalRunId: approvalRun.id,
      candidateId: candidate.id,
      decision,
      humanEdits: decision === "edit_then_approve" ? "Edited opening line and quotation caveat." : "",
      rejectionReason: decision === "reject" ? "Evidence is not strong enough for outreach." : "",
      policySuggestion: decision === "update_policy" ? "Require verified buyer role before approval." : "",
      scope: "workspace",
      rollbackNote: "Delete this memory record if the policy suggestion is wrong.",
      operator: "wilson",
      confidence: 0.82,
      idempotencyKey: `hero-pumps:phase11:${decision}`,
    }));
    const afterSideEffects = runtime.listSideEffects(50);

    expect(records).toHaveLength(4);
    expect(records.map((record) => record.decision)).toEqual(decisions);
    for (const record of records) {
      expect(record).toMatchObject({
        workspaceId: "hero-pumps",
        approvalRunId: approvalRun.id,
        candidateId: candidate.id,
        sideEffectDecisionId: candidate.sideEffectDecisionId,
        actionKind: "email.send",
        scope: "workspace",
        rollbackNote: "Delete this memory record if the policy suggestion is wrong.",
        operator: "wilson",
        confidence: 0.82,
        risk: "high",
        autoApproval: false,
        autoEnforced: false,
        sideEffectGateStillRequired: true,
        highRiskStillReview: true,
        highRiskGuardrail: true,
        readOnlyUntilReviewed: true,
        autopilotReady: false,
        noPolicyAutoApproval: true,
      });
    }
    expect(records.find((record) => record.decision === "edit_then_approve")?.humanEdits).toMatch(/Edited opening line/);
    expect(records.find((record) => record.decision === "reject")?.rejectionReason).toMatch(/not strong enough/);
    expect(records.find((record) => record.decision === "update_policy")).toMatchObject({
      policySuggestion: "Require verified buyer role before approval.",
      policySuggestionOnly: true,
      autoEnforced: false,
    });
    expect(afterSideEffects).toHaveLength(beforeSideEffects.length);
    expect(afterSideEffects[0]).toMatchObject({
      id: candidate.sideEffectDecisionId,
      status: "blocked",
      realExecutionEnabled: false,
    });
    expect(afterSideEffects[0].execution).toBeUndefined();
  });

  it("dedupes records by idempotency key and lists only the requested workspace", () => {
    const { approvalRun, candidate } = createApproval("crm_write");
    const input = {
      workspaceId: "hero-pumps",
      approvalRunId: approvalRun.id,
      candidateId: candidate.id,
      decision: "approve_once" as const,
      humanEdits: "Approved one reviewed CRM note only.",
      scope: "candidate",
      rollbackNote: "Invalidate if customer is mismatched.",
      operator: "wilson",
      confidence: 0.76,
      idempotencyKey: "hero-pumps:phase11:crm-once",
    };

    const first = recordDecisionLearning(input);
    const second = recordDecisionLearning(input);
    const heroRecords = listDecisionLearningRecords("hero-pumps", 20);
    const farreachRecords = listDecisionLearningRecords("farreach", 20);

    expect(second.id).toBe(first.id);
    expect(heroRecords.filter((record) => record.idempotencyKey === input.idempotencyKey)).toHaveLength(1);
    expect(heroRecords[0]).toMatchObject({
      actionKind: "crm.write",
      autoApproval: false,
      sideEffectGateStillRequired: true,
      highRiskStillReview: true,
    });
    expect(farreachRecords).toHaveLength(0);
  });

  it("keeps quotation, PI, price discount, and payment-like high-risk actions review-gated", () => {
    const quotation = createApproval("quotation_generate");
    const pi = createApproval("pi_generate");
    const price = createApproval("price_adjustment");

    const records = [
      recordDecisionLearning({
        workspaceId: "hero-pumps",
        approvalRunId: quotation.approvalRun.id,
        candidateId: quotation.candidate.id,
        decision: "update_policy",
        policySuggestion: "Require complete cost and payment terms before quote document review.",
        scope: "workspace",
        rollbackNote: "Rollback if quotation reviews become too restrictive.",
        idempotencyKey: "hero-pumps:phase11:quote-policy",
      }),
      recordDecisionLearning({
        workspaceId: "hero-pumps",
        approvalRunId: pi.approvalRun.id,
        candidateId: pi.candidate.id,
        decision: "reject",
        rejectionReason: "PI cannot be generated from draft-only data.",
        scope: "workspace",
        rollbackNote: "No execution occurred.",
        idempotencyKey: "hero-pumps:phase11:pi-reject",
      }),
      recordDecisionLearning({
        workspaceId: "hero-pumps",
        approvalRunId: price.approvalRun.id,
        candidateId: price.candidate.id,
        decision: "approve_once",
        humanEdits: "Human reviewed discount request, but no automatic discount is allowed.",
        scope: "candidate",
        rollbackNote: "Discount still requires explicit side-effect gate approval.",
        idempotencyKey: "hero-pumps:phase11:price-once",
      }),
    ];

    expect(records.map((record) => record.risk)).toEqual(["high", "high", "high"]);
    expect(records.map((record) => record.highRiskStillReview)).toEqual([true, true, true]);
    expect(records.map((record) => record.sideEffectGateStillRequired)).toEqual([true, true, true]);
    expect(records.map((record) => record.autoApproval)).toEqual([false, false, false]);
    expect(records[0].policySuggestionOnly).toBe(true);
    expect(records[0].autoEnforced).toBe(false);
    expect(records.map((record) => record.actionKind)).toEqual(["quotation.generate", "pi.generate", "price.discount"]);
  });
});

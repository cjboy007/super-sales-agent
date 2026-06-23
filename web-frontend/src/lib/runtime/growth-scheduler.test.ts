import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { runProspectingDryRun } from "./prospecting-loop";
import { runProductQuotationDraft } from "./product-quotation-drafts";
import { requestOutboundApproval } from "./outbound-approval-pipeline";
import { recordDecisionLearning } from "./decision-learning";
import {
  computeGrowthMetrics,
  listGrowthSchedulerRuns,
  runGrowthSchedulerTick,
  type GrowthSchedulerRun,
} from "./growth-scheduler";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-growth-scheduler-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
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

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function seedPriceMemory() {
  const dir = path.join(tempRoot, "companies", "hero-pumps", "pricing");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "price-memory.json"),
    JSON.stringify([
      {
        id: "PI-PHASE12:0:industrial-pump",
        workspaceId: "hero-pumps",
        customer: "Scheduler Pump Buyer",
        contact: "Nia",
        email: "nia@example.com",
        country: "USA",
        product: "Industrial transfer pump",
        specification: "stainless steel / 380V",
        model: "HP-380",
        hsCode: "841370",
        quantity: 12,
        unitPrice: 440,
        unitCost: 275,
        costCurrency: "USD",
        supplier: "Hero Pump Factory",
        supplierCandidates: ["Hero Pump Factory"],
        currency: "USD",
        piNo: "PI-PHASE12",
        date: "2026-05-20",
        incoterms: "FOB",
        source: "test",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ], null, 2),
    "utf-8"
  );
}

function seedPhase8To11Data() {
  seedPriceMemory();
  const runtime = createSalesRuntime();
  const prospectingRun = runProspectingDryRun(runtime, {
    workspaceId: "hero-pumps",
    idempotencyKey: "hero-pumps:phase12:seed:prospecting",
    seeds: [
      {
        companyName: "Scheduler Pump Buyer",
        website: "https://scheduler-pump.example",
        country: "US",
        industry: "industrial pump distribution",
        contactName: "Nia Stone",
        contactRole: "Procurement",
        contactEmail: "nia@scheduler-pump.example",
        sourceUrl: "https://directory.example/scheduler-pump",
        notes: "Imports replacement industrial transfer pump assemblies.",
      },
      {
        companyName: "Thin Scheduler Buyer",
      },
    ],
  });
  const draftRun = runProductQuotationDraft(runtime, {
    workspaceId: "hero-pumps",
    prospectingRunId: prospectingRun.id,
    idempotencyKey: "hero-pumps:phase12:seed:draft",
    limit: 2,
  });
  const approvalRun = requestOutboundApproval(runtime, {
    workspaceId: "hero-pumps",
    sourceDraftRunId: draftRun.id,
    sourceDraftId: draftRun.drafts[0].quotationDraft.id,
    intendedActionType: "email_send",
    idempotencyKey: "hero-pumps:phase12:seed:approval",
  });
  recordDecisionLearning({
    workspaceId: "hero-pumps",
    approvalRunId: approvalRun.id,
    candidateId: approvalRun.candidates[0].id,
    decision: "edit_then_approve",
    humanEdits: "Add exact pump model and remove unsupported lead time.",
    scope: "candidate",
    rollbackNote: "Remove this learning record if the edit pattern is wrong.",
    operator: "wilson",
    confidence: 0.83,
    idempotencyKey: "hero-pumps:phase12:seed:decision-edit",
  });
  recordDecisionLearning({
    workspaceId: "hero-pumps",
    approvalRunId: approvalRun.id,
    candidateId: approvalRun.candidates[0].id,
    decision: "reject",
    rejectionReason: "Rejected sample for metrics.",
    scope: "candidate",
    rollbackNote: "No execution occurred.",
    operator: "wilson",
    confidence: 0.71,
    idempotencyKey: "hero-pumps:phase12:seed:decision-reject",
  });
  return { runtime, prospectingRun, draftRun, approvalRun };
}

describe("Growth Scheduler and Metrics", () => {
  it("exposes the Phase 12 scheduler contract with safe flags", () => {
    const run: GrowthSchedulerRun = {
      id: "growth-scheduler-run-1",
      workspaceId: "hero-pumps",
      status: "completed",
      mode: "dry-run",
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
      idempotencyKey: "hero-pumps:phase12:contract",
      dryRun: true,
      draftOnly: true,
      notExecuted: true,
      noOutboundSent: true,
      autopilotReady: false,
      sideEffectGateStillRequired: true,
      realOutboundPilotStarted: false,
      steps: [],
      failedWork: [],
      metricsSnapshot: {
        candidateCount: 0,
        evidenceCoverage: { packetsWithEvidence: 0, totalPackets: 0, coverageRate: 0 },
        icpDistribution: { low: 0, medium: 0, high: 0 },
        humanEditRate: 0,
        decisionRates: { approveOnce: 0, editThenApprove: 0, reject: 0, updatePolicy: 0, total: 0 },
        replyRatePlaceholder: {
          status: "placeholder",
          rate: null,
          reason: "No real outbound or mailbox assumption in Phase 12.",
        },
        failureReasons: [],
        misjudgmentReasonsPlaceholder: [],
        retryableFailedWorkCount: 0,
      },
    };

    expect(run).toMatchObject({
      dryRun: true,
      draftOnly: true,
      notExecuted: true,
      noOutboundSent: true,
      autopilotReady: false,
      sideEffectGateStillRequired: true,
      realOutboundPilotStarted: false,
    });
  });

  it("runs one idempotent scheduler tick that only prepares dry-run, draft, review, and decision-summary work", () => {
    seedPriceMemory();
    const runtime = createSalesRuntime();
    const beforeSideEffects = runtime.listSideEffects(50).length;
    const input = {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:phase12:scheduler-tick",
      seeds: [{
        companyName: "Scheduler Pump Buyer",
        website: "https://scheduler-pump.example",
        country: "US",
        industry: "industrial pump distribution",
        contactName: "Nia Stone",
        contactRole: "Procurement",
        contactEmail: "nia@scheduler-pump.example",
        sourceUrl: "https://directory.example/scheduler-pump",
        notes: "Imports replacement industrial transfer pump assemblies.",
      }],
    };

    const first = runGrowthSchedulerTick(runtime, input);
    const second = runGrowthSchedulerTick(runtime, input);
    const sideEffects = runtime.listSideEffects(50);
    const listed = listGrowthSchedulerRuns("hero-pumps", 20);

    expect(second.id).toBe(first.id);
    expect(listed.filter((run) => run.idempotencyKey === input.idempotencyKey)).toHaveLength(1);
    expect(first).toMatchObject({
      workspaceId: "hero-pumps",
      status: "completed",
      dryRun: true,
      draftOnly: true,
      notExecuted: true,
      noOutboundSent: true,
      autopilotReady: false,
      realOutboundPilotStarted: false,
    });
    expect(first.steps.map((step) => step.kind)).toEqual([
      "dry_run_prospecting",
      "quotation_draft_preparation",
      "outbound_approval_preparation",
      "decision_memory_review_summary",
    ]);
    expect(first.steps.every((step) => step.notExecuted && step.noOutboundSent)).toBe(true);
    expect(first.failedWork).toHaveLength(0);
    expect(sideEffects).toHaveLength(beforeSideEffects + 1);
    expect(sideEffects[0]).toMatchObject({
      kind: "email.send",
      status: "blocked",
      realExecutionEnabled: false,
    });
    expect(sideEffects[0].execution).toBeUndefined();
  });

  it("persists failed and retryable scheduler work without executing outbound actions", () => {
    seedPriceMemory();
    const runtime = {
      getSalesWorldModel: createSalesRuntime().getSalesWorldModel,
      requestSideEffect: () => {
        throw new Error("side-effect gate unavailable in scheduler test");
      },
    };

    const run = runGrowthSchedulerTick(runtime, {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:phase12:retryable-failure",
      seeds: [{
        companyName: "Scheduler Failure Buyer",
        website: "https://scheduler-failure.example",
        sourceUrl: "https://directory.example/scheduler-failure",
        notes: "Enough evidence for draft prep.",
      }],
    });
    const listed = listGrowthSchedulerRuns("hero-pumps", 20);

    expect(run.status).toBe("retryable");
    expect(run.failedWork).toHaveLength(1);
    expect(run.failedWork[0]).toMatchObject({
      workspaceId: "hero-pumps",
      stepKind: "outbound_approval_preparation",
      reason: "side-effect gate unavailable in scheduler test",
      retryCount: 0,
      retryable: true,
      notExecuted: true,
      noOutboundSent: true,
    });
    expect(run.failedWork[0].nextRetryAt).toMatch(/T/);
    expect(listed[0].failedWork[0].id).toBe(run.failedWork[0].id);
  });

  it("aggregates scoped Phase 8-11 metrics with placeholders for reply and misjudgment signals", () => {
    seedPhase8To11Data();

    const heroMetrics = computeGrowthMetrics("hero-pumps");
    const farreachMetrics = computeGrowthMetrics("farreach");

    expect(heroMetrics).toMatchObject({
      workspaceId: "hero-pumps",
      candidateCount: 2,
      icpDistribution: {
        low: expect.any(Number),
        medium: expect.any(Number),
        high: expect.any(Number),
      },
      replyRatePlaceholder: {
        status: "placeholder",
        rate: null,
      },
      autopilotReady: false,
      noOutboundSent: true,
      notExecuted: true,
    });
    expect(heroMetrics.evidenceCoverage.totalPackets).toBe(2);
    expect(heroMetrics.evidenceCoverage.packetsWithEvidence).toBeGreaterThan(0);
    expect(heroMetrics.humanEditRate).toBeGreaterThan(0);
    expect(heroMetrics.decisionRates.total).toBe(2);
    expect(heroMetrics.decisionRates.editThenApprove).toBe(0.5);
    expect(heroMetrics.decisionRates.reject).toBe(0.5);
    expect(heroMetrics.misjudgmentReasonsPlaceholder[0]).toMatch(/placeholder/i);
    expect(farreachMetrics.candidateCount).toBe(0);
    expect(farreachMetrics.decisionRates.total).toBe(0);
  });
});

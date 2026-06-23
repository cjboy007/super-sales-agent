import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { runProspectingDryRun } from "./prospecting-loop";
import { runProductQuotationDraft } from "./product-quotation-drafts";
import {
  listOutboundApprovalRuns,
  requestOutboundApproval,
  type OutboundApprovalCandidate,
  type OutboundApprovalRun,
} from "./outbound-approval-pipeline";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-outbound-approval-pipeline-test-"));
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
        id: "PI-PUMP-10:0:industrial-pump",
        workspaceId: "hero-pumps",
        customer: "Municipal Pump Buyer",
        contact: "Maya",
        email: "maya@example.com",
        country: "USA",
        product: "Industrial transfer pump",
        specification: "stainless steel / 380V",
        model: "HP-380",
        hsCode: "841370",
        quantity: 12,
        unitPrice: 420,
        unitCost: 260,
        costCurrency: "USD",
        supplier: "Hero Pump Factory",
        supplierCandidates: ["Hero Pump Factory"],
        currency: "USD",
        piNo: "PI-PUMP-10",
        date: "2026-05-20",
        incoterms: "FOB",
        source: "test",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ], null, 2),
    "utf-8"
  );
}

function createDraft(input: { lowEvidence?: boolean } = {}) {
  if (!input.lowEvidence) seedPriceMemory();
  const runtime = createSalesRuntime();
  const prospectingRun = runProspectingDryRun(runtime, {
    workspaceId: "hero-pumps",
    idempotencyKey: input.lowEvidence ? "hero-pumps:phase10:thin-prospecting" : "hero-pumps:phase10:prospecting",
    seeds: input.lowEvidence
      ? [{ companyName: "Thin Evidence Buyer" }]
      : [{
        companyName: "Apex Pump Distributors",
        website: "https://apex-pumps.example",
        country: "US",
        industry: "industrial pump distribution",
        contactName: "Maya Lee",
        contactRole: "Procurement",
        contactEmail: "maya@apex-pumps.example",
        sourceUrl: "https://directory.example/apex-pumps",
        notes: "Imports replacement industrial transfer pump assemblies for municipal water contractors.",
      }],
  });
  const draftRun = runProductQuotationDraft(runtime, {
    workspaceId: "hero-pumps",
    prospectingRunId: prospectingRun.id,
    prospectingPacketId: prospectingRun.packets[0].id,
    idempotencyKey: input.lowEvidence ? "hero-pumps:phase10:thin-draft" : "hero-pumps:phase10:draft",
  });
  return { runtime, draftRun, draft: draftRun.drafts[0] };
}

describe("Outbound Approval Pipeline", () => {
  it("exposes the Phase 10 approval-only data contract", () => {
    const candidate: OutboundApprovalCandidate = {
      id: "approval-candidate-1",
      workspaceId: "hero-pumps",
      sourceDraftRunId: "quotation-draft-run-1",
      sourceDraftId: "quotation-draft-1",
      sourceProspectingPacketId: "prospecting-packet-1",
      targetCustomer: "Apex Pump Distributors",
      recipient: {
        name: "Maya Lee",
        email: "maya@apex-pumps.example",
        role: "Procurement",
      },
      contentSummary: "Draft introduction with pump quotation context.",
      productQuotationSummary: "Industrial transfer pump reference: USD 420 price / USD 260 cost.",
      evidenceRefs: ["Directory listing", "PI-PUMP-10"],
      riskFlags: ["draft_only", "human_review_required"],
      expectedAction: "Request approval to send a draft email.",
      sideEffectKind: "email.send",
      idempotencyKey: "hero-pumps:phase10:contract",
      failureRetryStrategy: "Retry through side-effect decision retry after operator review.",
      sourceDraftMetadata: {
        draftOnly: true,
        officialQuote: false,
        piGenerated: false,
        documentGenerated: false,
        sent: false,
      },
      approvalStatus: "blocked",
      sideEffectDecisionId: "email-send-1",
      waitingForApproval: true,
      notExecuted: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
    };
    const run: OutboundApprovalRun = {
      id: "outbound-approval-run-1",
      workspaceId: "hero-pumps",
      status: "completed",
      intendedActionType: "email_send",
      approvalRequired: true,
      notExecuted: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      crmWritten: false,
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
      idempotencyKey: "hero-pumps:phase10:contract",
      candidates: [candidate],
    };

    expect(run.candidates[0]).toMatchObject({
      sideEffectKind: "email.send",
      waitingForApproval: true,
      notExecuted: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
    });
  });

  it("creates a side-effect review request from a Phase 9 draft without executing outbound", () => {
    const { runtime, draftRun, draft } = createDraft();
    const beforeSideEffects = runtime.listSideEffects(50).length;

    const run = requestOutboundApproval(runtime, {
      workspaceId: "hero-pumps",
      sourceDraftRunId: draftRun.id,
      sourceDraftId: draft.quotationDraft.id,
      intendedActionType: "email_send",
      idempotencyKey: "hero-pumps:phase10:email-approval",
    });
    const candidate = run.candidates[0];
    const sideEffects = runtime.listSideEffects(50);
    const decision = sideEffects.find((item) => item.id === candidate.sideEffectDecisionId);

    expect(run).toMatchObject({
      workspaceId: "hero-pumps",
      intendedActionType: "email_send",
      approvalRequired: true,
      notExecuted: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      crmWritten: false,
    });
    expect(candidate).toMatchObject({
      targetCustomer: "Apex Pump Distributors",
      recipient: {
        name: "Maya Lee",
        email: "maya@apex-pumps.example",
        role: "Procurement",
      },
      sideEffectKind: "email.send",
      approvalStatus: "blocked",
      waitingForApproval: true,
      notExecuted: true,
      expectedAction: expect.stringMatching(/approval/i),
    });
    expect(candidate.contentSummary).toMatch(/Apex Pump Distributors|pump/i);
    expect(candidate.productQuotationSummary).toMatch(/pump|USD|margin/i);
    expect(candidate.evidenceRefs.length).toBeGreaterThan(0);
    expect(candidate.riskFlags).toEqual(expect.arrayContaining(["draft_only", "human_review_required"]));
    expect(candidate.idempotencyKey).toBe("hero-pumps:phase10:email-approval:email_send");
    expect(candidate.failureRetryStrategy).toMatch(/retry/i);
    expect(candidate.sourceDraftMetadata).toMatchObject({
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
    });
    expect(sideEffects.length).toBe(beforeSideEffects + 1);
    expect(decision).toMatchObject({
      kind: "email.send",
      workspaceId: "hero-pumps",
      status: "blocked",
      realExecutionEnabled: false,
    });
    expect(decision?.execution).toBeUndefined();
  });

  it("dedupes approval requests by idempotency key and lists pipeline runs", () => {
    const { runtime, draftRun, draft } = createDraft();
    const input = {
      workspaceId: "hero-pumps",
      sourceDraftRunId: draftRun.id,
      sourceDraftId: draft.quotationDraft.id,
      intendedActionType: "crm_write" as const,
      idempotencyKey: "hero-pumps:phase10:crm-dedupe",
    };

    const first = requestOutboundApproval(runtime, input);
    const second = requestOutboundApproval(runtime, input);
    const runs = listOutboundApprovalRuns("hero-pumps", 20);

    expect(second.id).toBe(first.id);
    expect(runs.filter((run) => run.idempotencyKey === input.idempotencyKey)).toHaveLength(1);
    expect(runtime.listSideEffects(50).filter((item) => item.payload.idempotencyKey === `${input.idempotencyKey}:crm_write`)).toHaveLength(1);
  });

  it("keeps low evidence drafts review-only with clear risk and no execution", () => {
    const { runtime, draftRun, draft } = createDraft({ lowEvidence: true });

    const run = requestOutboundApproval(runtime, {
      workspaceId: "hero-pumps",
      sourceDraftRunId: draftRun.id,
      sourceDraftId: draft.quotationDraft.id,
      intendedActionType: "quotation_generate",
      idempotencyKey: "hero-pumps:phase10:thin-doc",
    });
    const candidate = run.candidates[0];

    expect(candidate.sideEffectKind).toBe("document.generate");
    expect(candidate.approvalStatus).toBe("blocked");
    expect(candidate.waitingForApproval).toBe(true);
    expect(candidate.notExecuted).toBe(true);
    expect(candidate.riskFlags).toEqual(expect.arrayContaining(["insufficient_evidence", "missing_inquiry_info", "not_ready_for_quotation"]));
    expect(candidate.contentSummary).toMatch(/insufficient evidence|missing inquiry/i);
    expect(run).toMatchObject({
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      crmWritten: false,
    });
    expect(runtime.listSideEffects(50)[0].execution).toBeUndefined();
  });
});

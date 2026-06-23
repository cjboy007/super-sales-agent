import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { runProspectingDryRun } from "./prospecting-loop";
import {
  listPersonalizedSalesDraftRuns,
  runProductQuotationDraft,
  type PersonalizedSalesDraft,
  type PersonalizedSalesDraftRun,
  type ProductFitEvidence,
  type ProductFitRecommendation,
  type QuotationDraft,
  type QuotationDraftLine,
} from "./product-quotation-drafts";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-product-quotation-drafts-test-"));
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

function seedPriceMemory() {
  const dir = path.join(tempRoot, "companies", "hero-pumps", "pricing");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "price-memory.json"),
    JSON.stringify([
      {
        id: "PI-PUMP-1:0:industrial-pump",
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
        supplierCandidates: ["Hero Pump Factory", "Backup Pump Supplier"],
        currency: "USD",
        piNo: "PI-PUMP-1",
        date: "2026-05-20",
        incoterms: "FOB",
        source: "test",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ], null, 2),
    "utf-8"
  );
}

describe("Personalized Product + Quotation Draft Engine", () => {
  it("exposes the Phase 9 draft-only data contract", () => {
    const evidence: ProductFitEvidence = {
      kind: "prospecting_evidence",
      label: "Directory listing",
      summary: "Buyer imports industrial pumps.",
      confidence: 0.78,
      sourceId: "prospecting:packet-1",
    };
    const product: ProductFitRecommendation = {
      product: "Industrial transfer pump",
      fitReasons: ["Candidate industry matches pump distribution."],
      evidence: [evidence],
      confidence: 0.74,
      riskFlags: ["draft_only"],
      missingInfo: ["MOQ"],
    };
    const line: QuotationDraftLine = {
      lineId: "line-1",
      product: "Industrial transfer pump",
      description: "Draft line from local price memory.",
      specification: "stainless steel / 380V",
      quantity: 12,
      unitPrice: 420,
      unitCost: 260,
      currency: "USD",
      costCurrency: "USD",
      margin: 160,
      marginPercent: 38.1,
      supplier: "Hero Pump Factory",
      supplierCandidates: ["Hero Pump Factory"],
      hsCode: "841370",
      incoterms: "FOB",
      missingInfo: ["payment terms"],
    };
    const quote: QuotationDraft = {
      id: "quotation-draft-1",
      status: "draft_only",
      quoteReady: false,
      lines: [line],
      costPriceMarginReferences: ["PI-PUMP-1: USD 420 price / USD 260 cost / 38.1% margin"],
      assumptions: ["Quantity copied from historical local reference."],
      missingInfoChecklist: ["payment terms"],
      evidenceRefs: ["Directory listing"],
      confidence: 0.72,
      riskFlags: ["draft_only"],
      recommendedHumanEdits: ["Confirm requested quantity before quoting."],
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
    };
    const draft: PersonalizedSalesDraft = {
      workspaceId: "hero-pumps",
      prospectingPacketId: "packet-1",
      candidate: { companyName: "Apex Pump Distributors" },
      recommendedProducts: [product],
      fitReasons: product.fitReasons,
      quotationDraftLines: [line],
      costPriceMarginReferences: quote.costPriceMarginReferences,
      assumptions: quote.assumptions,
      missingInfoChecklist: quote.missingInfoChecklist,
      evidenceRefs: quote.evidenceRefs,
      quotationDraft: quote,
      confidence: 0.72,
      riskFlags: ["draft_only"],
      recommendedHumanEdits: quote.recommendedHumanEdits,
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      createdAt: "2026-06-18T00:00:00.000Z",
      idempotencyKey: "phase9-contract",
    };
    const run: PersonalizedSalesDraftRun = {
      id: "quotation-draft-run-1",
      workspaceId: "hero-pumps",
      status: "completed",
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      createdAt: draft.createdAt,
      updatedAt: draft.createdAt,
      idempotencyKey: "phase9-contract",
      drafts: [draft],
    };

    expect(run.drafts[0]).toMatchObject({
      workspaceId: "hero-pumps",
      prospectingPacketId: "packet-1",
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
    });
  });

  it("generates product fit and quotation draft lines from a ProspectingPacket using local price memory", () => {
    seedPriceMemory();
    const runtime = createSalesRuntime();
    const beforeSideEffects = runtime.listSideEffects(20).length;
    const prospectingRun = runProspectingDryRun(runtime, {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:phase9:prospecting",
      seeds: [{
        companyName: "Apex Pump Distributors",
        website: "https://apex-pumps.example",
        country: "US",
        industry: "industrial pump distribution",
        contactName: "Maya Lee",
        contactRole: "Procurement",
        sourceUrl: "https://directory.example/apex-pumps",
        notes: "Imports replacement industrial transfer pump assemblies for municipal water contractors.",
      }],
    });

    const run = runProductQuotationDraft(runtime, {
      workspaceId: "hero-pumps",
      prospectingRunId: prospectingRun.id,
      prospectingPacketId: prospectingRun.packets[0].id,
      idempotencyKey: "hero-pumps:phase9:draft",
    });
    const draft = run.drafts[0];

    expect(run).toMatchObject({
      workspaceId: "hero-pumps",
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      status: "completed",
    });
    expect(draft).toMatchObject({
      workspaceId: "hero-pumps",
      prospectingPacketId: prospectingRun.packets[0].id,
      candidate: { companyName: "Apex Pump Distributors" },
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
    });
    expect(draft.recommendedProducts[0].product).toMatch(/pump/i);
    expect(draft.fitReasons.length).toBeGreaterThan(0);
    expect(draft.quotationDraftLines[0]).toMatchObject({
      product: expect.stringMatching(/pump/i),
      unitPrice: 420,
      unitCost: 260,
      currency: "USD",
      supplier: "Hero Pump Factory",
      hsCode: "841370",
      incoterms: "FOB",
    });
    expect(draft.quotationDraftLines[0].margin).toBe(160);
    expect(draft.quotationDraftLines[0].marginPercent).toBeCloseTo(38.1, 1);
    expect(draft.costPriceMarginReferences.join(" ")).toContain("PI-PUMP-1");
    expect(draft.assumptions.length).toBeGreaterThan(0);
    expect(draft.missingInfoChecklist).toEqual(expect.arrayContaining(["MOQ", "lead time", "packaging", "freight", "payment terms"]));
    expect(draft.evidenceRefs.length).toBeGreaterThan(0);
    expect(draft.confidence).toBeGreaterThan(0.5);
    expect(draft.riskFlags).toEqual(expect.arrayContaining(["draft_only", "human_review_required"]));
    expect(draft.recommendedHumanEdits).toEqual(expect.arrayContaining([
      expect.stringMatching(/confirm/i),
    ]));
    expect(draft.quotationDraft.quoteReady).toBe(false);
    expect(runtime.listSideEffects(20)).toHaveLength(beforeSideEffects);
  });

  it("keeps low-evidence packets in insufficient evidence draft state", () => {
    const runtime = createSalesRuntime();
    const prospectingRun = runProspectingDryRun(runtime, {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:phase9:thin-prospecting",
      seeds: [{ companyName: "Thin Evidence Buyer" }],
    });

    const run = runProductQuotationDraft(runtime, {
      workspaceId: "hero-pumps",
      prospectingPacketId: prospectingRun.packets[0].id,
      idempotencyKey: "hero-pumps:phase9:thin-draft",
    });
    const draft = run.drafts[0];

    expect(draft.quotationDraft.status).toBe("insufficient_evidence");
    expect(draft.quotationDraft.quoteReady).toBe(false);
    expect(draft.riskFlags).toEqual(expect.arrayContaining(["insufficient_evidence", "missing_inquiry_info", "not_ready_for_quotation"]));
    expect(draft.quotationDraftLines).toHaveLength(0);
    expect(draft.missingInfoChecklist).toEqual(expect.arrayContaining(["product", "quantity", "specs", "destination"]));
    expect(draft.recommendedHumanEdits.join(" ")).toMatch(/evidence|inquiry/i);
    expect(runtime.listSideEffects(20)).toHaveLength(0);
  });

  it("dedupes quotation draft runs by idempotency key and lists prior draft runs", () => {
    const runtime = createSalesRuntime();
    const prospectingRun = runProspectingDryRun(runtime, {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:phase9:dedupe-prospecting",
      seeds: [{
        companyName: "Dedupe Pump Buyer",
        industry: "industrial pumps",
        sourceUrl: "https://directory.example/dedupe-pump",
      }],
    });
    const input = {
      workspaceId: "hero-pumps",
      prospectingPacketId: prospectingRun.packets[0].id,
      idempotencyKey: "hero-pumps:phase9:dedupe-draft",
    };

    const first = runProductQuotationDraft(runtime, input);
    const second = runProductQuotationDraft(runtime, input);
    const runs = listPersonalizedSalesDraftRuns("hero-pumps", 20);

    expect(second.id).toBe(first.id);
    expect(runs.filter((run) => run.idempotencyKey === input.idempotencyKey)).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
    });
  });
});

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { buildSalesWorldModel } from "./sales-world-model";
import {
  listSalesFacts,
  salesFactLedgerPath,
  upsertCustomerAccountFact,
  upsertEmailInteractionFact,
  upsertLeadFact,
  upsertPaymentMilestoneFact,
  upsertSalesFact,
} from "./sales-fact-ledger";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-sales-fact-ledger-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("canonical sales fact ledger", () => {
  it("stores workspace-scoped facts with source provenance outside business source files", () => {
    const fact = upsertCustomerAccountFact("hero-pumps", {
      subject: "Ledger Pumps Inc",
      customerId: "ledger-pumps",
      customerName: "Ledger Pumps Inc",
      confidence: 0.91,
      occurredAt: "2026-06-10T10:00:00.000Z",
      source: { type: "customer-directory", id: "account-1" },
      idempotencyKey: "hero-pumps:customer:ledger-pumps",
      data: { country: "US", website: "https://ledger-pumps.example" },
    });

    expect(fact).toEqual(expect.objectContaining({
      workspaceId: "hero-pumps",
      type: "customer.account",
      subject: "Ledger Pumps Inc",
      customerId: "ledger-pumps",
      customerName: "Ledger Pumps Inc",
      version: 1,
      conflictStatus: "none",
      idempotencyKey: "hero-pumps:customer:ledger-pumps",
    }));
    expect(fact.factId).toMatch(/^sales-fact-/);
    expect(fact.sourceRefs).toEqual([expect.objectContaining({ type: "customer-directory", id: "account-1" })]);
    expect(salesFactLedgerPath("hero-pumps")).toBe(path.join(tempRoot, "companies", "hero-pumps", "world-model", "sales-fact-ledger.json"));
    expect(fs.existsSync(path.join(tempRoot, "companies", "hero-pumps", "customers", "activity.json"))).toBe(false);
  });

  it("dedupes by idempotency key and increments version when source data changes", () => {
    const first = upsertEmailInteractionFact("hero-pumps", {
      subject: "RFQ email",
      customerId: "buyer-co",
      customerName: "Buyer Co",
      confidence: 0.82,
      occurredAt: "2026-06-10T10:00:00.000Z",
      source: { type: "customer-activity", id: "email-1" },
      idempotencyKey: "hero-pumps:email:email-1",
      data: { summary: "Please quote 200 pumps." },
    });
    const duplicate = upsertEmailInteractionFact("hero-pumps", {
      subject: "RFQ email",
      customerId: "buyer-co",
      customerName: "Buyer Co",
      confidence: 0.82,
      occurredAt: "2026-06-10T10:00:00.000Z",
      source: { type: "customer-activity", id: "email-1" },
      idempotencyKey: "hero-pumps:email:email-1",
      data: { summary: "Please quote 200 pumps." },
    });
    const updated = upsertEmailInteractionFact("hero-pumps", {
      subject: "RFQ email",
      customerId: "buyer-co",
      customerName: "Buyer Co",
      confidence: 0.88,
      occurredAt: "2026-06-10T10:00:00.000Z",
      source: { type: "memory", id: "operator-note-1" },
      idempotencyKey: "hero-pumps:email:email-1",
      data: { summary: "Please quote 200 pumps with spare seals." },
    });

    const facts = listSalesFacts("hero-pumps");
    expect(duplicate.factId).toBe(first.factId);
    expect(updated.factId).toBe(first.factId);
    expect(updated.version).toBe(2);
    expect(updated.sourceRefs.map((source) => source.type)).toEqual(["customer-activity", "memory"]);
    expect(facts).toHaveLength(1);
    expect(facts[0].data).toEqual({ summary: "Please quote 200 pumps with spare seals." });
  });

  it("marks deterministic conflicts when two sources disagree about the same subject", () => {
    const first = upsertPaymentMilestoneFact("farreach", {
      subject: "PI-900 payment",
      customerId: "buyer-co",
      customerName: "Buyer Co",
      confidence: 0.86,
      occurredAt: "2026-06-11T10:00:00.000Z",
      source: { type: "customer-activity", id: "payment-email" },
      idempotencyKey: "farreach:payment:pi-900:email",
      data: { orderNo: "PI-900", paymentStatus: "paid", amount: "USD 5000" },
    });
    const conflicting = upsertPaymentMilestoneFact("farreach", {
      subject: "PI-900 payment",
      customerId: "buyer-co",
      customerName: "Buyer Co",
      confidence: 0.84,
      occurredAt: "2026-06-11T10:05:00.000Z",
      source: { type: "pi-record", id: "PI-900" },
      idempotencyKey: "farreach:payment:pi-900:pi-record",
      data: { orderNo: "PI-900", paymentStatus: "overdue", amount: "USD 5000" },
    });

    const facts = listSalesFacts("farreach").sort((a, b) => a.idempotencyKey.localeCompare(b.idempotencyKey));
    expect(first.factId).not.toBe(conflicting.factId);
    expect(facts).toHaveLength(2);
    expect(facts.every((fact) => fact.conflictStatus === "conflict")).toBe(true);
    expect(facts[0].data.reviewRequired).toBe(true);
    expect(facts[0].data.conflictWith).toContain(facts[1].factId);
    expect(facts[1].data.conflictWith).toContain(facts[0].factId);
  });

  it("keeps workspace facts isolated and prevents cross-workspace leakage", () => {
    upsertCustomerAccountFact("farreach", {
      subject: "Farreach Only",
      customerName: "Farreach Only",
      source: { type: "customer-directory", id: "farreach-only" },
      idempotencyKey: "farreach:customer:only",
      data: { country: "US" },
    });
    upsertCustomerAccountFact("hero-pumps", {
      subject: "Hero Pumps Only",
      customerName: "Hero Pumps Only",
      source: { type: "customer-directory", id: "hero-only" },
      idempotencyKey: "hero-pumps:customer:only",
      data: { country: "DE" },
    });

    expect(listSalesFacts("farreach").map((fact) => fact.customerName)).toEqual(["Farreach Only"]);
    expect(listSalesFacts("hero-pumps").map((fact) => fact.customerName)).toEqual(["Hero Pumps Only"]);
  });

  it("provides a write helper for lead facts from the canonical roadmap type set", () => {
    const lead = upsertLeadFact("hero-pumps", {
      subject: "Ledger Lead",
      customerName: "Ledger Lead",
      source: { type: "lead", id: "lead-1" },
      idempotencyKey: "hero-pumps:lead:lead-1",
      data: { score: "Warm", reason: "Imported lead source" },
    });

    expect(lead.type).toBe("lead");
    expect(listSalesFacts("hero-pumps").map((fact) => fact.type)).toContain("lead");
  });

  it("merges ledger facts into the existing sales world model read API", () => {
    upsertSalesFact("hero-pumps", {
      type: "quotation",
      subject: "Draft quotation for Ledger Pumps Inc",
      customerId: "ledger-pumps",
      customerName: "Ledger Pumps Inc",
      confidence: 0.74,
      occurredAt: "2026-06-12T10:00:00.000Z",
      source: { type: "quotation-draft", id: "draft-1" },
      idempotencyKey: "hero-pumps:quotation-draft:draft-1",
      data: {
        officialQuote: false,
        piGenerated: false,
        documentGenerated: false,
        authority: "draft_only",
      },
    });

    const model = buildSalesWorldModel(createSalesRuntime(), "hero-pumps");
    const ledgerFact = model.facts.find((fact) => fact.idempotencyKey === "hero-pumps:quotation-draft:draft-1");

    expect(ledgerFact).toEqual(expect.objectContaining({
      id: expect.any(String),
      type: "quotation",
      customerName: "Ledger Pumps Inc",
      confidence: 0.74,
      version: 1,
      conflictStatus: "none",
    }));
    expect(ledgerFact?.provenance).toEqual([expect.objectContaining({ type: "quotation-draft", id: "draft-1" })]);
    expect(model.coverage.generatedFrom).toContain("sales-fact-ledger");
  });
});

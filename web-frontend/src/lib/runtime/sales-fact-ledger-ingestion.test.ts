import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePiRecord, type TradeDocumentData } from "./documents";
import { runProductQuotationDraft } from "./product-quotation-drafts";
import { runProspectingDryRun } from "./prospecting-loop";
import { createSalesRuntime } from "./sales-runtime";
import { listSalesFacts, upsertPaymentMilestoneFact } from "./sales-fact-ledger";
import {
  deriveOrderPaymentLifecycleDraft,
  replayWorkspaceSourcesToFactLedger,
} from "./sales-fact-ledger-ingestion";
import { readCustomerActivities, syncInboxEmailsToCustomers } from "./customer-activity";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-ledger-ingestion-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("fact ledger ingestion wiring and lifecycle draft", () => {
  it("writes customer activity, email, RFQ, order, payment, shipment, and exception facts from inbox sync", () => {
    const runtime = createSalesRuntime();

    syncInboxEmailsToCustomers(runtime, "farreach", [
      {
        id: "ledger-rfq-001",
        from_email: "mia@ledger-buyer.example",
        from_name: "Mia Buyer",
        subject: "RFQ for USB-C cable program",
        body_text: "Please quote 3000 pcs USB-C to HDMI cables this week.",
        received_at: "2026-06-08T09:00:00.000Z",
        status: "pending_decision",
        analysis: {
          intent: "inquiry_rfq",
          confidence: 0.92,
          urgency: "high",
          sentiment: "positive",
          key_points: ["3000 pcs USB-C to HDMI", "Quote needed this week"],
          customer_level: "Buyer",
          tags: [],
        },
      },
      {
        id: "ledger-order-001",
        from_email: "ops@ledger-buyer.example",
        from_name: "Owen Ops",
        subject: "Payment received and shipment exception for PI-LEDGER-001",
        body_text: "Payment received for PI-LEDGER-001. USD 7200.00 shipped by DHL, but customs hold is causing a shipment exception.",
        received_at: "2026-06-09T09:00:00.000Z",
        status: "pending_decision",
        analysis: {
          intent: "logistics",
          confidence: 0.9,
          urgency: "high",
          sentiment: "negative",
          key_points: ["payment received", "shipment exception"],
          customer_level: "Operations",
          tags: [],
        },
      },
    ], {
      now: "2026-06-09T09:01:00.000Z",
      source: "ledger-ingestion-test",
    });

    const facts = listSalesFacts("farreach");
    expect(facts.map((fact) => fact.type)).toEqual(expect.arrayContaining([
      "customer.account",
      "contact",
      "email.interaction",
      "rfq",
      "pi.order",
      "payment.milestone",
      "shipment.milestone",
      "after_sales.exception",
    ]));
    const payment = facts.find((fact) => fact.type === "payment.milestone");
    expect(payment).toEqual(expect.objectContaining({
      conflictStatus: "none",
      data: expect.objectContaining({
        verificationStatus: "unverified",
        authority: "inferred_from_customer_activity",
        reviewRequired: true,
        paymentStatus: "paid",
      }),
    }));
    expect(payment?.sourceRefs).toEqual([expect.objectContaining({ type: "customer-activity" })]);
  });

  it("replays PI records, price memory, memory, and quotation drafts without changing source files", () => {
    const runtime = createSalesRuntime();
    const piData = tradeDocumentData("PI-REPLAY-001", "Replay Buyer", "replay@buyer.example");
    const piRecord = savePiRecord("hero-pumps", piData, "test.pi-source");
    runtime.writeMemory({
      workspaceId: "hero-pumps",
      customerName: "Replay Buyer",
      title: "Replay Buyer prefers FOB terms",
      body: "Use FOB unless the buyer asks for CIF.",
      tags: ["preference"],
      source: { type: "operator", id: "memory-1" },
      confidence: 0.94,
      idempotencyKey: "hero-pumps:memory:replay-buyer",
    });

    const prospectingRun = runProspectingDryRun(runtime, {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:ledger-replay:prospecting",
      seeds: [{
        companyName: "Replay Buyer",
        country: "US",
        industry: "municipal pump distributor",
        contactEmail: "replay@buyer.example",
        notes: "Interested in pumps and spare parts.",
      }],
    });
    runProductQuotationDraft(runtime, {
      workspaceId: "hero-pumps",
      prospectingRunId: prospectingRun.id,
      prospectingPacketId: prospectingRun.packets[0].id,
      idempotencyKey: "hero-pumps:ledger-replay:quotation-draft",
    });

    const sourceSnapshots = snapshotFiles([
      path.join(tempRoot, "companies", "hero-pumps", "documents", "pi-records", "PI-REPLAY-001.json"),
      path.join(tempRoot, "companies", "hero-pumps", "pricing", "price-memory.json"),
      path.join(tempRoot, "companies", "hero-pumps", "memory", "records.json"),
      path.join(tempRoot, "companies", "hero-pumps", "growth", "quotation-draft-runs.json"),
    ]);

    const first = replayWorkspaceSourcesToFactLedger(runtime, "hero-pumps");
    const second = replayWorkspaceSourcesToFactLedger(runtime, "hero-pumps");
    const facts = listSalesFacts("hero-pumps");

    expect(first.written).toBeGreaterThan(0);
    expect(second.written).toBe(0);
    expect(facts.map((fact) => fact.type)).toEqual(expect.arrayContaining([
      "pi.order",
      "quotation",
      "memory.record",
    ]));
    expect(facts).toContainEqual(expect.objectContaining({
      type: "quotation",
      data: expect.objectContaining({
        draftOnly: true,
        officialQuote: false,
        piGenerated: false,
        documentGenerated: false,
        authority: "draft_only",
      }),
    }));
    expect(facts).toContainEqual(expect.objectContaining({
      type: "quotation",
      sourceRefs: [expect.objectContaining({ type: "price-memory" })],
      data: expect.objectContaining({
        authority: "price_reference_evidence",
        notAuthorityForPayment: true,
      }),
    }));
    expect(snapshotFiles(Object.keys(sourceSnapshots))).toEqual(sourceSnapshots);
    expect(piRecord.piNo).toBe("PI-REPLAY-001");
  });

  it("derives unverified lifecycle draft and marks conflicts for review", () => {
    upsertPaymentMilestoneFact("farreach", {
      subject: "PI-CONFLICT-001 payment",
      customerId: "conflict-buyer",
      customerName: "Conflict Buyer",
      source: { type: "customer-activity", id: "email-paid" },
      idempotencyKey: "farreach:payment:pi-conflict-001:email",
      occurredAt: "2026-06-10T10:00:00.000Z",
      confidence: 0.8,
      data: {
        orderNo: "PI-CONFLICT-001",
        paymentStatus: "paid",
        verificationStatus: "unverified",
        authority: "inferred_from_customer_activity",
        reviewRequired: true,
      },
    });
    upsertPaymentMilestoneFact("farreach", {
      subject: "PI-CONFLICT-001 payment",
      customerId: "conflict-buyer",
      customerName: "Conflict Buyer",
      source: { type: "customer-activity", id: "email-overdue" },
      idempotencyKey: "farreach:payment:pi-conflict-001:overdue-email",
      occurredAt: "2026-06-11T10:00:00.000Z",
      confidence: 0.78,
      data: {
        orderNo: "PI-CONFLICT-001",
        paymentStatus: "overdue",
        verificationStatus: "unverified",
        authority: "inferred_from_customer_activity",
        reviewRequired: true,
      },
    });

    const draft = deriveOrderPaymentLifecycleDraft("farreach", {
      customerName: "Conflict Buyer",
      orderNo: "PI-CONFLICT-001",
    });

    expect(draft.payment.status).toBe("conflict");
    expect(draft.payment.verificationStatus).toBe("unverified");
    expect(draft.reviewRequired).toBe(true);
    expect(draft.recommendedOperatorAction).toMatch(/Review conflicting payment evidence/);
    expect(draft.authority).toBe("draft_only_not_accounting_authority");
  });

  it("keeps replay and lifecycle draft workspace scoped", () => {
    const runtime = createSalesRuntime();
    savePiRecord("farreach", tradeDocumentData("PI-FAR-001", "Far Buyer", "far@buyer.example"), "far-source");
    savePiRecord("hero-pumps", tradeDocumentData("PI-HERO-001", "Hero Buyer", "hero@buyer.example"), "hero-source");

    replayWorkspaceSourcesToFactLedger(runtime, "farreach");

    expect(listSalesFacts("farreach").map((fact) => fact.customerName)).toContain("Far Buyer");
    expect(listSalesFacts("farreach").map((fact) => fact.customerName)).not.toContain("Hero Buyer");
    expect(deriveOrderPaymentLifecycleDraft("hero-pumps", { orderNo: "PI-FAR-001" }).evidenceRefs).toEqual([]);
  });
});

function tradeDocumentData(piNo: string, customerName: string, email: string): TradeDocumentData {
  return {
    company: { name: "Hero Pumps", address: "", phone: "", email: "sales@hero-pumps.test" },
    customer: { company_name: customerName, contact: "Buyer", email, phone: "", address: "", country: "US" },
    shipment: {
      date: "2026-06-12",
      vessel: "",
      departure_port: "Shanghai",
      destination_port: "Los Angeles",
      incoterms: "FOB",
      country_of_origin: "CN",
      marks: "",
    },
    currency: "USD",
    freight: 0,
    insurance: 0,
    products: [{
      description: "Industrial transfer pump",
      specification: "2 inch",
      hs_code: "8413",
      quantity: 20,
      unit_price: 320,
      unit_cost: 210,
      cost_currency: "USD",
      supplier: "Local Supplier",
      net_weight_kg: 300,
      gross_weight_kg: 340,
      dimensions_cm: "80x50x45",
      package_type: "wooden case",
      packages: 4,
    }],
    pi_info: { pi_no: piNo, valid_until: "2026-06-30" },
    ci_info: { ci_no: piNo.replace("PI", "CI"), ci_date: "2026-06-12", payment_terms: "T/T" },
    pl_info: { pl_no: piNo.replace("PI", "PL") },
  };
}

function snapshotFiles(filePaths: string[]): Record<string, string> {
  return filePaths.reduce<Record<string, string>>((acc, filePath) => {
    acc[filePath] = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
    return acc;
  }, {});
}

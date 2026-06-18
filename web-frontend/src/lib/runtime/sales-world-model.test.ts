import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePiRecord } from "./documents";
import { createSalesRuntime } from "./sales-runtime";
import { buildSalesWorldModel } from "./sales-world-model";
import { syncInboxEmailsToCustomers } from "./customer-activity";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-world-model-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("canonical sales world model", () => {
  it("normalizes customer, email, RFQ, PI, payment, shipment, exception, intelligence, and memory facts", () => {
    const runtime = createSalesRuntime();

    syncInboxEmailsToCustomers(runtime, "farreach", [
      {
        id: "wm-rfq-001",
        from_email: "mia@world-model.example",
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
        id: "wm-order-001",
        from_email: "ops@world-model.example",
        from_name: "Owen Ops",
        subject: "Payment received and shipment exception for PI-WM-001",
        body_text: "Payment received for PI-WM-001. USB-C cable program USD 7200.00 shipped by DHL, but customs hold is causing a shipment exception.",
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
      source: "world-model-test",
    });

    savePiRecord("farreach", {
      company: { name: "Farreach", address: "", phone: "", email: "sales@farreach.test" },
      customer: { company_name: "World Model", contact: "Mia Buyer", email: "mia@world-model.example", phone: "", address: "", country: "US" },
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
        description: "USB-C cable program",
        specification: "USB-C to HDMI",
        hs_code: "8544",
        quantity: 3000,
        unit_price: 2.4,
        net_weight_kg: 120,
        gross_weight_kg: 140,
        dimensions_cm: "40x30x20",
        package_type: "carton",
        packages: 12,
      }],
      pi_info: { pi_no: "PI-WM-001", valid_until: "2026-06-30" },
      ci_info: { ci_no: "CI-WM-001", ci_date: "2026-06-09", payment_terms: "T/T" },
      pl_info: { pl_no: "PL-WM-001" },
    }, "world-model-test");

    runtime.writeMemory({
      workspaceId: "farreach",
      customerName: "World Model",
      title: "Buyer prefers FOB Los Angeles quotes",
      body: "Use FOB Los Angeles unless the buyer requests DDP.",
      tags: ["preference"],
      source: { type: "operator" },
      confidence: 0.96,
      idempotencyKey: "world-model-memory-001",
    });

    const model = buildSalesWorldModel(runtime, "farreach");
    const factsForCustomer = model.facts.filter((fact) => fact.customerName === "World Model");

    expect(new Set(factsForCustomer.map((fact) => fact.type))).toEqual(expect.objectContaining({
      has: expect.any(Function),
    }));
    expect(factsForCustomer.map((fact) => fact.type)).toEqual(expect.arrayContaining([
      "customer.account",
      "contact",
      "email.interaction",
      "rfq",
      "pi.order",
      "payment.milestone",
      "shipment.milestone",
      "after_sales.exception",
      "customer.intelligence",
      "memory.record",
    ]));
    expect(model.coverage.factTypes).toEqual(expect.arrayContaining(["customer.account", "rfq", "pi.order"]));
    expect(factsForCustomer.every((fact) =>
      fact.id &&
      fact.workspaceId === "farreach" &&
      fact.source.type &&
      typeof fact.confidence === "number" &&
      fact.updatedAt &&
      fact.idempotencyKey &&
      fact.customerId &&
      fact.provenance.length > 0
    )).toBe(true);
  });
});

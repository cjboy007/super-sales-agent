import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { appendCustomerActivity, readCustomerActivities } from "./customer-activity";
import { ingestCustomerInteraction, resolveCustomerAffiliation } from "./customer-memory-ingestor";
import type { CustomerActivityRecord } from "./customer-activity";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalRealEmailSend = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-customer-memory-ingestor-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalRealEmailSend === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalRealEmailSend;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function customerActivity(input: Partial<CustomerActivityRecord> = {}): CustomerActivityRecord {
  return {
    id: input.id || "seed:memory-buyer",
    workspaceId: "farreach",
    customerId: input.customerId || "memory-buyer.example",
    customerName: input.customerName || "Memory Buyer",
    kind: input.kind || "email_received",
    occurredAt: input.occurredAt || "2026-06-10T08:00:00.000Z",
    createdAt: input.createdAt || "2026-06-10T08:00:00.000Z",
    contactName: input.contactName || "Maya",
    contactEmail: input.contactEmail || "maya@memory-buyer.example",
    subject: input.subject || "RFQ for USB-C cable",
    summary: input.summary || "Memory Buyer asked for USB-C cable pricing.",
    status: input.status || "received",
    source: input.source || "seed",
    metadata: input.metadata || {},
  };
}

describe("customer memory resolver and ingestor", () => {
  it("resolves a customer from prior activity and PI references", () => {
    appendCustomerActivity("farreach", customerActivity({
      id: "seed:pi-memory-buyer",
      subject: "PI-MEM-001 payment update",
      summary: "Payment received for PI-MEM-001. USB-C cable order is preparing.",
      metadata: {
        orderNumber: "PI-MEM-001",
      },
    }));

    const match = resolveCustomerAffiliation(createSalesRuntime(), {
      workspaceId: "farreach",
      text: "Please check PI-MEM-001 and prepare the shipping documents.",
      documentNo: "PI-MEM-001",
    });

    expect(match).toMatchObject({
      customerId: "memory-buyer.example",
      customerName: "Memory Buyer",
      ambiguous: false,
    });
    expect(match.confidence).toBeGreaterThanOrEqual(0.8);
    expect(match.matchedSignals).toEqual(expect.arrayContaining(["document:PI-MEM-001"]));
  });

  it("keeps ambiguous customer mentions as suggested memory without attaching to a customer", () => {
    appendCustomerActivity("farreach", customerActivity({
      id: "seed:cable-house-us",
      customerId: "cable-house-us.example",
      customerName: "Cable House US",
      contactEmail: "buyer@cable-house-us.example",
      subject: "Cable House US RFQ",
      summary: "Cable House US asked for HDMI pricing.",
    }));
    appendCustomerActivity("farreach", customerActivity({
      id: "seed:cable-house-eu",
      customerId: "cable-house-eu.example",
      customerName: "Cable House EU",
      contactEmail: "buyer@cable-house-eu.example",
      subject: "Cable House EU RFQ",
      summary: "Cable House EU asked for USB-C pricing.",
    }));

    const result = ingestCustomerInteraction(createSalesRuntime(), {
      workspaceId: "farreach",
      direction: "operator_note",
      subject: "Cable House follow-up",
      body: "Cable House wants us to prepare revised pricing next week.",
      occurredAt: "2026-06-11T10:00:00.000Z",
      source: { type: "operator", id: "cmd-ambiguous" },
      idempotencyKey: "farreach:operator:cmd-ambiguous",
    });

    expect(result.resolution.ambiguous).toBe(true);
    expect(result.memory?.authority).toBe("suggested");
    expect(result.memory?.customerId).toBeUndefined();
    expect(result.activity).toBeUndefined();
    expect(result.reviewRequired).toBe(true);
  });

  it("records outbound email send requests as customer activity and memory", async () => {
    appendCustomerActivity("farreach", customerActivity());
    const runtime = createSalesRuntime();

    const result = await runtime.sendEmail({
      workspaceId: "farreach",
      to: "maya@memory-buyer.example",
      subject: "Re: USB-C cable quotation",
      body: "We can offer USB-C cable at USD 1.25/pc. PI-MEM-002 can be prepared after confirmation.",
    });

    expect(result.blocked).toBe(true);
    expect(readCustomerActivities("farreach")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "email_sent",
        customerId: "memory-buyer.example",
        customerName: "Memory Buyer",
        contactEmail: "maya@memory-buyer.example",
        subject: "Re: USB-C cable quotation",
        metadata: expect.objectContaining({
          direction: "outbound_email",
        }),
      }),
    ]));
    expect(runtime.searchMemory({
      workspaceId: "farreach",
      query: "PI-MEM-002 USB-C",
      customerId: "memory-buyer.example",
      limit: 10,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "episode",
        customerId: "memory-buyer.example",
        title: expect.stringContaining("Outbound email"),
        tags: expect.arrayContaining(["outbound-email", "customer-progress"]),
      }),
    ]));
  });

  it("records operator chat mentions as customer progress memory", () => {
    appendCustomerActivity("farreach", customerActivity());
    const runtime = createSalesRuntime();

    runtime.createOperatorCommand({
      workspaceId: "farreach",
      page: "customer-chat",
      message: "Memory Buyer confirmed payment and wants shipping documents for PI-MEM-003 tomorrow.",
      context: {
        customerName: "Memory Buyer",
      },
    });

    expect(runtime.searchMemory({
      workspaceId: "farreach",
      query: "shipping documents PI-MEM-003",
      customerId: "memory-buyer.example",
      limit: 10,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        customerId: "memory-buyer.example",
        title: expect.stringContaining("Operator note"),
        tags: expect.arrayContaining(["operator-command", "customer-progress"]),
      }),
    ]));
  });

  it("loads customer memory before drafting an inbox reply", async () => {
    const runtime = createSalesRuntime();
    runtime.writeMemory({
      workspaceId: "farreach",
      kind: "episode",
      customerId: "techkabel.de",
      customerName: "Techkabel",
      subject: "Known pricing preference",
      title: "TechKabel target price",
      body: "TechKabel wants DP at USD 2.80 and USB-C at USD 1.60 before May 20.",
      tags: ["customer-progress", "pricing"],
      source: { type: "operator", id: "seed-memory" },
      confidence: 0.95,
      idempotencyKey: "farreach:seed:techkabel-price",
    });
    const runLlm = vi.spyOn(runtime, "runLlm").mockResolvedValue({
      provider: "test",
      source: "mock",
      text: "Draft using memory.",
      confidence: 0.9,
    });

    await runtime.draftInboxReply({
      workspaceId: "farreach",
      emailId: "email-001",
      language: "en",
    });

    expect(runLlm).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        customerMemory: expect.objectContaining({
          timeline: expect.objectContaining({
            summary: expect.stringContaining("TechKabel target price"),
          }),
        }),
      }),
    }));
  });

  it("records blocked quotation generation requests as document progress memory", async () => {
    appendCustomerActivity("farreach", customerActivity());
    const runtime = createSalesRuntime();

    const result = await runtime.generateQuotationDocuments({
      workspaceId: "farreach",
      type: "PI",
      customer: "Memory Buyer",
      items: [{
        name: "USB-C cable",
        qty: 1000,
        unitPrice: 1.25,
      }],
      terms: "30% deposit, 70% before shipment",
    });

    expect(result.blocked).toBe(true);
    expect(runtime.searchMemory({
      workspaceId: "farreach",
      query: "PI USB-C cable deposit",
      customerId: "memory-buyer.example",
      limit: 10,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        customerId: "memory-buyer.example",
        title: expect.stringContaining("Document request"),
        tags: expect.arrayContaining(["document-progress", "customer-progress"]),
      }),
    ]));
  });
});

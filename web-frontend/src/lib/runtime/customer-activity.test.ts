import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import { buildCustomerDirectory } from "./customers";
import { syncInboxEmailsToCustomers } from "./customer-activity";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-customer-activity-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("customer activity sync", () => {
  it("turns inbound order lifecycle emails into customer order timeline activity", () => {
    const runtime = createSalesRuntime();

    const synced = syncInboxEmailsToCustomers(runtime, "farreach", [
      {
        id: "paid-shipped-001",
        from_email: "ops@order-mail.example",
        from_name: "Olivia Ops",
        subject: "Payment received and shipment booked for PI-MAIL-001",
        body_text: "Payment received for PI-MAIL-001. USB-C cable program USD 7200.00 has shipped by DHL today.",
        received_at: "2026-06-08T09:00:00.000Z",
        status: "pending_decision",
        analysis: {
          intent: "logistics",
          confidence: 0.9,
          urgency: "medium",
          sentiment: "positive",
          key_points: ["payment received", "shipment booked", "USD 7200.00"],
          customer_level: "Operations",
          tags: [],
        },
      },
      {
        id: "exception-001",
        from_email: "ops@order-mail.example",
        from_name: "Olivia Ops",
        subject: "Shipment exception for PI-MAIL-001",
        body_text: "Shipment exception: DHL reports customs hold for USB-C cable program. Payment remains paid.",
        received_at: "2026-06-09T09:00:00.000Z",
        status: "pending_decision",
        analysis: {
          intent: "logistics",
          confidence: 0.9,
          urgency: "high",
          sentiment: "negative",
          key_points: ["shipment exception", "customs hold"],
          customer_level: "Operations",
          tags: [],
        },
      },
    ], {
      now: "2026-06-09T09:01:00.000Z",
      source: "test-inbox",
    });

    expect(synced).toMatchObject({
      newActivities: 2,
      orderActivities: 2,
      customersUpserted: 1,
    });

    const activities = JSON.parse(fs.readFileSync(
      path.join(tempRoot, "companies", "farreach", "customers", "activity.json"),
      "utf-8"
    ));
    expect(activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "order_status",
        customerName: "Order Mail",
        summary: expect.stringContaining("USB-C cable program shipment shipped for USD 7200.00"),
        metadata: expect.objectContaining({
          orderNumber: "PI-MAIL-001",
          orderType: "PI",
          lifecycleStage: "shipment",
          paymentStatus: "paid",
          fulfillmentStatus: "shipped",
        }),
      }),
      expect.objectContaining({
        kind: "order_status",
        summary: expect.stringContaining("shipment exception"),
        metadata: expect.objectContaining({
          orderNumber: "PI-MAIL-001",
          lifecycleStage: "exception",
          fulfillmentStatus: "exception",
        }),
      }),
    ]));

    const directory = buildCustomerDirectory(runtime, "farreach", {
      search: "Order Mail",
      page: 1,
      pageSize: 20,
    });
    const customer = directory.customers[0];

    expect(customer).toMatchObject({
      companyName: "Order Mail",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        ruleId: "risk.order_activity_exception",
      }),
    });
    expect(customer.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "PI",
        productType: "USB-C cable program",
        amount: "USD 7200.00",
        lifecycle: expect.objectContaining({
          stage: "exception",
          paymentStatus: "paid",
          fulfillmentStatus: "exception",
        }),
      }),
    ]));
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Shipment",
        summary: expect.stringContaining("USB-C cable program shipment shipped"),
      }),
      expect.objectContaining({
        type: "Exception",
        summary: expect.stringContaining("shipment exception"),
      }),
    ]));
    expect(JSON.stringify(customer)).not.toContain("PI-MAIL-001");
  });

  it("persists automatic lifecycle status changes with explainable timeline evidence", () => {
    const runtime = createSalesRuntime();

    const synced = syncInboxEmailsToCustomers(runtime, "farreach", [
      {
        id: "lifecycle-rfq-001",
        from_email: "buyer@lifecycle-buyer.example",
        from_name: "Lina Buyer",
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
    ], {
      now: "2026-06-08T09:01:00.000Z",
      source: "test-inbox",
    });

    expect(synced).toMatchObject({
      newActivities: 1,
      customersUpserted: 1,
    });

    const activityPath = path.join(tempRoot, "companies", "farreach", "customers", "activity.json");
    const activities = JSON.parse(fs.readFileSync(activityPath, "utf-8"));
    const lifecycleActivities = activities.filter((item: { kind: string }) => item.kind === "lifecycle_status");

    expect(lifecycleActivities).toHaveLength(1);
    expect(lifecycleActivities[0]).toMatchObject({
      customerId: "lifecycle-buyer.example",
      customerName: "Lifecycle Buyer",
      kind: "lifecycle_status",
      summary: expect.stringContaining("Automatic status changed to Active Customer"),
      status: "Active Customer",
      source: "customer-lifecycle",
      metadata: expect.objectContaining({
        automatic: true,
        status: "Active Customer",
        ruleId: "active.inbound_email",
        enteredWhen: expect.stringContaining("inbound email"),
        exitsWhen: expect.stringContaining("Dormant"),
        signals: expect.arrayContaining(["inbound email"]),
      }),
    });

    syncInboxEmailsToCustomers(runtime, "farreach", [
      {
        id: "lifecycle-rfq-001",
        from_email: "buyer@lifecycle-buyer.example",
        from_name: "Lina Buyer",
        subject: "RFQ for USB-C cable program",
        body_text: "Please quote 3000 pcs USB-C to HDMI cables this week.",
        received_at: "2026-06-08T09:00:00.000Z",
        status: "pending_decision",
      },
    ], {
      now: "2026-06-08T09:02:00.000Z",
      source: "test-inbox",
    });

    const afterDuplicateSync = JSON.parse(fs.readFileSync(activityPath, "utf-8"));
    expect(afterDuplicateSync.filter((item: { kind: string }) => item.kind === "lifecycle_status")).toHaveLength(1);

    const directory = buildCustomerDirectory(runtime, "farreach", {
      search: "Lifecycle Buyer",
      page: 1,
      pageSize: 20,
    });
    const customer = directory.customers[0];

    expect(customer).toMatchObject({
      status: "Active Customer",
      statusExplanation: expect.objectContaining({
        manualOverride: false,
        ruleId: "active.inbound_email",
      }),
    });
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Lifecycle",
        summary: expect.stringContaining("Automatic status changed to Active Customer"),
      }),
    ]));
    expect(JSON.stringify(customer)).not.toContain("jobId");
    expect(JSON.stringify(customer)).not.toContain("workflow");
    expect(JSON.stringify(customer)).not.toContain("/Users/");
  });
});

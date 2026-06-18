import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
const originalBridgeFlag = process.env.SSA_ENABLE_FARREACH_BRIDGE;
const originalImapFlag = process.env.SSA_ENABLE_REAL_IMAP;
const originalFarreachUrl = process.env.SSA_FARREACH_URL;
let tempRoot = "";

function request(url: string, token = "admin-token"): NextRequest {
  return new NextRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function writeRuntimeConfig() {
  fs.writeFileSync(
    path.join(tempRoot, "config.json"),
    JSON.stringify({
      email: "sales@example.com",
      imapHost: "imap.example.com",
      imapPort: "993",
      emailPassword: Buffer.from("mail-secret", "utf-8").toString("base64"),
      autoCapture: true,
      _encrypted: ["emailPassword"],
    }, null, 2),
    "utf-8"
  );
}

function writeSupervisorManifest() {
  const dir = path.join(tempRoot, "runtime", "supervisors");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "ssa-jaden-farreach-1.supervisor.json"),
    JSON.stringify({
      workspaceId: "farreach",
      workerId: "jaden-farreach-1",
      restartPolicy: "always",
      commands: {
        start: "hidden start",
        stop: "hidden stop",
        restart: "hidden restart",
        health: "hidden health",
      },
    }, null, 2),
    "utf-8"
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-email-to-crm-e2e-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
    { token: "admin-token", workspaces: ["*"] },
  ]);
  process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
  process.env.SSA_ENABLE_REAL_IMAP = "true";
  process.env.SSA_FARREACH_URL = "http://farreach.test";
  writeRuntimeConfig();
  writeSupervisorManifest();
});

afterEach(() => {
  vi.unstubAllGlobals();

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  if (originalBridgeFlag === undefined) delete process.env.SSA_ENABLE_FARREACH_BRIDGE;
  else process.env.SSA_ENABLE_FARREACH_BRIDGE = originalBridgeFlag;

  if (originalImapFlag === undefined) delete process.env.SSA_ENABLE_REAL_IMAP;
  else process.env.SSA_ENABLE_REAL_IMAP = originalImapFlag;

  if (originalFarreachUrl === undefined) delete process.env.SSA_FARREACH_URL;
  else process.env.SSA_FARREACH_URL = originalFarreachUrl;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("email to customer CRM flow", () => {
  it("syncs a new order email through the worker into customer CRM, order timeline, and readiness", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      count: 1,
      emails: [
        {
          id: "external-order-001",
          uid: 9001,
          from_email: "ops@beta-buyer.example",
          from_name: "Olivia Ops",
          subject: "Payment received and shipment exception for PI-BETA-001",
          body_text: "Payment received for PI-BETA-001. USB-C cable program USD 7200.00 shipped by DHL, but customs hold created a shipment exception.",
          received_at: "2026-06-08T09:00:00.000Z",
          status: "pending_decision",
          analysis: {
            intent: "logistics",
            confidence: 0.95,
            urgency: "high",
            sentiment: "negative",
            key_points: ["payment received", "shipment exception", "USD 7200.00"],
            customer_level: "Operations",
            tags: [],
          },
        },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const { createSalesRuntime } = await import("@/lib/runtime");
    const { runJadenWorkerTick } = await import("@/lib/runtime/jaden-worker");
    const runtime = createSalesRuntime();
    const tick = await runJadenWorkerTick({
      runtime,
      workerId: "jaden-farreach-1",
      workspaceId: "farreach",
      inboxLimit: 10,
      maxJobs: 1,
      now: new Date("2026-06-08T09:05:00.000Z"),
    });

    const customersRoute = await import("./route");
    const customersResponse = await customersRoute.GET(request("http://localhost/api/customers?project=farreach&query=Beta%20Buyer"));
    const customersJson = await customersResponse.json();
    const customer = customersJson.data.customers[0];

    const healthRoute = await import("../health/route");
    const healthJson = await (await healthRoute.GET(request("http://localhost/api/health?project=farreach"))).json();

    expect(tick).toMatchObject({
      inboxSynced: 1,
      lifecycleStatuses: expect.any(Number),
    });
    expect(customersResponse.status).toBe(200);
    expect(customer).toMatchObject({
      companyName: "Beta Buyer",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        ruleId: "risk.order_activity_exception",
      }),
    });
    expect(customer.contacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Olivia Ops",
        email: "ops@beta-buyer.example",
      }),
    ]));
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Email",
        summary: expect.stringContaining("Payment received and shipment exception"),
      }),
      expect.objectContaining({
        type: "Exception",
        summary: expect.stringContaining("shipment exception"),
      }),
    ]));
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
    expect(healthJson.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "mailbox-sync",
        status: "ready",
      }),
    ]));

    const serialized = JSON.stringify({ customer, readiness: healthJson.beta.readiness });
    expect(serialized).not.toContain("PI-BETA-001");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("workflow");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("channel_audit");
    expect(serialized).not.toContain("dataRoot");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("imap.example.com");
    expect(serialized).not.toContain("mail-secret");
  });
});

import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalDemoOverride = process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES;
let tempRoot = "";

function request(url: string, body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-demo-seed-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
  delete process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalDemoOverride === undefined) delete process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES;
  else process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES = originalDemoOverride;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/demo/seed route", () => {
  it("creates demo customers, inbound activity, and PI order records for one-click beta trial", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/demo/seed"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        customersCreated: expect.any(Number),
        activitiesCreated: expect.any(Number),
        ordersCreated: expect.any(Number),
      },
    });
    expect(json.data).not.toHaveProperty("workspaceId");
    expect(json.data).not.toHaveProperty("companyIntelQueued");
    expect(json.data.customersCreated).toBeGreaterThan(0);
    expect(json.data.activitiesCreated).toBeGreaterThan(0);
    expect(json.data.ordersCreated).toBeGreaterThan(0);

    const { GET } = await import("../../customers/route");
    const customerResponse = await GET(new NextRequest("http://localhost/api/customers?project=demo-exporter&query=Beta%20Cable"));
    const customerJson = await customerResponse.json();
    const customer = customerJson.data.customers[0];

    expect(customer).toMatchObject({
      companyName: "Beta Cable Labs",
      status: "Active Customer",
      statusExplanation: expect.objectContaining({
        reason: expect.stringContaining("order"),
      }),
    });
    expect(customer.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "PI",
        productType: "USB-C active cable pilot order",
        amount: "USD 12500.00",
        status: "Issued",
        lifecycle: expect.objectContaining({
          stage: "payment",
          paymentStatus: "pending",
          fulfillmentStatus: "not_started",
        }),
      }),
    ]));
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "Email" }),
      expect.objectContaining({ type: "Payment" }),
      expect.objectContaining({ type: "Shipment" }),
    ]));
    const serialized = JSON.stringify({ response: json, customer });
    expect(serialized).not.toContain("PI-BETA-0001");
    expect(serialized).not.toContain("companyIntelQueued");
    expect(serialized).not.toContain("backgroundChecksQueued");
  });

  it("blocks demo seeding into protected real project workspaces by default", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/demo/seed?project=farreach"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toMatchObject({
      success: false,
      error: expect.stringContaining("Demo data is blocked for real project workspace"),
    });
    expect(fs.existsSync(path.join(tempRoot, "companies", "farreach", "leads"))).toBe(false);
  });
});

import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalSecretsDir = process.env.SSA_SECRETS_DIR;
const originalProfile = process.env.SSA_PROFILE;
const originalEmailProfile = process.env.EMAIL_PROFILE;
const originalProfilePath = process.env.SSA_PROFILE_PATH;
const originalDemoOverride = process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES;
let tempRoot = "";

function request(url: string, body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getRequest(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-demo-email-crm-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
  process.env.SSA_SECRETS_DIR = path.join(tempRoot, "isolated-profiles");
  delete process.env.SSA_PROFILE;
  delete process.env.EMAIL_PROFILE;
  delete process.env.SSA_PROFILE_PATH;
  delete process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalSecretsDir === undefined) delete process.env.SSA_SECRETS_DIR;
  else process.env.SSA_SECRETS_DIR = originalSecretsDir;

  if (originalProfile === undefined) delete process.env.SSA_PROFILE;
  else process.env.SSA_PROFILE = originalProfile;

  if (originalEmailProfile === undefined) delete process.env.EMAIL_PROFILE;
  else process.env.EMAIL_PROFILE = originalEmailProfile;

  if (originalProfilePath === undefined) delete process.env.SSA_PROFILE_PATH;
  else process.env.SSA_PROFILE_PATH = originalProfilePath;

  if (originalDemoOverride === undefined) delete process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES;
  else process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES = originalDemoOverride;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/demo/email-crm route", () => {
  it("runs a local inbound-mail drill into customer CRM without marking real mailbox sync ready", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/demo/email-crm", {
      now: "2026-06-08T10:00:00.000Z",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        mode: "local_demo",
        received: 1,
        activitiesCreated: expect.any(Number),
        orderActivities: expect.any(Number),
        customersUpserted: expect.any(Number),
      },
    });
    expect(json.data).not.toHaveProperty("workspaceId");
    expect(json.data).not.toHaveProperty("companyIntelQueued");
    expect(json.data.activitiesCreated).toBeGreaterThan(0);
    expect(json.data.orderActivities).toBeGreaterThan(0);
    expect(json.data.customersUpserted).toBeGreaterThan(0);

    const { GET } = await import("../../customers/route");
    const customerResponse = await GET(new NextRequest("http://localhost/api/customers?project=demo-exporter&query=Demo%20Mail"));
    const customerJson = await customerResponse.json();
    const customer = customerJson.data.customers[0];

    expect(customer).toMatchObject({
      companyName: "Demo Mail Buyer",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        ruleId: "risk.order_activity_exception",
      }),
    });
    expect(customer.contacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Maya Mail",
        email: "maya@demo-mail-buyer.example",
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
        productType: "HDMI 2.1 cable order",
        amount: "USD 4800.00",
        lifecycle: expect.objectContaining({
          stage: "exception",
          paymentStatus: "paid",
          fulfillmentStatus: "exception",
        }),
      }),
    ]));

    const healthRoute = await import("../../health/route");
    const healthJson = await (await healthRoute.GET(getRequest("http://localhost/api/health?project=demo-exporter"))).json();
    expect(healthJson.beta.readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "mailbox-sync", status: "needs_setup" }),
      expect.objectContaining({ id: "customer-activity", status: "ready" }),
    ]));

    const serialized = JSON.stringify({ response: json, customer, readiness: healthJson.beta.readiness });
    expect(serialized).not.toContain("PI-DEMO-MAIL-001");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("workflow");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("channel_audit");
    expect(serialized).not.toContain("dataRoot");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("companyIntelQueued");
    expect(serialized).not.toContain("backgroundChecksQueued");
  });

  it("blocks demo email drills into protected real project workspaces by default", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/demo/email-crm?project=hero-pumps", {
      now: "2026-06-08T10:00:00.000Z",
    }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toMatchObject({
      success: false,
      error: expect.stringContaining("Demo data is blocked for real project workspace"),
    });
    expect(fs.existsSync(path.join(tempRoot, "companies", "hero-pumps", "customers", "activity.json"))).toBe(false);
  });
});

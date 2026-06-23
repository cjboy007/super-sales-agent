import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-growth-scheduler-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
    { token: "hero-token", workspaces: ["hero-pumps"] },
  ]);
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalCrmFlag === undefined) delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  else process.env.SSA_ENABLE_REAL_CRM_WRITE = originalCrmFlag;

  if (originalDocumentFlag === undefined) delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  else process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = originalDocumentFlag;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, init: { method?: string; body?: unknown; token?: string } = {}): NextRequest {
  return new NextRequest(url, {
    method: init.method,
    body: init.body ? JSON.stringify(init.body) : undefined,
    headers: {
      Authorization: `Bearer ${init.token || "hero-token"}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
}

function seedPriceMemory() {
  const dir = path.join(tempRoot, "companies", "hero-pumps", "pricing");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "price-memory.json"),
    JSON.stringify([
      {
        id: "PI-API-PHASE12:0:industrial-pump",
        workspaceId: "hero-pumps",
        customer: "API Scheduler Buyer",
        contact: "Sam",
        email: "sam@example.com",
        country: "USA",
        product: "Industrial transfer pump",
        specification: "stainless steel / 380V",
        model: "HP-380",
        hsCode: "841370",
        quantity: 10,
        unitPrice: 450,
        unitCost: 280,
        costCurrency: "USD",
        supplier: "Hero Pump Factory",
        supplierCandidates: ["Hero Pump Factory"],
        currency: "USD",
        piNo: "PI-API-PHASE12",
        date: "2026-05-20",
        incoterms: "FOB",
        source: "test",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ], null, 2),
    "utf-8"
  );
}

describe("/api/growth/scheduler and /api/growth/metrics routes", () => {
  it("enforces workspace-scoped auth for scheduler and metrics", async () => {
    const schedulerRoute = await import("./route");
    const runRoute = await import("./run/route");
    const metricsRoute = await import("../metrics/route");

    expect((await schedulerRoute.GET(request("http://localhost/api/growth/scheduler?project=farreach"))).status).toBe(403);
    expect((await runRoute.POST(request("http://localhost/api/growth/scheduler/run?project=farreach", {
      method: "POST",
      body: { idempotencyKey: "blocked" },
    }))).status).toBe(403);
    expect((await metricsRoute.GET(request("http://localhost/api/growth/metrics?project=farreach"))).status).toBe(403);

    const allowed = await schedulerRoute.GET(request("http://localhost/api/growth/scheduler?project=hero-pumps"));
    const json = await allowed.json();
    expect(allowed.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        workspaceId: "hero-pumps",
        dryRun: true,
        noOutboundSent: true,
        autopilotReady: false,
      },
    });
  });

  it("runs one sanitized dry-run scheduler tick and lists metrics without executing outbound", async () => {
    seedPriceMemory();
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const beforeSideEffects = runtime.listSideEffects(50).length;
    const schedulerRoute = await import("./route");
    const runRoute = await import("./run/route");
    const metricsRoute = await import("../metrics/route");

    const createdResponse = await runRoute.POST(request("http://localhost/api/growth/scheduler/run?project=hero-pumps", {
      method: "POST",
      body: {
        idempotencyKey: "hero-pumps:api:phase12:scheduler",
        seeds: [{
          companyName: "API Scheduler Buyer",
          website: "https://api-scheduler.example",
          country: "US",
          industry: "industrial pump distribution",
          contactName: "Sam Buyer",
          contactRole: "Procurement",
          contactEmail: "sam@api-scheduler.example",
          sourceUrl: "https://directory.example/api-scheduler",
          notes: "Imports replacement pumps.",
        }],
        payload: "raw-body",
        secret: "scheduler-secret",
        localPath: "/Users/wilson/private/scheduler.json",
        envName: "SSA_ENABLE_REAL_EMAIL_SEND",
      },
    }));
    const created = await createdResponse.json();
    const listedResponse = await schedulerRoute.GET(request("http://localhost/api/growth/scheduler?project=hero-pumps"));
    const listed = await listedResponse.json();
    const metricsResponse = await metricsRoute.GET(request("http://localhost/api/growth/metrics?project=hero-pumps"));
    const metrics = await metricsResponse.json();
    const serialized = JSON.stringify({ created, listed, metrics });
    const sideEffects = createSalesRuntime().listSideEffects(50);

    expect(createdResponse.status).toBe(200);
    expect(created.data).toMatchObject({
      workspaceId: "hero-pumps",
      dryRun: true,
      draftOnly: true,
      notExecuted: true,
      noOutboundSent: true,
      autopilotReady: false,
      realOutboundPilotStarted: false,
    });
    expect(created.data.steps.map((step: { kind: string }) => step.kind)).toEqual([
      "dry_run_prospecting",
      "quotation_draft_preparation",
      "outbound_approval_preparation",
      "decision_memory_review_summary",
    ]);
    expect(listed.data.runs).toHaveLength(1);
    expect(metrics.data).toMatchObject({
      workspaceId: "hero-pumps",
      candidateCount: 1,
      noOutboundSent: true,
      notExecuted: true,
      autopilotReady: false,
    });
    expect(sideEffects.length).toBe(beforeSideEffects + 1);
    expect(sideEffects[0]).toMatchObject({
      kind: "email.send",
      status: "blocked",
      realExecutionEnabled: false,
    });
    expect(sideEffects[0].execution).toBeUndefined();

    expect(serialized).toContain("no outbound sent");
    expect(serialized).toContain("not executed");
    expect(serialized).toContain("autopilot not ready");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("SSA_");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("scheduler-secret");
    expect(serialized).not.toContain("raw-body");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("real outbound pilot started");
    expect(serialized).not.toContain("email sent");
    expect(serialized).not.toContain("CRM updated");
    expect(serialized).not.toContain("PI generated");
  });
});

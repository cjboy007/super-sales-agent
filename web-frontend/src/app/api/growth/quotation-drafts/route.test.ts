import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-growth-quotation-drafts-route-test-"));
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

function request(url: string, init: { method?: string; body?: unknown } = {}): NextRequest {
  return new NextRequest(url, {
    method: init.method,
    body: init.body ? JSON.stringify(init.body) : undefined,
    headers: {
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
        id: "PI-API-PUMP:0:industrial-pump",
        workspaceId: "hero-pumps",
        customer: "API Pump Buyer",
        contact: "Ari",
        email: "ari@example.com",
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
        piNo: "PI-API-PUMP",
        date: "2026-05-20",
        incoterms: "FOB",
        source: "test",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ], null, 2),
    "utf-8"
  );
}

describe("/api/growth/quotation-drafts routes", () => {
  it("returns draft state for explicitly selected workspaces without activation auth", async () => {
    const listRoute = await import("./route");

    const farreach = await listRoute.GET(request("http://localhost/api/growth/quotation-drafts?project=farreach"));
    const farreachJson = await farreach.json();
    const hero = await listRoute.GET(request("http://localhost/api/growth/quotation-drafts?project=hero-pumps"));
    const heroJson = await hero.json();

    expect(farreach.status).toBe(200);
    expect(farreachJson.data.workspaceId).toBe("farreach");
    expect(hero.status).toBe(200);
    expect(heroJson).toMatchObject({
      success: true,
      data: {
        workspaceId: "hero-pumps",
        dryRun: true,
        draftOnly: true,
        officialQuote: false,
        piGenerated: false,
        documentGenerated: false,
        sent: false,
      },
    });
  });

  it("creates and lists sanitized draft-only quotation runs without real side effects", async () => {
    seedPriceMemory();
    const { createSalesRuntime, runProspectingDryRun } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const beforeSideEffects = runtime.listSideEffects(20).length;
    const prospectingRun = runProspectingDryRun(runtime, {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:api:phase9:prospecting",
      seeds: [{
        companyName: "API Pump Buyer",
        website: "https://api-pump.example",
        country: "US",
        industry: "industrial pump distribution",
        contactName: "Ari Buyer",
        sourceUrl: "https://directory.example/api-pump",
        notes: "Imports replacement pumps.",
        localPath: "/Users/wilson/private/leads.csv",
        envName: "SSA_ENABLE_REAL_EMAIL_SEND",
      } as Record<string, unknown>],
    });
    const draftRoute = await import("./draft/route");
    const listRoute = await import("./route");

    const createdResponse = await draftRoute.POST(request("http://localhost/api/growth/quotation-drafts/draft?project=hero-pumps", {
      method: "POST",
      body: {
        idempotencyKey: "hero-pumps:api:phase9:draft",
        prospectingRunId: prospectingRun.id,
        prospectingPacketId: prospectingRun.packets[0].id,
        payload: "raw-body",
        secret: "crm-secret",
        localPath: "/Users/wilson/private/quotes.xlsx",
        envName: "SSA_ENABLE_REAL_CRM_WRITE",
      },
    }));
    const created = await createdResponse.json();
    const listedResponse = await listRoute.GET(request("http://localhost/api/growth/quotation-drafts?project=hero-pumps"));
    const listed = await listedResponse.json();
    const serialized = JSON.stringify({ created, listed });

    expect(createdResponse.status).toBe(200);
    expect(created.data).toMatchObject({
      workspaceId: "hero-pumps",
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      status: "completed",
    });
    expect(created.data.drafts[0]).toMatchObject({
      workspaceId: "hero-pumps",
      prospectingPacketId: prospectingRun.packets[0].id,
      candidate: { companyName: "API Pump Buyer" },
      dryRun: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
    });
    expect(created.data.drafts[0].recommendedProducts.length).toBeGreaterThan(0);
    expect(created.data.drafts[0].quotationDraftLines[0]).toMatchObject({
      unitPrice: 450,
      unitCost: 280,
      currency: "USD",
    });
    expect(listed.data.runs).toHaveLength(1);
    expect(createSalesRuntime().listSideEffects(20)).toHaveLength(beforeSideEffects);

    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("SSA_");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("crm-secret");
    expect(serialized).not.toContain("raw-body");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("formal quote generated");
    expect(serialized).not.toContain("PI generated");
  });
});

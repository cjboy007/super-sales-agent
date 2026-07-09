import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-growth-outbound-approvals-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalCrmFlag === undefined) delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  else process.env.SSA_ENABLE_REAL_CRM_WRITE = originalCrmFlag;

  if (originalDocumentFlag === undefined) delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  else process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = originalDocumentFlag;

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
        id: "PI-API-PHASE10:0:industrial-pump",
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
        piNo: "PI-API-PHASE10",
        date: "2026-05-20",
        incoterms: "FOB",
        source: "test",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ], null, 2),
    "utf-8"
  );
}

async function createPhase9Draft() {
  seedPriceMemory();
  const { createSalesRuntime, runProspectingDryRun, runProductQuotationDraft } = await import("@/lib/runtime");
  const runtime = createSalesRuntime();
  const prospectingRun = runProspectingDryRun(runtime, {
    workspaceId: "hero-pumps",
    idempotencyKey: "hero-pumps:api:phase10:prospecting",
    seeds: [{
      companyName: "API Pump Buyer",
      website: "https://api-pump.example",
      country: "US",
      industry: "industrial pump distribution",
      contactName: "Ari Buyer",
      contactRole: "Procurement",
      contactEmail: "ari@api-pump.example",
      sourceUrl: "https://directory.example/api-pump",
      notes: "Imports replacement pumps.",
    }],
  });
  const draftRun = runProductQuotationDraft(runtime, {
    workspaceId: "hero-pumps",
    prospectingRunId: prospectingRun.id,
    prospectingPacketId: prospectingRun.packets[0].id,
    idempotencyKey: "hero-pumps:api:phase10:draft",
  });
  return { runtime, draftRun, draft: draftRun.drafts[0] };
}

describe("/api/growth/outbound-approvals routes", () => {
  it("returns approval state for explicitly selected workspaces without activation auth", async () => {
    const listRoute = await import("./route");

    const farreach = await listRoute.GET(request("http://localhost/api/growth/outbound-approvals?project=farreach"));
    const farreachJson = await farreach.json();
    const hero = await listRoute.GET(request("http://localhost/api/growth/outbound-approvals?project=hero-pumps"));
    const heroJson = await hero.json();

    expect(farreach.status).toBe(200);
    expect(farreachJson.data.workspaceId).toBe("farreach");
    expect(hero.status).toBe(200);
    expect(heroJson).toMatchObject({
      success: true,
      data: {
        workspaceId: "hero-pumps",
        approvalRequired: true,
        notExecuted: true,
      },
    });
  });

  it("creates and lists sanitized approval requests without executing side effects", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const { runtime, draftRun, draft } = await createPhase9Draft();
    const beforeSideEffects = runtime.listSideEffects(50).length;
    const requestRoute = await import("./request/route");
    const listRoute = await import("./route");

    const createdResponse = await requestRoute.POST(request("http://localhost/api/growth/outbound-approvals/request?project=hero-pumps", {
      method: "POST",
      body: {
        idempotencyKey: "hero-pumps:api:phase10:approval",
        sourceDraftRunId: draftRun.id,
        sourceDraftId: draft.quotationDraft.id,
        intendedActionType: "email_send",
        payload: "raw-body",
        secret: "crm-secret",
        localPath: "/Users/wilson/private/outbound.csv",
        envName: "SSA_ENABLE_REAL_EMAIL_SEND",
      },
    }));
    const created = await createdResponse.json();
    const listedResponse = await listRoute.GET(request("http://localhost/api/growth/outbound-approvals?project=hero-pumps"));
    const listed = await listedResponse.json();
    const serialized = JSON.stringify({ created, listed });
    const sideEffects = createSalesRuntime().listSideEffects(50);

    expect(createdResponse.status).toBe(200);
    expect(created.data).toMatchObject({
      workspaceId: "hero-pumps",
      intendedActionType: "email_send",
      approvalRequired: true,
      notExecuted: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      crmWritten: false,
      status: "completed",
    });
    expect(created.data.candidates[0]).toMatchObject({
      targetCustomer: "API Pump Buyer",
      sideEffectKind: "email.send",
      approvalStatus: "blocked",
      waitingForApproval: true,
      notExecuted: true,
    });
    expect(listed.data.runs).toHaveLength(1);
    expect(sideEffects.length).toBe(beforeSideEffects + 1);
    expect(sideEffects[0]).toMatchObject({
      kind: "email.send",
      status: "blocked",
      realExecutionEnabled: false,
    });
    expect(sideEffects[0].execution).toBeUndefined();

    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("SSA_");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("crm-secret");
    expect(serialized).not.toContain("raw-body");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("email sent");
    expect(serialized).not.toContain("CRM updated");
    expect(serialized).not.toContain("PI generated");
    expect(serialized).not.toContain("formal quote generated");
  });
});

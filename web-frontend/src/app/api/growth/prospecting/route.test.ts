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
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-growth-prospecting-route-test-"));
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

describe("/api/growth/prospecting dry-run routes", () => {
  it("returns prospecting state for explicitly selected workspaces without activation auth", async () => {
    const listRoute = await import("./route");

    const farreach = await listRoute.GET(request("http://localhost/api/growth/prospecting?project=farreach"));
    const farreachJson = await farreach.json();
    const hero = await listRoute.GET(request("http://localhost/api/growth/prospecting?project=hero-pumps"));
    const heroJson = await hero.json();

    expect(farreach.status).toBe(200);
    expect(farreachJson.data.workspaceId).toBe("farreach");
    expect(hero.status).toBe(200);
    expect(heroJson).toMatchObject({
      success: true,
      data: {
        workspaceId: "hero-pumps",
        dryRun: true,
      },
    });
  });

  it("creates and lists sanitized dry-run prospecting packets without executing side effects", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const beforeSideEffects = runtime.listSideEffects(20).length;
    const dryRunRoute = await import("./dry-run/route");
    const listRoute = await import("./route");

    const createdResponse = await dryRunRoute.POST(request("http://localhost/api/growth/prospecting/dry-run?project=hero-pumps", {
      method: "POST",
      body: {
        idempotencyKey: "hero-pumps:api:phase8",
        seeds: [{
          companyName: "API Pump Buyer",
          website: "https://api-pump.example",
          country: "US",
          industry: "industrial pumps",
          contactName: "Ari Buyer",
          sourceUrl: "https://directory.example/api-pump",
          notes: "Imports replacement pumps.",
          payload: "raw-body",
          secret: "crm-secret",
          localPath: "/Users/wilson/private/leads.csv",
          envName: "SSA_ENABLE_REAL_EMAIL_SEND",
        }],
      },
    }));
    const created = await createdResponse.json();
    const listedResponse = await listRoute.GET(request("http://localhost/api/growth/prospecting?project=hero-pumps"));
    const listed = await listedResponse.json();
    const serialized = JSON.stringify({ created, listed });

    expect(createdResponse.status).toBe(200);
    expect(created.data).toMatchObject({
      workspaceId: "hero-pumps",
      dryRun: true,
      draftOnly: true,
      status: "completed",
    });
    expect(created.data.packets[0]).toMatchObject({
      workspaceId: "hero-pumps",
      dryRun: true,
      candidate: { companyName: "API Pump Buyer" },
      openingAngle: { draftOnly: true },
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
  });
});

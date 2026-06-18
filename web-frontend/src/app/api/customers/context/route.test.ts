import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-customer-context-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;

  const leadsDir = path.join(tempRoot, "companies", "new-salesperson", "leads");
  fs.mkdirSync(leadsDir, { recursive: true });
  fs.writeFileSync(
    path.join(leadsDir, "crm-export.csv"),
    [
      "company,contact_name,email,website,country,industry,tier,position,confidence",
      "Local Buyer,Ada,ada@local.example,https://local.example,USA,HVAC,Tier1 Buyer,Owner,92%",
    ].join("\n"),
    "utf-8"
  );
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("/api/customers/context route", () => {
  it("returns customer 360 context from Sales Memory for a local workspace", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    createSalesRuntime().memory.writeMemory({
      workspaceId: "new-salesperson",
      customerId: "ada@local.example",
      customerName: "Local Buyer",
      kind: "episode",
      title: "Lead import",
      body: `Loaded 1 lead rows from ${tempRoot}/companies/new-salesperson/leads/crm-export.csv.`,
      source: { type: "system", label: "Lead Import" },
      authority: "imported",
      confidence: 0.9,
      metadata: {},
    });
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/customers/context?project=new-salesperson&query=Local%20Buyer"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      query: "Local Buyer",
      customer: {
        name: "Local Buyer",
        email: "ada@local.example",
        stage: "qualified",
        score: 90,
      },
      negotiation: {
        recommendedNextStep: expect.any(String),
      },
    });
    expect(json.data.leads).toHaveLength(1);
    expect(JSON.stringify(json.data)).not.toContain("workspaceId");
    expect(JSON.stringify(json.data)).not.toContain("provider");
    expect(JSON.stringify(json.data)).not.toContain("retrieval");
    expect(JSON.stringify(json.data)).not.toContain("customerId");
    expect(JSON.stringify(json.data)).not.toContain(tempRoot);
    expect(JSON.stringify(json.data)).not.toContain("/Users/");
    expect(json.data).not.toHaveProperty("memory");
    expect(json.data.memorySummary).toMatchObject({
      summary: expect.any(String),
      openRisks: expect.any(Array),
      recommendedNextSteps: expect.any(Array),
      recentRecords: expect.any(Array),
      updatedAt: expect.any(String),
    });
  });
});

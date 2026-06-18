import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-approvals-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, init?: { method?: string; body?: BodyInit | null }): NextRequest {
  return new NextRequest(url, init);
}

describe("/api/approvals route", () => {
  it("serves local starter approvals for Farreach", async () => {
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/approvals?project=farreach"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.map((approval: { id: string }) => approval.id)).toContain("amphenol-counter");
    expect(json.data[0]).toMatchObject({
      status: "pending",
      dealId: expect.any(String),
    });
    const serialized = JSON.stringify(json.data);
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("deal_id");
    expect(serialized).not.toContain("metadata");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
  });

  it("upserts and updates approvals through Sales Memory with audit events", async () => {
    const { GET, POST, PATCH } = await import("./route");

    const createdResponse = await POST(request("http://localhost/api/approvals?project=demo-exporter", {
      method: "POST",
      body: JSON.stringify({
        id: "demo-approval",
        dealId: "demo-deal",
        account: "Demo Buyer",
        title: "Approve sample quotation",
        value: "$12K",
        risk: "Low",
        due: "Today",
        recommendation: "Approve after checking margin.",
        guardrail: "No external send.",
      }),
    }));
    const created = await createdResponse.json();

    expect(created.success).toBe(true);
    expect(created.data).toMatchObject({
      id: "demo-approval",
      dealId: "demo-deal",
      status: "pending",
    });
    expect(JSON.stringify(created.data)).not.toContain("workspaceId");
    expect(JSON.stringify(created.data)).not.toContain("deal_id");
    expect(JSON.stringify(created.data)).not.toContain("metadata");

    const patchedResponse = await PATCH(request("http://localhost/api/approvals?project=demo-exporter", {
      method: "PATCH",
      body: JSON.stringify({
        id: "demo-approval",
        status: "approved",
        decisionBy: "Wilson",
        decisionNote: "Approved locally",
      }),
    }));
    const patched = await patchedResponse.json();

    expect(patched.success).toBe(true);
    expect(patched.data).toMatchObject({
      status: "approved",
      decisionBy: "Wilson",
      decisionNote: "Approved locally",
    });

    const lookupResponse = await GET(request("http://localhost/api/approvals?project=demo-exporter&id=demo-approval"));
    const lookup = await lookupResponse.json();
    expect(lookup.data).toHaveLength(1);
    expect(lookup.data[0].status).toBe("approved");

    const events = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "events", "events.json"), "utf-8"));
    expect(events[0]).toMatchObject({
      type: "approval.updated",
      workspaceId: "demo-exporter",
      payload: {
        approvalId: "demo-approval",
        status: "approved",
        sideEffects: "blocked",
      },
    });
  });
});

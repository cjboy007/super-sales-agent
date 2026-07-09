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
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-growth-control-test-"));
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

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("/api/growth/control-center route", () => {
  it("returns control-center data for explicitly selected workspaces without activation auth", async () => {
    const { GET } = await import("./route");

    const farreach = await GET(request("http://localhost/api/growth/control-center?project=farreach"));
    const farreachJson = await farreach.json();
    const hero = await GET(request("http://localhost/api/growth/control-center?project=hero-pumps"));
    const heroJson = await hero.json();

    expect(farreach.status).toBe(200);
    expect(farreachJson.data.workspaceId).toBe("farreach");
    expect(hero.status).toBe(200);
    expect(heroJson.success).toBe(true);
    expect(heroJson.data.workspaceId).toBe("hero-pumps");
  });

  it("returns sanitized control-center data without executing side effects", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "hero-pumps",
      summary: "Send launch email",
      payload: {
        to: "buyer@example.com",
        payload: "raw-body",
        secret: "crm-secret",
        localPath: "/Users/wilson/private/lead.csv",
        envName: "SSA_ENABLE_REAL_EMAIL_SEND",
      },
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/growth/control-center?project=hero-pumps"));
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      workspaceId: "hero-pumps",
      automationMode: "assist",
      readiness: {
        autopilotReady: false,
      },
      reviewQueue: {
        blocked: 1,
      },
    });
    expect(json.data.policyMatrix).toEqual(expect.any(Array));
    expect(json.data.policyMatrix).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionKind: "payment.bank", decision: "blocked" }),
      expect.objectContaining({ actionKind: "email.send", decision: "review" }),
    ]));
    expect(json.data.prospectingPreview.steps.map((step: { id: string }) => step.id)).toEqual([
      "discover-leads",
      "enrich-company",
      "score-icp-fit",
      "generate-opening-angle",
      "draft-personalized-email",
      "draft-landing-page",
      "draft-video-script",
      "request-outbound-approval",
    ]);
    expect(json.data.decisionLearning.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "approve_once" }),
      expect.objectContaining({ action: "edit_then_approve" }),
      expect.objectContaining({ action: "reject" }),
      expect.objectContaining({ action: "update_policy" }),
    ]));

    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("SSA_");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("crm-secret");
    expect(serialized).not.toContain("raw-body");
  });
});

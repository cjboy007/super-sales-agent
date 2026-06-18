import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalTrialEnabled = process.env.SSA_TRIAL_ACCESS_ENABLED;
const originalTrialSmsProvider = process.env.SSA_TRIAL_SMS_PROVIDER;
const originalTrialHeavyLimit = process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-assistant-query-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
  delete process.env.SSA_TRIAL_ACCESS_ENABLED;
  delete process.env.SSA_TRIAL_SMS_PROVIDER;
  delete process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalTrialEnabled === undefined) delete process.env.SSA_TRIAL_ACCESS_ENABLED;
  else process.env.SSA_TRIAL_ACCESS_ENABLED = originalTrialEnabled;

  if (originalTrialSmsProvider === undefined) delete process.env.SSA_TRIAL_SMS_PROVIDER;
  else process.env.SSA_TRIAL_SMS_PROVIDER = originalTrialSmsProvider;

  if (originalTrialHeavyLimit === undefined) delete process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT;
  else process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT = originalTrialHeavyLimit;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, body: Record<string, unknown>, cookie?: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createTrialCookie(): Promise<string> {
  process.env.SSA_TRIAL_ACCESS_ENABLED = "true";
  process.env.SSA_TRIAL_SMS_PROVIDER = "mock";
  const { requestTrialSmsCode, verifyTrialSmsCode } = await import("@/lib/runtime/trial-auth");
  await requestTrialSmsCode({ phone: "13680342402", ip: "203.0.113.10" });
  const store = JSON.parse(fs.readFileSync(path.join(tempRoot, "security", "trial-access.json"), "utf-8"));
  const verified = await verifyTrialSmsCode({ phone: "13680342402", code: store.challenges[0].mockCode, ip: "203.0.113.10" });
  if (!verified.ok) throw new Error("trial setup failed");
  return `ssa-trial-session=${verified.sessionToken}`;
}

describe("/api/assistant/query route", () => {
  it("answers ordinary questions through the local-first assistant router", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    createSalesRuntime().writeMemory({
      workspaceId: "demo-exporter",
      customerName: "Route Buyer",
      title: "Route Buyer sample preference",
      body: "Route Buyer wants sample packs shipped by DHL before any bulk quote.",
      tags: ["sample", "preference"],
      source: { type: "operator" },
      authority: "authoritative",
      confidence: 0.95,
    });
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/assistant/query?project=demo-exporter", {
      question: "What does Route Buyer want before a bulk quote?",
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      routing: {
        localFirst: true,
        usedLocal: true,
        usedWeb: false,
      },
      evidence: {
        local: [
          expect.objectContaining({
            sourceKind: "memory",
            title: "Route Buyer sample preference",
          }),
        ],
        web: [],
      },
    });
    expect(json.data.answer).toContain("Route Buyer");
    expect(JSON.stringify(json.data)).not.toContain("workspaceId");
  });

  it("rejects empty assistant questions", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/assistant/query?project=demo-exporter", {
      question: "   ",
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Question is required");
  });

  it("limits assistant questions for trial users before running heavy work", async () => {
    process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT = "1";
    const cookie = await createTrialCookie();
    const { POST } = await import("./route");

    const first = await POST(request("http://localhost/api/assistant/query?project=farreach", {
      question: "Summarize this account.",
    }, cookie));
    const second = await POST(request("http://localhost/api/assistant/query?project=farreach", {
      question: "Summarize this account again.",
    }, cookie));
    const secondJson = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(secondJson).toMatchObject({
      success: false,
      reason: "quota_exceeded",
      contactPhone: "13680342402",
    });
  });
});

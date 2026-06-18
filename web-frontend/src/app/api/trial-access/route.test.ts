import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  dataRoot: process.env.SSA_DATA_ROOT,
  enabled: process.env.SSA_TRIAL_ACCESS_ENABLED,
  smsProvider: process.env.SSA_TRIAL_SMS_PROVIDER,
  trialDays: process.env.SSA_TRIAL_DAYS,
  contactPhone: process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE,
};

let tempRoot = "";

function post(url: string, body: Record<string, unknown>, ip = "203.0.113.10"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify(body),
  });
}

function storedCode(): string {
  const store = JSON.parse(fs.readFileSync(path.join(tempRoot, "security", "trial-access.json"), "utf-8"));
  return store.challenges[0].mockCode;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-16T00:00:00.000Z"));
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-trial-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_TRIAL_ACCESS_ENABLED = "true";
  process.env.SSA_TRIAL_SMS_PROVIDER = "mock";
  process.env.SSA_TRIAL_DAYS = "14";
  process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE = "1xxxxxxxxxx";
});

afterEach(() => {
  vi.useRealTimers();
  if (originalEnv.dataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalEnv.dataRoot;
  if (originalEnv.enabled === undefined) delete process.env.SSA_TRIAL_ACCESS_ENABLED;
  else process.env.SSA_TRIAL_ACCESS_ENABLED = originalEnv.enabled;
  if (originalEnv.smsProvider === undefined) delete process.env.SSA_TRIAL_SMS_PROVIDER;
  else process.env.SSA_TRIAL_SMS_PROVIDER = originalEnv.smsProvider;
  if (originalEnv.trialDays === undefined) delete process.env.SSA_TRIAL_DAYS;
  else process.env.SSA_TRIAL_DAYS = originalEnv.trialDays;
  if (originalEnv.contactPhone === undefined) delete process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE;
  else process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE = originalEnv.contactPhone;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/trial-access", () => {
  it("sends a phone code without leaking it in the response", async () => {
    const { POST } = await import("./send-code/route");

    const response = await POST(post("http://localhost/api/trial-access/send-code", { phone: "1xxxxxxxxxx" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      data: {
        phone: "1xxxxxxxxxx",
        expiresInSeconds: 300,
      },
    });
    expect(JSON.stringify(json)).not.toContain(storedCode());
  });

  it("verifies a phone code and sets a trial session cookie for 14 days", async () => {
    const sendRoute = await import("./send-code/route");
    const verifyRoute = await import("./verify-code/route");

    await sendRoute.POST(post("http://localhost/api/trial-access/send-code", { phone: "1xxxxxxxxxx" }));
    const response = await verifyRoute.POST(post("http://localhost/api/trial-access/verify-code", {
      phone: "1xxxxxxxxxx",
      code: storedCode(),
    }));
    const json = await response.json();
    const cookie = response.headers.get("set-cookie") || "";

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        access: "granted",
        phone: "136****2402",
        trialExpiresAt: "2026-06-30T00:00:00.000Z",
        contactPhone: "1xxxxxxxxxx",
        workspaces: ["farreach"],
        defaultWorkspace: "farreach",
      },
    });
    expect(cookie).toContain("ssa-trial-session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Max-Age=1209600");
  });
});

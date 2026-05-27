import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalBridgeFlag = process.env.SSA_ENABLE_FARREACH_BRIDGE;
const originalFarreachUrl = process.env.SSA_FARREACH_URL;

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-inbox-reply-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
  delete process.env.SSA_ENABLE_FARREACH_BRIDGE;
  delete process.env.SSA_FARREACH_URL;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalBridgeFlag === undefined) delete process.env.SSA_ENABLE_FARREACH_BRIDGE;
  else process.env.SSA_ENABLE_FARREACH_BRIDGE = originalBridgeFlag;

  if (originalFarreachUrl === undefined) delete process.env.SSA_FARREACH_URL;
  else process.env.SSA_FARREACH_URL = originalFarreachUrl;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/inbox/[emailId]/reply route", () => {
  it("drafts through the runtime LLM mock fallback when the Farreach bridge is disabled", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/email-001/reply?project=farreach", {
      language: "en",
    }), { params: { emailId: "email-001" } });
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      source: "mock",
      provider: "mock",
      full_email: {
        subject: "Re: Quotation for DisplayPort & USB-C Cables — Price Revision Request",
        attachments: [],
      },
    });
    expect(json.full_email.body).toContain("Dear Hans");
    expect(json.full_email.body).toContain("Best regards");
    expect(json.full_email.body).toContain("Farreach Electronic");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a local draft for a new workspace without code changes", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/new-message/reply?project=demo-exporter", {
      from: "Ada Buyer",
      subject: "RFQ for pumps",
      body: "Can you quote 100 pumps?",
      language: "en",
    }), { params: { emailId: "new-message" } });
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      source: "mock",
      full_email: {
        subject: "Re: RFQ for pumps",
      },
    });
    expect(json.full_email.body).toContain("Dear Ada");
    expect(json.full_email.body).toContain("Can you quote 100 pumps?");
  });

  it("keeps bridge response compatibility when the Farreach reply bridge is enabled", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        full_email: {
          subject: "Re: Bridge subject",
          body: "Bridge draft",
          attachments: [],
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/email-001/reply?project=farreach", {
      from: "Hans Müller",
      subject: "Bridge subject",
      body: "Bridge body",
    }), { params: { emailId: "email-001" } });
    const json = await response.json();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("http://farreach.test/api/v1/inbox/email-001/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: "email-001",
        from: "Hans Müller",
        subject: "Bridge subject",
        body: "Bridge body",
        language: "en",
      }),
    });
    expect(json).toEqual({
      success: true,
      full_email: {
        subject: "Re: Bridge subject",
        body: "Bridge draft",
        attachments: [],
      },
    });
  });
});

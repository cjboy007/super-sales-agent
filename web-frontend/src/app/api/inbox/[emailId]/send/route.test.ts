import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalBridgeFlag = process.env.SSA_ENABLE_FARREACH_BRIDGE;
const originalFarreachUrl = process.env.SSA_FARREACH_URL;

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-inbox-send-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_FARREACH_BRIDGE;
  delete process.env.SSA_FARREACH_URL;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalBridgeFlag === undefined) delete process.env.SSA_ENABLE_FARREACH_BRIDGE;
  else process.env.SSA_ENABLE_FARREACH_BRIDGE = originalBridgeFlag;

  if (originalFarreachUrl === undefined) delete process.env.SSA_FARREACH_URL;
  else process.env.SSA_FARREACH_URL = originalFarreachUrl;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/inbox/[emailId]/send route", () => {
  it("audits and blocks inbox sends by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-1/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Quote follow-up",
      body: "Following up on the quote.",
    }), { params: { emailId: "msg-1" } });
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      email_id: "msg-1",
      to: "buyer@example.com",
      subject: "Quote follow-up",
      blocked: true,
      sideEffect: {
        kind: "email.send",
        workspaceId: "farreach",
        status: "blocked",
        realExecutionEnabled: false,
      },
    });
    expect(json.message).toContain("SSA_ENABLE_REAL_EMAIL_SEND=true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the Farreach bridge when bridge is enabled but the runtime gate blocks send", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-2/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Approval needed",
      body: "Draft reply.",
    }), { params: { emailId: "msg-2" } });
    const json = await response.json();

    expect(json.blocked).toBe(true);
    expect(json.sideEffect.status).toBe("blocked");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the Farreach bridge only when the bridge and real email side effects are enabled", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sentAt: "2026-05-26T00:00:00.000Z", detail: "sent by bridge" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-3/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Approved reply",
      body: "Approved content.",
      html: true,
    }), { params: { emailId: "msg-3" } });
    const json = await response.json();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("http://farreach.test/api/v1/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "buyer@example.com",
        subject: "Approved reply",
        body: "Approved content.",
        html: true,
      }),
    });
    expect(json).toMatchObject({
      success: true,
      email_id: "msg-3",
      sent_at: "2026-05-26T00:00:00.000Z",
      message: "sent by bridge",
      sideEffect: {
        kind: "email.send",
        workspaceId: "farreach",
        status: "allowed",
        realExecutionEnabled: true,
      },
    });
  });
});

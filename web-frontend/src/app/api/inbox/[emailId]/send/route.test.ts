import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalAllowUnverified = process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND;
const originalBridgeFlag = process.env.SSA_ENABLE_FARREACH_BRIDGE;
const originalFarreachUrl = process.env.SSA_FARREACH_URL;

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-inbox-send-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND;
  delete process.env.SSA_ENABLE_FARREACH_BRIDGE;
  delete process.env.SSA_FARREACH_URL;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalAllowUnverified === undefined) delete process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND;
  else process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = originalAllowUnverified;

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

function expectNoInternalActionFields(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("sideEffect");
  expect(serialized).not.toContain("workspaceId");
  expect(serialized).not.toContain("realExecutionEnabled");
  expect(serialized).not.toContain("payload");
  expect(serialized).not.toContain("idempotencyKey");
  expect(serialized).not.toContain("/Users/");
  expect(serialized).not.toContain(".ssa");
}

async function approvedInboxDecision(input: { emailId: string; to: string; subject: string; html?: boolean }) {
  const { createSalesRuntime } = await import("@/lib/runtime");
  const runtime = createSalesRuntime();
  const decision = runtime.requestSideEffect({
    kind: "email.send",
    workspaceId: "farreach",
    summary: `Send inbox reply to ${input.to}: ${input.subject}`,
    payload: {
      emailId: input.emailId,
      to: input.to,
      subject: input.subject,
      html: Boolean(input.html),
      source: "inbox.send",
    },
    idempotencyKey: `farreach:inbox:${input.emailId}:send`,
  });
  return runtime.approveSideEffect(decision.id, {
    by: "Wilson",
    note: "Approved inbox reply for bridge send.",
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
    }), { params: Promise.resolve({ emailId: "msg-1" }) });
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      email_id: "msg-1",
      to: "buyer@example.com",
      subject: "Quote follow-up",
      blocked: true,
      action: {
        title: "Customer email send",
        status: "blocked",
        blocked: true,
      },
    });
    expectNoInternalActionFields(json);
    expect(json.message).toContain("explicit approval");
    expect(json.message).not.toContain("SSA_ENABLE_REAL_EMAIL_SEND");
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
    }), { params: Promise.resolve({ emailId: "msg-2" }) });
    const json = await response.json();

    expect(json.blocked).toBe(true);
    expect(json.action.status).toBe("blocked");
    expectNoInternalActionFields(json);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the Farreach bridge only when the bridge is enabled and the side-effect decision is approved", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sentAt: "2026-05-26T00:00:00.000Z", detail: "sent by bridge" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const decision = await approvedInboxDecision({
      emailId: "msg-3",
      to: "buyer@example.com",
      subject: "Approved reply",
      html: true,
    });
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-3/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Approved reply",
      body: "Approved content.",
      html: true,
      decisionId: decision.id,
    }), { params: Promise.resolve({ emailId: "msg-3" }) });
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
      action: {
        actionId: decision.id,
        status: "executed",
        blocked: false,
      },
    });
    expectNoInternalActionFields(json);
    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "executed",
      execution: expect.objectContaining({
        status: "executed",
        result: expect.objectContaining({
          to: "buyer@example.com",
          subject: "Approved reply",
        }),
      }),
    });
  });

  it("records Farreach bridge send failures on the approval record", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("bridge unavailable"));
    const decision = await approvedInboxDecision({
      emailId: "msg-bridge-fail",
      to: "buyer@example.com",
      subject: "Bridge fail reply",
    });
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-bridge-fail/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Bridge fail reply",
      body: "Approved content.",
      decisionId: decision.id,
    }), { params: Promise.resolve({ emailId: "msg-bridge-fail" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      blocked: true,
      message: "Email captured locally. Real send bridge is unavailable.",
    });

    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "execution_failed",
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
        error: expect.stringContaining("bridge unavailable"),
      }),
    });
  });

  it("reuses an approved retryable failure decision for a later inbox bridge retry", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    const decision = await approvedInboxDecision({
      emailId: "msg-retry",
      to: "buyer@example.com",
      subject: "Retry bridge reply",
    });
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    runtime.recordSideEffectFailed(decision.id, {
      error: "Bridge temporarily unavailable",
      canRetry: true,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sentAt: "2026-05-26T00:00:00.000Z", detail: "retry sent by bridge" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-retry/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Retry bridge reply",
      body: "Approved content.",
      decisionId: decision.id,
    }), { params: Promise.resolve({ emailId: "msg-retry" }) });
    const json = await response.json();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(json).toMatchObject({
      success: true,
      email_id: "msg-retry",
      sent_at: "2026-05-26T00:00:00.000Z",
      message: "retry sent by bridge",
      action: {
        actionId: decision.id,
        status: "executed",
        blocked: false,
      },
    });

    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "executed",
      execution: expect.objectContaining({
        status: "executed",
        result: expect.objectContaining({
          to: "buyer@example.com",
          subject: "Retry bridge reply",
        }),
      }),
    });
  });

  it("records non-2xx Farreach bridge responses on the approval record for retry review", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "SMTP relay rejected recipient", detail: "internal provider trace" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );
    const decision = await approvedInboxDecision({
      emailId: "msg-bridge-http-fail",
      to: "buyer@example.com",
      subject: "Bridge HTTP fail reply",
    });
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-bridge-http-fail/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Bridge HTTP fail reply",
      body: "Approved content.",
      decisionId: decision.id,
    }), { params: Promise.resolve({ emailId: "msg-bridge-http-fail" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      blocked: true,
      message: "Email captured locally. Real send bridge is unavailable.",
    });
    expectNoInternalActionFields(json);
    expect(JSON.stringify(json)).not.toContain("farreach.test");
    expect(JSON.stringify(json)).not.toContain("SMTP relay rejected recipient");
    expect(JSON.stringify(json)).not.toContain("internal provider trace");

    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "execution_failed",
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
        error: expect.stringContaining("Email bridge returned 502"),
      }),
    });
  });

  it("records a retryable failure when the bridge send succeeds but final approval recording fails", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sentAt: "2026-05-26T00:00:00.000Z", detail: "sent by bridge" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const decision = await approvedInboxDecision({
      emailId: "msg-late-recording-fail",
      to: "buyer@example.com",
      subject: "Late recording fail",
    });
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    vi.spyOn(runtime, "recordSideEffectExecuted").mockImplementation(() => {
      throw new Error("approval store unavailable");
    });

    await expect(runtime.sendInboxReply({
      workspaceId: "farreach",
      emailId: "msg-late-recording-fail",
      to: "buyer@example.com",
      subject: "Late recording fail",
      body: "Approved content.",
      decisionId: decision.id,
    })).rejects.toThrow("approval store unavailable");

    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "execution_failed",
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
        error: expect.stringContaining("approval store unavailable"),
      }),
    });
  });

  it("uses the current real-send flag for approved inbox decisions that were requested while safe mode was on", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sentAt: "2026-05-26T00:00:00.000Z", detail: "sent after flag enabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const decision = await approvedInboxDecision({
      emailId: "msg-late-flag",
      to: "buyer@example.com",
      subject: "Late enabled reply",
    });

    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/inbox/msg-late-flag/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Late enabled reply",
      body: "Approved content.",
      decisionId: decision.id,
    }), { params: Promise.resolve({ emailId: "msg-late-flag" }) });
    const json = await response.json();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(json).toMatchObject({
      success: true,
      sent_at: "2026-05-26T00:00:00.000Z",
      message: "sent after flag enabled",
      action: {
        actionId: decision.id,
        status: "executed",
      },
    });
    expectNoInternalActionFields(json);
  });

  it("does not call the Farreach bridge when an approved side-effect record is missing", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-approval/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Approval missing",
      body: "Draft content.",
      humanApproval: {
        approved: true,
        approvedBy: "Forged browser payload",
      },
    }), { params: Promise.resolve({ emailId: "msg-approval" }) });
    const json = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(json).toMatchObject({
      success: true,
      blocked: true,
      message: "Email blocked: approved side-effect decision is required before real customer send.",
    });

    const requests = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "mail", "send-requests.json"), "utf-8"));
    expect(requests[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Approval missing",
      status: "blocked_missing_approval_record",
    });
  });

  it("does not call the Farreach bridge when recipient verification is missing", async () => {
    process.env.SSA_ENABLE_FARREACH_BRIDGE = "true";
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_FARREACH_URL = "http://farreach.test";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const decision = await approvedInboxDecision({
      emailId: "msg-4",
      to: "buyer@example.com",
      subject: "Approved reply",
    });
    const { POST } = await import("./route");

    const response = await POST(request("http://localhost/api/inbox/msg-4/send?project=farreach", {
      to: "buyer@example.com",
      subject: "Approved reply",
      body: "Approved content.",
      decisionId: decision.id,
    }), { params: Promise.resolve({ emailId: "msg-4" }) });
    const json = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(json).toMatchObject({
      success: true,
      blocked: true,
      verification: {
        email: "buyer@example.com",
        status: "unknown",
      },
      message: "Email blocked: recipient verification is unknown. Configure Hunter verification or approve an explicit unverified-send override.",
    });

    const requests = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "mail", "send-requests.json"), "utf-8"));
    expect(requests[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Approved reply",
      status: "blocked_verification_unknown",
    });

    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "execution_failed",
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
        error: expect.stringContaining("recipient verification is unknown"),
      }),
    });
  });
});

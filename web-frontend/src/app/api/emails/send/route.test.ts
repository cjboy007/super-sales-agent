import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalAllowUnverified = process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND;
let tempRoot = "";

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/emails/send?project=demo-exporter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  execFileMock.mockReset();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-email-send-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalAllowUnverified === undefined) delete process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND;
  else process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = originalAllowUnverified;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/emails/send route", () => {
  it("captures send requests locally and blocks SMTP by default", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Quote follow-up",
      body: "Hello",
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      blocked: true,
      detail: "Email captured locally. Real SMTP send is disabled for this runtime.",
      sideEffect: {
        kind: "email.send",
        workspaceId: "demo-exporter",
        status: "blocked",
        realExecutionEnabled: false,
      },
    });
    expect(execFileMock).not.toHaveBeenCalled();

    const requests = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "mail", "send-requests.json"), "utf-8"));
    expect(requests[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Quote follow-up",
      status: "blocked_local_preview",
    });
  });

  it("runs SMTP only when email side effects are explicitly enabled", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "Message-ID: <msg-123>", "");
      }
    );

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Approved quote",
      body: "Approved body",
      humanApproval: {
        approved: true,
        approvedBy: "Wilson",
      },
    }));
    const json = await response.json();

    expect(json).toEqual({
      success: true,
      messageId: "msg-123",
      detail: "Email sent successfully",
    });
    expect(execFileMock).toHaveBeenCalledOnce();
    expect(execFileMock.mock.calls[0][1]).toEqual(expect.arrayContaining([
      "send",
      "--confirm-send",
      "--approval-id",
      expect.stringMatching(/^ssa-local-/),
    ]));
    expect(execFileMock.mock.calls[0][2]).toMatchObject({
      env: expect.objectContaining({
        SSA_RUNTIME_APPROVAL_ID: expect.stringMatching(/^ssa-local-/),
        SSA_RUNTIME_APPROVED_TO: "buyer@example.com",
        SSA_RUNTIME_APPROVED_SUBJECT: "Approved quote",
        SSA_RUNTIME_VERIFICATION_STATUS: "unknown",
        SSA_RUNTIME_VERIFICATION_PROVIDER: "hunter",
      }),
    });

    const sent = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "mail", "sent-log.json"), "utf-8"));
    expect(sent[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Approved quote",
    });
  });

  it("runs SMTP with cached valid verification and passes verification context to the SMTP CLI", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    const verificationDir = path.join(tempRoot, "companies", "demo-exporter", "verification");
    fs.mkdirSync(verificationDir, { recursive: true });
    fs.writeFileSync(path.join(verificationDir, "email-verifications.json"), JSON.stringify({
      "buyer@example.com": {
        email: "buyer@example.com",
        provider: "hunter",
        status: "valid",
        score: 97,
        checkedAt: "2026-05-30T00:00:00.000Z",
      },
    }), "utf-8");
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "Message-ID: <msg-valid>", "");
      }
    );

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Verified quote",
      body: "Approved body",
      humanApproval: {
        approved: true,
        approvedBy: "Wilson",
      },
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      messageId: "msg-valid",
      detail: "Email sent successfully",
    });
    expect(execFileMock.mock.calls[0][2]).toMatchObject({
      env: expect.objectContaining({
        SSA_RUNTIME_VERIFICATION_STATUS: "valid",
        SSA_RUNTIME_VERIFICATION_SCORE: "97",
      }),
    });
  });

  it("blocks real SMTP when human approval is missing even if real sends are enabled", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Needs approval",
      body: "Approved body",
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      blocked: true,
      detail: "Email blocked: human approval is required before real customer send.",
    });
    expect(execFileMock).not.toHaveBeenCalled();

    const requests = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "mail", "send-requests.json"), "utf-8"));
    expect(requests[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Needs approval",
      status: "blocked_missing_approval",
    });
  });

  it("blocks real SMTP when verification is missing even if email side effects are enabled", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Approved quote",
      body: "Approved body",
      humanApproval: {
        approved: true,
        approvedBy: "Wilson",
      },
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      blocked: true,
      detail: "Email blocked: recipient verification is unknown. Configure Hunter verification or approve an explicit unverified-send override.",
      verification: {
        email: "buyer@example.com",
        status: "unknown",
      },
    });
    expect(execFileMock).not.toHaveBeenCalled();

    const requests = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "mail", "send-requests.json"), "utf-8"));
    expect(requests[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Approved quote",
      status: "blocked_verification_unknown",
    });
  });
});

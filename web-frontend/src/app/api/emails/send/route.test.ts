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

async function approvedEmailDecision(input: { to: string; subject: string; html?: boolean }) {
  const { createSalesRuntime } = await import("@/lib/runtime");
  const runtime = createSalesRuntime();
  const decision = runtime.requestSideEffect({
    kind: "email.send",
    workspaceId: "demo-exporter",
    summary: `Send email to ${input.to}: ${input.subject}`,
    payload: {
      to: input.to,
      subject: input.subject,
      html: Boolean(input.html),
    },
    idempotencyKey: `demo-exporter:email:${input.to}:${input.subject}`,
  });
  return runtime.approveSideEffect(decision.id, {
    by: "Wilson",
    note: "Approved for real SMTP test.",
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
      action: {
        title: "Customer email send",
        status: "blocked",
        blocked: true,
      },
    });
    expectNoInternalActionFields(json);
    expect(execFileMock).not.toHaveBeenCalled();

    const requests = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "mail", "send-requests.json"), "utf-8"));
    expect(requests[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Quote follow-up",
      status: "blocked_local_preview",
    });
  });

  it("runs SMTP only when email side effects are explicitly enabled and a side-effect decision is approved", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "Message-ID: <msg-123>", "");
      }
    );
    const decision = await approvedEmailDecision({
      to: "buyer@example.com",
      subject: "Approved quote",
    });

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Approved quote",
      body: "Approved body",
      decisionId: decision.id,
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      messageId: "msg-123",
      detail: "Email sent successfully",
      action: {
        actionId: decision.id,
        status: "executed",
        blocked: false,
      },
    });
    expectNoInternalActionFields(json);
    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "executed",
      execution: expect.objectContaining({
        status: "executed",
        result: expect.objectContaining({
          messageId: "msg-123",
          to: "buyer@example.com",
          subject: "Approved quote",
        }),
      }),
    });
    expect(execFileMock).toHaveBeenCalledOnce();
    expect(execFileMock.mock.calls[0][1]).toEqual(expect.arrayContaining([
      "send",
      "--confirm-send",
      "--approval-id",
      decision.id,
    ]));
    expect(execFileMock.mock.calls[0][2]).toMatchObject({
      env: expect.objectContaining({
        SSA_RUNTIME_APPROVAL_ID: decision.id,
        SSA_RUNTIME_APPROVED_TO: "buyer@example.com",
        SSA_RUNTIME_APPROVED_SUBJECT: "Approved quote",
        SSA_RUNTIME_APPROVED_BY: "Wilson",
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

  it("records SMTP execution failures on the approval record for retry review", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error("SMTP rejected recipient"), "", "550 rejected");
      }
    );
    const decision = await approvedEmailDecision({
      to: "buyer@example.com",
      subject: "Failing send",
    });

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Failing send",
      body: "Approved body",
      decisionId: decision.id,
    }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toContain("SMTP rejected recipient");

    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "execution_failed",
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
        error: expect.stringContaining("SMTP rejected recipient"),
      }),
    });
  });

  it("reuses an approved retryable failure decision for a later SMTP retry", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    const decision = await approvedEmailDecision({
      to: "buyer@example.com",
      subject: "Retry send",
    });
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    runtime.recordSideEffectFailed(decision.id, {
      error: "SMTP temporarily unavailable",
      canRetry: true,
    });
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "Message-ID: <msg-retry>", "");
      }
    );

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Retry send",
      body: "Approved body",
      decisionId: decision.id,
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      messageId: "msg-retry",
      action: {
        actionId: decision.id,
        status: "executed",
        blocked: false,
      },
    });
    expect(execFileMock).toHaveBeenCalledOnce();

    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "executed",
      execution: expect.objectContaining({
        status: "executed",
        result: expect.objectContaining({
          messageId: "msg-retry",
        }),
      }),
    });
  });

  it("rolls back the sent-log if recording the final approved send result fails", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "Message-ID: <msg-rollback>", "");
      }
    );
    const decision = await approvedEmailDecision({
      to: "buyer@example.com",
      subject: "Rollback send log",
    });
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    vi.spyOn(runtime, "recordSideEffectExecuted").mockImplementation(() => {
      throw new Error("approval store unavailable");
    });

    await expect(runtime.sendEmail({
      workspaceId: "demo-exporter",
      to: "buyer@example.com",
      subject: "Rollback send log",
      body: "Approved body",
      decisionId: decision.id,
    })).rejects.toThrow("approval store unavailable");

    expect(fs.existsSync(path.join(tempRoot, "companies", "demo-exporter", "mail", "sent-log.json"))).toBe(false);
    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "approvals", "side-effect-decisions.json"), "utf-8"));
    expect(decisions[0]).toMatchObject({
      id: decision.id,
      status: "execution_failed",
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
      }),
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
    const decision = await approvedEmailDecision({
      to: "buyer@example.com",
      subject: "Verified quote",
    });

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Verified quote",
      body: "Approved body",
      decisionId: decision.id,
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

  it("uses the current real-send flag for approved decisions that were requested while safe mode was on", async () => {
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "Message-ID: <msg-late-flag>", "");
      }
    );
    const decision = await approvedEmailDecision({
      to: "buyer@example.com",
      subject: "Late enabled send",
    });

    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Late enabled send",
      body: "Approved body",
      decisionId: decision.id,
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      messageId: "msg-late-flag",
      detail: "Email sent successfully",
      action: {
        actionId: decision.id,
        status: "executed",
      },
    });
    expectNoInternalActionFields(json);
    expect(execFileMock).toHaveBeenCalledOnce();
  });

  it("blocks real SMTP when a side-effect approval record is missing even if the request claims human approval", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = "true";

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Needs approval",
      body: "Approved body",
      humanApproval: {
        approved: true,
        approvedBy: "Forged browser payload",
      },
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      blocked: true,
      detail: "Email blocked: approved side-effect decision is required before real customer send.",
    });
    expect(execFileMock).not.toHaveBeenCalled();

    const requests = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "mail", "send-requests.json"), "utf-8"));
    expect(requests[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Needs approval",
      status: "blocked_missing_approval_record",
    });
  });

  it("blocks real SMTP when verification is missing even if email side effects are enabled", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    const decision = await approvedEmailDecision({
      to: "buyer@example.com",
      subject: "Approved quote",
    });

    const { POST } = await import("./route");
    const response = await POST(request({
      to: "buyer@example.com",
      subject: "Approved quote",
      body: "Approved body",
      decisionId: decision.id,
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

    const decisions = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "approvals", "side-effect-decisions.json"), "utf-8"));
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

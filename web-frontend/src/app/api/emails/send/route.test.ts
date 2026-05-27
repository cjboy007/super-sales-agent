import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();

vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
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
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

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

    const requests = JSON.parse(fs.readFileSync(path.join(tempRoot, "mail", "send-requests.json"), "utf-8"));
    expect(requests[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Quote follow-up",
      status: "blocked_local_preview",
    });
  });

  it("runs SMTP only when email side effects are explicitly enabled", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
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
    }));
    const json = await response.json();

    expect(json).toEqual({
      success: true,
      messageId: "msg-123",
      detail: "Email sent successfully",
    });
    expect(execFileMock).toHaveBeenCalledOnce();

    const sent = JSON.parse(fs.readFileSync(path.join(tempRoot, "mail", "sent-log.json"), "utf-8"));
    expect(sent[0]).toMatchObject({
      email: "buyer@example.com",
      subject: "Approved quote",
    });
  });
});

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
let tempRoot = "";

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/email-connection/test?project=demo-exporter", {
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

beforeEach(() => {
  vi.resetModules();
  execFileMock.mockReset();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-email-connection-route-test-"));
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

describe("/api/email-connection/test route", () => {
  it("validates the requested test kind", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ kind: "calendar" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: "Connection test kind must be imap or smtp.",
    });
  });

  it("returns a blocked SMTP diagnostic by default", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ kind: "smtp" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      blocked: true,
      kind: "smtp",
      action: {
        title: "Customer email send",
        status: "blocked",
        blocked: true,
      },
    });
    expectNoInternalActionFields(json);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("runs the SMTP verify-only command when enabled", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, JSON.stringify({ success: true }), "");
      }
    );
    const { POST } = await import("./route");
    const response = await POST(request({ kind: "smtp" }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      kind: "smtp",
      detail: "SMTP connection test passed.",
    });
    expect(execFileMock).toHaveBeenCalledOnce();
  });
});

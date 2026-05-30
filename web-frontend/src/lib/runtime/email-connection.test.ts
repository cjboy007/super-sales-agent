import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalImapFlag = process.env.SSA_ENABLE_REAL_IMAP;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  execFileMock.mockReset();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-email-connection-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_IMAP;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalImapFlag === undefined) delete process.env.SSA_ENABLE_REAL_IMAP;
  else process.env.SSA_ENABLE_REAL_IMAP = originalImapFlag;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("email connection tests", () => {
  it("blocks IMAP and SMTP tests unless real side-effect flags are enabled", async () => {
    const { createSalesRuntime } = await import("./sales-runtime");
    const { testEmailConnection } = await import("./email-connection");
    const runtime = createSalesRuntime();

    await expect(testEmailConnection(runtime, { workspaceId: "demo-exporter", kind: "imap" }))
      .resolves.toMatchObject({
        success: true,
        blocked: true,
        kind: "imap",
        detail: "IMAP test captured locally. Real IMAP is disabled for this runtime.",
        sideEffect: {
          kind: "imap.fetch",
          status: "blocked",
        },
      });
    await expect(testEmailConnection(runtime, { workspaceId: "demo-exporter", kind: "smtp" }))
      .resolves.toMatchObject({
        success: true,
        blocked: true,
        kind: "smtp",
        detail: "SMTP test captured locally. Real SMTP is disabled for this runtime.",
        sideEffect: {
          kind: "email.send",
          status: "blocked",
        },
      });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("runs read-only IMAP health check when enabled", async () => {
    process.env.SSA_ENABLE_REAL_IMAP = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, JSON.stringify({ healthy: true }), "");
      }
    );
    const { createSalesRuntime } = await import("./sales-runtime");
    const { testEmailConnection } = await import("./email-connection");
    const runtime = createSalesRuntime();

    const result = await testEmailConnection(runtime, { workspaceId: "demo-exporter", kind: "imap" });

    expect(result).toMatchObject({
      success: true,
      kind: "imap",
      detail: "IMAP connection test passed.",
    });
    expect(execFileMock).toHaveBeenCalledWith("node", expect.arrayContaining(["health-check"]), expect.any(Object), expect.any(Function));
  });

  it("runs SMTP verify-only test when enabled without sending a test email", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, JSON.stringify({ success: true, message: "SMTP connection successful" }), "");
      }
    );
    const { createSalesRuntime } = await import("./sales-runtime");
    const { testEmailConnection } = await import("./email-connection");
    const runtime = createSalesRuntime();

    const result = await testEmailConnection(runtime, { workspaceId: "demo-exporter", kind: "smtp" });

    expect(result).toMatchObject({
      success: true,
      kind: "smtp",
      detail: "SMTP connection test passed.",
    });
    expect(execFileMock).toHaveBeenCalledWith("node", expect.arrayContaining(["test-connection"]), expect.any(Object), expect.any(Function));
  });

  it("returns a clear failure when the mail script fails", async () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error("EAUTH bad credentials"), "", "auth failed");
      }
    );
    const { createSalesRuntime } = await import("./sales-runtime");
    const { testEmailConnection } = await import("./email-connection");
    const runtime = createSalesRuntime();

    const result = await testEmailConnection(runtime, { workspaceId: "demo-exporter", kind: "smtp" });

    expect(result).toMatchObject({
      success: false,
      kind: "smtp",
      detail: "SMTP connection test failed: EAUTH bad credentials",
    });
  });
});

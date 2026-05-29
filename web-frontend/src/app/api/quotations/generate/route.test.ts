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
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  execFileMock.mockReset();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-quotation-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalDocumentFlag === undefined) delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  else process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = originalDocumentFlag;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/quotations/generate route", () => {
  it("audits and blocks quotation generation by default without running scripts", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/quotations/generate?project=demo-exporter", {
      type: "QT",
      customer: "Example Buyer",
      items: [{ name: "Pump", qty: 2, unitPrice: 10 }],
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.blocked).toBe(true);
    expect(json.quotationNo).toMatch(/^QT-\d{8}-\d{3}$/);
    expect(json.files).toEqual([]);
    expect(json.sideEffect).toMatchObject({
      kind: "document.generate",
      workspaceId: "demo-exporter",
      status: "blocked",
      realExecutionEnabled: false,
    });
    expect(execFileMock).not.toHaveBeenCalled();

    const decisions = JSON.parse(
      fs.readFileSync(path.join(tempRoot, "companies", "demo-exporter", "approvals", "side-effect-decisions.json"), "utf-8")
    );
    expect(decisions[0]).toMatchObject({
      kind: "document.generate",
      workspaceId: "demo-exporter",
      status: "blocked",
    });
  });

  it("runs quotation generation only when real document generation is enabled", async () => {
    process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "generated ok", "");
      }
    );

    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/quotations/generate?project=demo-exporter", {
      type: "QT",
      customer: "Example Buyer",
      items: [{ name: "Pump", qty: 2, unitPrice: 10 }],
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.quotationNo).toMatch(/^QT-\d{8}-\d{3}$/);
    expect(json.sideEffect).toMatchObject({
      kind: "document.generate",
      workspaceId: "demo-exporter",
      status: "allowed",
      realExecutionEnabled: true,
    });
    expect(execFileMock).toHaveBeenCalledOnce();
  });
});

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
    expect(json.action).toMatchObject({
      title: "Document generation",
      status: "blocked",
      blocked: true,
    });
    expectNoInternalActionFields(json);
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

  it("blocks quotation generation when real document generation is enabled but approval is missing", async () => {
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
    expect(json.blocked).toBe(true);
    expect(json.action).toMatchObject({
      title: "Document generation",
      status: "allowed",
      blocked: false,
      reason: "Document generation blocked: approved action record is required before files are generated.",
    });
    expectNoInternalActionFields(json);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("runs quotation generation only after explicit enablement and an approved action record", async () => {
    process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = "true";
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "generated ok", "");
      }
    );
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const approval = runtime.approveSideEffect(runtime.requestDocumentGeneration({
      workspaceId: "demo-exporter",
      documentType: "QT",
      customer: "Example Buyer",
      payload: {
        items: [{ name: "Pump", qty: 2, unitPrice: 10 }],
        terms: "",
        notes: "",
      },
      idempotencyKey: "demo-exporter:document:QT:Example Buyer",
    }).id, { by: "Wilson", note: "Approved quotation generation." });

    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/quotations/generate?project=demo-exporter", {
      type: "QT",
      customer: "Example Buyer",
      items: [{ name: "Pump", qty: 2, unitPrice: 10 }],
      decisionId: approval.id,
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.quotationNo).toMatch(/^QT-\d{8}-\d{3}$/);
    expect(json.action).toMatchObject({
      title: "Document generation",
      status: "executed",
      blocked: false,
    });
    expectNoInternalActionFields(json);
    expect(execFileMock).toHaveBeenCalledOnce();
  });
});

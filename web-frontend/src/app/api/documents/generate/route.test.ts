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
const originalTradeDocsDir = process.env.TRADE_DOCS_DIR;
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;

let tempRoot = "";
let tradeDocsDir = "";

function tradeData() {
  return {
    company: { name: "Seller", address: "A", phone: "", email: "" },
    customer: { company_name: "Buyer Co", contact: "Ada", email: "ada@example.com", phone: "", address: "B", country: "Germany" },
    shipment: {
      date: "2026-05-26",
      vessel: "",
      departure_port: "Shenzhen",
      destination_port: "Hamburg",
      incoterms: "FOB",
      country_of_origin: "China",
      marks: "N/M",
    },
    currency: "USD",
    freight: 0,
    insurance: 0,
    products: [
      {
        description: "Pump",
        specification: "P-1",
        hs_code: "8413",
        quantity: 2,
        unit_price: 10,
        unit_cost: 6.5,
        cost_currency: "USD",
        supplier: "Hero Pump Factory",
        supplier_candidates: ["Hero Pump Factory", "Backup Pump Supplier"],
        net_weight_kg: 1,
        gross_weight_kg: 1.2,
        dimensions_cm: "10x10x10",
        package_type: "Carton",
        packages: 1,
      },
    ],
    pi_info: { pi_no: "PI-20260526-001", valid_until: "2026-06-26" },
    ci_info: { ci_no: "CI-20260526-001", ci_date: "2026-05-26", payment_terms: "T/T" },
    pl_info: { pl_no: "PL-20260526-001" },
  };
}

beforeEach(() => {
  vi.resetModules();
  execFileMock.mockReset();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-doc-route-test-"));
  tradeDocsDir = path.join(tempRoot, "trade-docs");
  fs.mkdirSync(path.join(tradeDocsDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(tradeDocsDir, "scripts", "generate_pi.py"), "# test", "utf-8");
  fs.writeFileSync(path.join(tradeDocsDir, "scripts", "generate_ci.py"), "# test", "utf-8");
  fs.writeFileSync(path.join(tradeDocsDir, "scripts", "generate_pl.py"), "# test", "utf-8");
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.TRADE_DOCS_DIR = tradeDocsDir;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  delete process.env.SSA_BETA_AUTH_TOKENS;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalTradeDocsDir === undefined) delete process.env.TRADE_DOCS_DIR;
  else process.env.TRADE_DOCS_DIR = originalTradeDocsDir;

  if (originalDocumentFlag === undefined) delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  else process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = originalDocumentFlag;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getRequest(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

function writeSavedPiRecord(workspaceId = "demo-exporter") {
  const data = tradeData();
  const dir = path.join(tempRoot, "companies", workspaceId, "documents", "pi-records");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${data.pi_info.pi_no}.json`), JSON.stringify({
    piNo: data.pi_info.pi_no,
    customer: data.customer.company_name,
    date: data.shipment.date,
    amount: "USD 20.00",
    productSummary: "Pump",
    updatedAt: new Date().toISOString(),
    source: "quick-quote.export",
    data,
  }, null, 2), "utf-8");
}

describe("/api/documents/generate route", () => {
  it("rejects PI generation because PI must be exported from Quick Quote", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/documents/generate?project=demo-exporter", {
      data: tradeData(),
      docTypes: ["PI"],
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: false,
      error: "Shipment document generation only supports CI and PL from a saved PI. Create PI from Quick Quote first.",
    });
    expect(response.status).toBe(400);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("audits and blocks CI / PL generation by default without running scripts", async () => {
    writeSavedPiRecord();
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/documents/generate?project=demo-exporter", {
      data: tradeData(),
      docTypes: ["CI", "PL"],
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      blocked: true,
      documents: [],
      action: {
        title: "Document generation",
        status: "blocked",
        blocked: true,
      },
    });
    expectNoInternalActionFields(json);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("blocks CI / PL generation when real document generation is enabled but approval is missing", async () => {
    writeSavedPiRecord();
    process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = "true";
    execFileMock.mockImplementation(
      (_file: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        const outputIndex = args.indexOf("--output");
        const outputPath = args[outputIndex + 1];
        fs.writeFileSync(outputPath, "<html>PI</html>", "utf-8");
        callback(null, "generated", "");
      }
    );

    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/documents/generate?project=demo-exporter", {
      data: tradeData(),
      docTypes: ["CI", "PL"],
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.blocked).toBe(true);
    expect(json.documents).toEqual([]);
    expect(json.action).toMatchObject({
      title: "Document generation",
      status: "allowed",
      blocked: false,
      reason: "Document generation blocked: approved action record is required before files are generated.",
    });
    expectNoInternalActionFields(json);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("runs CI / PL generation only after explicit enablement and an approved action record", async () => {
    writeSavedPiRecord();
    process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = "true";
    execFileMock.mockImplementation(
      (_file: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        const outputIndex = args.indexOf("--output");
        const outputPath = args[outputIndex + 1];
        fs.writeFileSync(outputPath, "<html>PI</html>", "utf-8");
        callback(null, "generated", "");
      }
    );
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const data = tradeData();
    const approval = runtime.approveSideEffect(runtime.requestDocumentGeneration({
      workspaceId: "demo-exporter",
      documentType: "CI+PL",
      customer: data.customer.company_name,
      payload: {
        docTypes: ["CI", "PL"],
        piNo: data.pi_info.pi_no,
        ciNo: data.ci_info.ci_no,
        plNo: data.pl_info.pl_no,
        customer: data.customer,
      },
      idempotencyKey: `demo-exporter:trade-docs:${data.pi_info.pi_no}:CI+PL`,
    }).id, { by: "Wilson", note: "Approved CI and PL generation." });

    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/documents/generate?project=demo-exporter", {
      data,
      docTypes: ["CI", "PL"],
      decisionId: approval.id,
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.documents).toHaveLength(2);
    expect(json.documents[0]).not.toHaveProperty("path");
    expect(json.documents[0]).toEqual(expect.objectContaining({
      filename: expect.any(String),
      fileName: expect.any(String),
      downloadUrl: expect.stringContaining("/api/files?"),
    }));
    expect(json.action).toMatchObject({
      title: "Document generation",
      status: "executed",
      blocked: false,
    });
    expectNoInternalActionFields(json);
    expect(execFileMock).toHaveBeenCalledTimes(2);
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("trade-docs");
  });

  it("rejects CI / PL generation when the PI was not exported first", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/documents/generate?project=demo-exporter", {
      data: tradeData(),
      docTypes: ["CI"],
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      success: false,
      error: "Saved PI record not found. Export the PI from Quick Quote before generating CI / PL.",
    });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("lists only documents for the requested workspace", async () => {
    const farreachDir = path.join(tempRoot, "companies", "farreach", "documents", "trade-docs");
    const heroDir = path.join(tempRoot, "companies", "hero-pumps", "documents", "trade-docs");
    fs.mkdirSync(farreachDir, { recursive: true });
    fs.mkdirSync(heroDir, { recursive: true });
    fs.writeFileSync(path.join(farreachDir, "PI-farreach.html"), "<html>Farreach</html>", "utf-8");
    fs.writeFileSync(path.join(heroDir, "PI-hero.html"), "<html>Hero</html>", "utf-8");
    const { GET } = await import("./route");

    const farreachResponse = await GET(getRequest("http://localhost/api/documents/generate?project=farreach"));
    const farreachJson = await farreachResponse.json();
    const heroResponse = await GET(getRequest("http://localhost/api/documents/generate?project=hero-pumps"));
    const heroJson = await heroResponse.json();

    expect(farreachResponse.status).toBe(200);
    expect(farreachJson.documents.map((item: { filename: string }) => item.filename)).toEqual(["PI-farreach.html"]);
    expect(farreachJson.documents[0]).not.toHaveProperty("path");
    expect(farreachJson.documents[0]).toEqual(expect.objectContaining({
      fileName: "PI-farreach.html",
      downloadUrl: expect.stringContaining("/api/files?"),
    }));
    expect(heroResponse.status).toBe(200);
    expect(heroJson.documents.map((item: { filename: string }) => item.filename)).toEqual(["PI-hero.html"]);
    const serialized = JSON.stringify({ farreachJson, heroJson });
    expect(serialized).not.toContain(tempRoot);
    expect(serialized).not.toContain("trade-docs");
  });

  it("uses the saved PI source data without writing a new price-memory row", async () => {
    writeSavedPiRecord();
    const { POST } = await import("./route");
    await POST(request("http://localhost/api/documents/generate?project=demo-exporter", {
      data: tradeData(),
      docTypes: ["CI"],
    }));

    const { GET } = await import("../pi-records/route");
    const response = await GET(getRequest("http://localhost/api/documents/pi-records?project=demo-exporter&query=PI-20260526"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.records).toHaveLength(1);
    expect(json.records[0]).toMatchObject({
      piNo: "PI-20260526-001",
      customer: "Buyer Co",
      amount: "USD 20.00",
    });
    expect(json.records[0].data.customer.company_name).toBe("Buyer Co");
    expect(fs.existsSync(path.join(tempRoot, "companies", "demo-exporter", "pricing", "price-memory.json"))).toBe(false);
  });
});

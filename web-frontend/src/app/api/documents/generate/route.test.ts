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

describe("/api/documents/generate route", () => {
  it("audits and blocks trade document generation by default without running scripts", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/documents/generate?project=demo-exporter", {
      data: tradeData(),
      docTypes: ["PI"],
    }));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      blocked: true,
      documents: [],
      sideEffect: {
        kind: "document.generate",
        workspaceId: "demo-exporter",
        status: "blocked",
        realExecutionEnabled: false,
      },
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

  it("runs trade document generation only when real document generation is enabled", async () => {
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
      docTypes: ["PI"],
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.documents).toHaveLength(1);
    expect(json.sideEffect).toMatchObject({
      kind: "document.generate",
      workspaceId: "demo-exporter",
      status: "allowed",
      realExecutionEnabled: true,
    });
    expect(execFileMock).toHaveBeenCalledOnce();
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
    expect(heroResponse.status).toBe(200);
    expect(heroJson.documents.map((item: { filename: string }) => item.filename)).toEqual(["PI-hero.html"]);
  });
});

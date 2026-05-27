import fs from "fs";
import os from "os";
import path from "path";
import { ensureDir, repoPath, ssaDataPath } from "../ssa-data-paths";
import type { DocumentGenerationRequest, SideEffectDecision } from "./types";
import { requestSideEffect } from "./side-effect-gate";
import type { SalesRuntime } from "./sales-runtime";

const QUOTATION_GENERATE_SCRIPT = repoPath("skills", "quotation-workflow", "scripts", "generate-all.sh");
const QUOTATION_OUTPUT_DIR = ssaDataPath("quotations");

export interface TradeProduct {
  description: string;
  specification: string;
  hs_code: string;
  quantity: number;
  unit_price: number;
  net_weight_kg: number;
  gross_weight_kg: number;
  dimensions_cm: string;
  package_type: string;
  packages: number;
}

export interface TradeDocumentData {
  company: { name: string; address: string; phone: string; email: string };
  customer: { company_name: string; contact: string; email: string; phone: string; address: string; country: string };
  shipment: {
    date: string;
    vessel: string;
    departure_port: string;
    destination_port: string;
    incoterms: string;
    country_of_origin: string;
    marks: string;
  };
  currency: string;
  freight: number;
  insurance: number;
  products: TradeProduct[];
  pi_info: { pi_no: string; valid_until: string };
  ci_info: { ci_no: string; ci_date: string; payment_terms: string };
  pl_info: { pl_no: string };
}

export type TradeDocumentType = "PI" | "CI" | "PL" | "ALL";

export interface TradeDocumentGenerationInput {
  workspaceId: string;
  data: TradeDocumentData;
  docTypes: TradeDocumentType[];
}

export interface GeneratedTradeDocument {
  type: string;
  filename: string;
  path: string;
  size: number;
  created?: string;
}

export type TradeDocumentGenerationResult =
  | {
      success: true;
      blocked: true;
      documents: [];
      sideEffect: SideEffectDecision;
      message: string;
    }
  | {
      success: true;
      documents: GeneratedTradeDocument[];
      sideEffect: SideEffectDecision;
      message: string;
    }
  | {
      success: false;
      sideEffect: SideEffectDecision;
      error: string;
    };

export interface QuotationGenerationInput {
  workspaceId: string;
  type: "QT" | "PI" | "PN" | "SPL";
  customer: string;
  items?: Array<{
    name: string;
    description?: string;
    qty?: number;
    unitPrice?: number;
    amount?: number;
  }>;
  terms?: string;
  notes?: string;
}

export interface QuotationGenerationResult {
  success: true;
  blocked?: true;
  quotationNo: string;
  files: Array<{ format: string; path: string }>;
  sideEffect: SideEffectDecision;
  detail: string;
  log?: string;
}

function tradeDocsDir() {
  return process.env.TRADE_DOCS_DIR || repoPath("skills", "sales", "trade-docs");
}

function tradeDocsOutputDir() {
  return ssaDataPath("documents", "trade-docs");
}

export function requestDocumentGeneration(request: DocumentGenerationRequest): SideEffectDecision {
  return requestSideEffect({
    kind: "document.generate",
    workspaceId: request.workspaceId,
    summary: `Generate ${request.documentType} document for ${request.customer}`,
    payload: {
      documentType: request.documentType,
      customer: request.customer,
      ...request.payload,
    },
    idempotencyKey: request.idempotencyKey,
  });
}

function makeQuotationNo(type: string) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `${type}-${dateStr}-${randomNum}`;
}

function findGeneratedQuotationFiles(quotationNo: string): Array<{ format: string; path: string }> {
  const extensions = ["xlsx", "docx", "html", "pdf"];
  const results: Array<{ format: string; path: string }> = [];

  for (const ext of extensions) {
    const candidates = [
      path.join(QUOTATION_OUTPUT_DIR, `${quotationNo}.${ext}`),
      path.join(os.tmpdir(), `${quotationNo}.${ext}`),
      path.join(path.dirname(QUOTATION_GENERATE_SCRIPT), "..", "output", `${quotationNo}.${ext}`),
    ];

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        results.push({ format: ext, path: filePath });
        break;
      }
    }
  }

  return results;
}

async function runExecFile(command: string, args: string[], options: Record<string, unknown>) {
  const [{ execFile }, { promisify }] = await Promise.all([
    import("child_process"),
    import("util"),
  ]);
  return promisify(execFile)(command, args, options);
}

async function runQuotationScript(dataFile: string, quotationNo: string) {
  return runExecFile("bash", [QUOTATION_GENERATE_SCRIPT, dataFile, quotationNo], {
    timeout: 60_000,
    maxBuffer: 5 * 1024 * 1024,
  });
}

export async function generateQuotationDocuments(
  runtime: SalesRuntime,
  input: QuotationGenerationInput
): Promise<QuotationGenerationResult> {
  ensureDir(QUOTATION_OUTPUT_DIR);

  const quotationNo = makeQuotationNo(input.type);
  const sideEffect = runtime.requestDocumentGeneration({
    workspaceId: input.workspaceId,
    documentType: input.type,
    customer: input.customer,
    payload: {
      quotationNo,
      items: input.items || [],
      terms: input.terms || "",
      notes: input.notes || "",
    },
    idempotencyKey: `${input.workspaceId}:document:${quotationNo}`,
  });

  if (sideEffect.status !== "allowed") {
    return {
      success: true,
      blocked: true,
      quotationNo,
      files: [],
      sideEffect,
      detail: "Quotation generation request captured locally. Real document generation is disabled.",
    };
  }

  const dataFile = path.join(os.tmpdir(), `ssa-quotation-${Date.now()}.json`);
  const quotationData = {
    quotationNo,
    type: input.type,
    customer: input.customer,
    items: input.items || [],
    terms: input.terms || "",
    notes: input.notes || "",
    date: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(dataFile, JSON.stringify(quotationData, null, 2), "utf-8");

  try {
    const execResult = await runQuotationScript(dataFile, quotationNo);
    const stdout = typeof execResult === "string" ? execResult : execResult.stdout || "";

    setTimeout(() => {
      try {
        fs.unlinkSync(dataFile);
      } catch {
        // Temp cleanup is best-effort.
      }
    }, 10_000);

    return {
      success: true,
      quotationNo,
      files: findGeneratedQuotationFiles(quotationNo),
      sideEffect,
      detail: "Document generated successfully",
      log: stdout.slice(-500),
    };
  } catch (scriptError) {
    try {
      fs.unlinkSync(dataFile);
    } catch {
      // Temp cleanup is best-effort.
    }
    throw scriptError;
  }
}

function tradeScriptFor(docType: string) {
  const scripts: Record<string, string> = {
    PI: path.resolve(tradeDocsDir(), "scripts/generate_pi.py"),
    CI: path.resolve(tradeDocsDir(), "scripts/generate_ci.py"),
    PL: path.resolve(tradeDocsDir(), "scripts/generate_pl.py"),
  };
  return scripts[docType];
}

function tradeDocumentTypes(docTypes: TradeDocumentType[]): Array<"PI" | "CI" | "PL"> {
  return docTypes.includes("ALL") ? ["PI", "CI", "PL"] : docTypes.filter((item): item is "PI" | "CI" | "PL" => item !== "ALL");
}

function tradeOutputFilename(data: TradeDocumentData, docType: string) {
  return `${data.pi_info.pi_no.replace("PI", docType)}-${Date.now()}.html`;
}

function listGeneratedTradeDocuments(): GeneratedTradeDocument[] {
  const outputDir = tradeDocsOutputDir();
  if (!fs.existsSync(outputDir)) return [];

  return fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => {
      const fullPath = path.join(outputDir, entry.name);
      const stats = fs.statSync(fullPath);
      const typeMatch = entry.name.match(/^(PI|CI|PL)/);
      return {
        type: typeMatch ? typeMatch[1] : "Unknown",
        filename: entry.name,
        path: fullPath,
        size: stats.size,
        created: stats.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

export function listTradeDocuments(): { success: true; documents: GeneratedTradeDocument[] } {
  return {
    success: true,
    documents: listGeneratedTradeDocuments(),
  };
}

export async function generateTradeDocuments(
  runtime: SalesRuntime,
  input: TradeDocumentGenerationInput
): Promise<TradeDocumentGenerationResult> {
  const outputDir = tradeDocsOutputDir();
  ensureDir(outputDir);

  const sideEffect = runtime.requestDocumentGeneration({
    workspaceId: input.workspaceId,
    documentType: input.docTypes.includes("ALL") ? "ALL" : input.docTypes.join("+"),
    customer: input.data.customer.company_name || input.data.customer.email || "Unknown customer",
    payload: {
      docTypes: input.docTypes,
      piNo: input.data.pi_info.pi_no,
      ciNo: input.data.ci_info.ci_no,
      plNo: input.data.pl_info.pl_no,
      customer: input.data.customer,
    },
    idempotencyKey: `${input.workspaceId}:trade-docs:${input.data.pi_info.pi_no}:${input.docTypes.join("+")}`,
  });

  if (sideEffect.status !== "allowed") {
    return {
      success: true,
      blocked: true,
      documents: [],
      sideEffect,
      message: "Trade document generation request captured locally. Real document generation is disabled.",
    };
  }

  const tempDataPath = path.resolve(outputDir, `_temp-${Date.now()}.json`);
  fs.writeFileSync(tempDataPath, JSON.stringify(input.data, null, 2), "utf-8");

  const documents: GeneratedTradeDocument[] = [];

  try {
    for (const docType of tradeDocumentTypes(input.docTypes)) {
      const outputFilename = tradeOutputFilename(input.data, docType);
      const outputPath = path.resolve(outputDir, outputFilename);
      const script = tradeScriptFor(docType);

      if (!script || !fs.existsSync(script)) {
        if (docType === "PI") continue;
        return {
          success: false,
          sideEffect,
          error: `Script not found for ${docType}: ${script}`,
        };
      }

      try {
        await runExecFile("python3", [script, "--data", tempDataPath, "--output", outputPath], {
          timeout: 30000,
        });

        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          documents.push({
            type: docType,
            filename: outputFilename,
            path: outputPath,
            size: stats.size,
          });
        }
      } catch {
        // Continue with the remaining requested documents.
      }
    }
  } finally {
    try {
      fs.unlinkSync(tempDataPath);
    } catch {
      // Temp cleanup is best-effort.
    }
  }

  if (documents.length === 0) {
    return {
      success: false,
      sideEffect,
      error: "No documents were generated. Check Python dependencies.",
    };
  }

  return {
    success: true,
    documents,
    sideEffect,
    message: `成功生成 ${documents.length} 份单证`,
  };
}

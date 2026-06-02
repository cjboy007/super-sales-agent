import fs from "fs";
import os from "os";
import path from "path";
import { ensureDir, repoPath, sanitizeSsaPathSegment, ssaCompanyDataPath } from "../ssa-data-paths";
import type { DocumentGenerationRequest, SideEffectDecision } from "./types";
import { requestSideEffect } from "./side-effect-gate";
import type { SalesRuntime } from "./sales-runtime";
import { upsertFileManifestRecords, type FileManifestRecord } from "./file-manifest";
import { recordPiPrices } from "./price-memory";

const QUOTATION_GENERATE_SCRIPT = repoPath("skills", "quotation-workflow", "scripts", "generate-all.sh");
function quotationOutputDir(workspaceId: string) {
  return ssaCompanyDataPath(workspaceId, "quotations");
}

export interface TradeProduct {
  description: string;
  specification: string;
  hs_code: string;
  quantity: number;
  unit_price: number;
  unit_cost?: number;
  cost_currency?: string;
  supplier?: string;
  supplier_candidates?: string[];
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

export interface PiRecord {
  piNo: string;
  customer: string;
  date: string;
  amount: string;
  productSummary: string;
  updatedAt: string;
  source: string;
  data: TradeDocumentData;
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
  type: "QT" | "PI" | "SPL";
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

function tradeDocsOutputDir(workspaceId = "farreach") {
  return ssaCompanyDataPath(workspaceId, "documents", "trade-docs");
}

function piRecordsDir(workspaceId = "farreach") {
  return ssaCompanyDataPath(workspaceId, "documents", "pi-records");
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

function findGeneratedQuotationFiles(workspaceId: string, quotationNo: string): Array<{ format: string; path: string }> {
  const extensions = ["xlsx", "docx", "html", "pdf"];
  const results: Array<{ format: string; path: string }> = [];

  for (const ext of extensions) {
    const candidates = [
      path.join(quotationOutputDir(workspaceId), `${quotationNo}.${ext}`),
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

function upsertGeneratedQuotationManifest(workspaceId: string, input: QuotationGenerationInput, quotationNo: string, files: Array<{ format: string; path: string }>) {
  const updatedAt = new Date().toISOString();
  const amountValue = (input.items || []).reduce((sum, item) => sum + (item.amount || (item.qty || 0) * (item.unitPrice || 0)), 0);
  const mainProducts = (input.items || []).map((item) => item.name || item.description).filter(Boolean).slice(0, 3).join(", ") || "—";
  const kind = input.type === "SPL" ? "sample_order" : input.type === "PI" ? "PI" : "quotation";
  const records: FileManifestRecord[] = files.map((file) => ({
    id: `${quotationNo}:${file.format}:${file.path}`,
    kind,
    documentNo: quotationNo,
    fileName: path.basename(file.path),
    path: file.path,
    format: file.format,
    customer: input.customer,
    amount: amountValue ? `USD ${amountValue.toFixed(2)}` : "—",
    mainProducts,
    sourceAction: "quotation.generate",
    updatedAt,
  }));
  if (records.length) upsertFileManifestRecords(workspaceId, records);
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
  ensureDir(quotationOutputDir(input.workspaceId));

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

    const files = findGeneratedQuotationFiles(input.workspaceId, quotationNo);
    upsertGeneratedQuotationManifest(input.workspaceId, input, quotationNo, files);
    return {
      success: true,
      quotationNo,
      files,
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

function piRecordPath(workspaceId: string, piNo: string) {
  return path.join(piRecordsDir(workspaceId), `${sanitizeSsaPathSegment(piNo)}.json`);
}

function formatAmount(data: TradeDocumentData) {
  const total = data.products.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  return `${data.currency} ${total.toFixed(2)}`;
}

function productSummary(data: TradeDocumentData) {
  return data.products
    .map((item) => item.description || item.specification)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ") || "—";
}

export function savePiRecord(workspaceId: string, data: TradeDocumentData, source = "documents.generate"): PiRecord {
  const piNo = data.pi_info.pi_no.trim();
  if (!piNo) throw new Error("PI number is required");
  ensureDir(piRecordsDir(workspaceId));
  const record: PiRecord = {
    piNo,
    customer: data.customer.company_name || data.customer.email || "Unknown customer",
    date: data.shipment.date || data.ci_info.ci_date || new Date().toISOString().slice(0, 10),
    amount: formatAmount(data),
    productSummary: productSummary(data),
    updatedAt: new Date().toISOString(),
    source,
    data,
  };
  fs.writeFileSync(piRecordPath(workspaceId, piNo), JSON.stringify(record, null, 2), "utf-8");
  recordPiPrices(workspaceId, data, source);
  return record;
}

function readPiRecord(filePath: string): PiRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as PiRecord;
  } catch {
    return null;
  }
}

export function listPiRecords(workspaceId = "farreach", query = ""): { success: true; records: PiRecord[] } {
  const dir = piRecordsDir(workspaceId);
  if (!fs.existsSync(dir)) return { success: true, records: [] };
  const normalized = query.trim().toLowerCase();
  const records = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readPiRecord(path.join(dir, entry.name)))
    .filter((record): record is PiRecord => Boolean(record))
    .filter((record) => {
      if (!normalized) return true;
      return [
        record.piNo,
        record.customer,
        record.amount,
        record.productSummary,
      ].some((value) => value.toLowerCase().includes(normalized));
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { success: true, records };
}

function listGeneratedTradeDocuments(workspaceId: string): GeneratedTradeDocument[] {
  const outputDir = tradeDocsOutputDir(workspaceId);
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

function upsertTradeDocumentManifest(workspaceId: string, data: TradeDocumentData, documents: GeneratedTradeDocument[]) {
  const updatedAt = new Date().toISOString();
  const records: FileManifestRecord[] = documents.map((document) => ({
    id: `${document.type}:${document.filename}:${document.path}`,
    kind: document.type === "PI" || document.type === "CI" || document.type === "PL" ? document.type : "other",
    documentNo: document.filename.replace(/\.[^.]+$/, ""),
    fileName: document.filename,
    path: document.path,
    format: path.extname(document.filename).toLowerCase().replace(/^\./, "") || "html",
    customer: data.customer.company_name || data.customer.email || "Unknown customer",
    amount: formatAmount(data),
    mainProducts: productSummary(data),
    sourceAction: "documents.generate",
    updatedAt,
  }));
  if (records.length) upsertFileManifestRecords(workspaceId, records);
}

export function listTradeDocuments(workspaceId = "farreach"): { success: true; documents: GeneratedTradeDocument[] } {
  return {
    success: true,
    documents: listGeneratedTradeDocuments(workspaceId),
  };
}

export async function generateTradeDocuments(
  runtime: SalesRuntime,
  input: TradeDocumentGenerationInput
): Promise<TradeDocumentGenerationResult> {
  const outputDir = tradeDocsOutputDir(input.workspaceId);
  ensureDir(outputDir);
  if (input.data.pi_info.pi_no.trim() && input.docTypes.includes("PI")) {
    savePiRecord(input.workspaceId, input.data);
  }

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

  upsertTradeDocumentManifest(input.workspaceId, input.data, documents);

  return {
    success: true,
    documents,
    sideEffect,
    message: `成功生成 ${documents.length} 份单证`,
  };
}

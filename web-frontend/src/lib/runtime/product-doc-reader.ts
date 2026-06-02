import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import type { IntakeUpload } from "./intake";
import { upsertMemoryIndexRecord } from "./memory-index";
import { readSettings } from "../config-store";
import { ensureDir, ensureSsaCompanyDataPath, repoPath } from "../ssa-data-paths";

const execFileAsync = promisify(execFile);
const PRODUCT_DOC_FILENAME_RE = /(599-\d{2,3}|drawing|technical|spec|datasheet|catalog|catalogue)/i;

export interface ProductDocReaderSummary {
  productName: string;
  modelNo: string;
  drawingNo: string;
  packagingSpec: string;
  bomRows: number;
  confidence: number;
  warnings: string[];
  needsReview: boolean;
  uploadPath: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  status: number;
}

interface CommandOptions {
  env?: NodeJS.ProcessEnv;
}

interface IntakeRecordForProductDoc {
  id: string;
  project: string;
  updatedAt: string;
  uploads: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    path: string;
    storedAt: string;
    processing?: {
      status: "saved" | "queued" | "processing" | "completed" | "needs_review" | "failed";
      kind: "product_doc" | "lead_list" | "trade_doc" | "unknown";
      error?: string;
      resultRef?: string;
      updatedAt?: string;
    };
  }>;
  analysis: Record<string, unknown> & {
    productDoc?: ProductDocReaderSummary;
    evidence?: string[];
    actions?: Array<{ id?: string; status?: string; [key: string]: unknown }>;
    confidence?: number;
  };
}

export interface ProductDocReaderInput {
  project: string;
  uploads: IntakeUpload[];
  itemType: string;
  message: string;
  runCommand?: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>;
}

export interface ProductDocReaderJobInput {
  project: string;
  intakeId: string;
  uploadId: string;
  uploadPath?: string;
  runCommand?: (command: string, args: string[], options?: CommandOptions) => Promise<CommandResult>;
}

function isPdf(upload: IntakeUpload) {
  return upload.type === "application/pdf" || path.extname(upload.name).toLowerCase() === ".pdf";
}

function shouldRunProductDocReader(input: ProductDocReaderInput) {
  if (input.itemType === "Product Spec") return true;
  const haystack = `${input.message} ${input.uploads.map((upload) => upload.name).join(" ")}`;
  return PRODUCT_DOC_FILENAME_RE.test(haystack);
}

function pickProductDocUpload(uploads: IntakeUpload[]) {
  return uploads.find((upload) => isPdf(upload) && PRODUCT_DOC_FILENAME_RE.test(upload.name))
    || uploads.find((upload) => isPdf(upload))
    || null;
}

async function defaultRunCommand(command: string, args: string[], options?: CommandOptions): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: options?.env,
    });
    return { stdout: result.stdout, stderr: result.stderr, status: 0 };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message,
      status: typeof err.code === "number" ? err.code : 1,
    };
  }
}

function parseReaderOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("product-doc-reader returned empty output");
  return JSON.parse(trimmed);
}

function toSummary(data: unknown, uploadPath: string): ProductDocReaderSummary {
  const record = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const bom = Array.isArray(record.bom) ? record.bom : [];
  const warnings = Array.isArray(record.warnings) ? record.warnings.map(String) : [];
  const confidence = typeof record.confidence === "number" ? record.confidence : Number(record.confidence || 0);

  return {
    productName: String(record.product_name || ""),
    modelNo: String(record.model_no || ""),
    drawingNo: String(record.drawing_no || ""),
    packagingSpec: String(record.packaging_spec || ""),
    bomRows: bom.length,
    confidence,
    warnings,
    needsReview: Boolean(record.needs_review) || confidence < 80 || warnings.length > 0,
    uploadPath,
  };
}

function extractorEnv(): NodeJS.ProcessEnv {
  const settings = readSettings();
  const openRouterKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY;
  const openAiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY;
  const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return {
    ...process.env,
    OPENROUTER_API_KEY: openRouterKey,
    OPENAI_API_KEY: openAiKey,
    GEMINI_API_KEY: geminiKey,
    GOOGLE_API_KEY: geminiKey,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140) || "upload";
}

function sessionPath(project: string, intakeId: string) {
  return ensureSsaCompanyDataPath(project, "intake", "sessions", `${sanitizeSegment(intakeId)}.json`);
}

function readIntakeRecord(project: string, intakeId: string): IntakeRecordForProductDoc {
  const filePath = sessionPath(project, intakeId);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as IntakeRecordForProductDoc;
}

function writeIntakeRecord(record: IntakeRecordForProductDoc) {
  fs.writeFileSync(sessionPath(record.project, record.id), JSON.stringify(record, null, 2), "utf-8");
}

function resultPath(project: string, intakeId: string, uploadId: string) {
  return ensureSsaCompanyDataPath(project, "intake", "analysis", sanitizeSegment(intakeId), `${sanitizeSegment(uploadId)}.product-doc.json`);
}

function markUpload(
  record: IntakeRecordForProductDoc,
  uploadId: string,
  patch: Partial<NonNullable<IntakeRecordForProductDoc["uploads"][number]["processing"]>>,
) {
  record.uploads = record.uploads.map((upload) => {
    if (upload.id !== uploadId) return upload;
    return {
      ...upload,
      processing: {
        status: "processing",
        kind: "product_doc",
        ...(upload.processing || {}),
        ...patch,
        updatedAt: nowIso(),
      },
    };
  });
  record.updatedAt = nowIso();
}

async function runExtractor(uploadPath: string, runCommand?: ProductDocReaderInput["runCommand"]) {
  const scriptPath = repoPath("skills", "product-doc-reader", "scripts", "extract_hybrid.py");
  const command = runCommand || defaultRunCommand;
  const result = await command(
    "python3",
    [scriptPath, uploadPath, "--stdout", "-f", "json"],
    { env: extractorEnv() },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "product-doc-reader failed");
  }
  return toSummary(parseReaderOutput(result.stdout), uploadPath);
}

export async function maybeAnalyzeProductDocUpload(input: ProductDocReaderInput): Promise<ProductDocReaderSummary | null> {
  if (!shouldRunProductDocReader(input)) return null;
  const upload = pickProductDocUpload(input.uploads);
  if (!upload || !fs.existsSync(upload.path)) return null;

  const scriptPath = repoPath("skills", "product-doc-reader", "scripts", "extract_hybrid.py");
  const runCommand = input.runCommand || defaultRunCommand;
  const result = await runCommand(
    "python3",
    [scriptPath, upload.path, "--stdout", "-f", "json"],
    { env: extractorEnv() },
  );

  if (result.status !== 0) {
    return {
      productName: "",
      modelNo: "",
      drawingNo: "",
      packagingSpec: "",
      bomRows: 0,
      confidence: 0,
      warnings: [result.stderr || "product-doc-reader failed"],
      needsReview: true,
      uploadPath: upload.path,
    };
  }

  try {
    return toSummary(parseReaderOutput(result.stdout), upload.path);
  } catch (error) {
    return {
      productName: "",
      modelNo: "",
      drawingNo: "",
      packagingSpec: "",
      bomRows: 0,
      confidence: 0,
      warnings: [error instanceof Error ? error.message : "product-doc-reader JSON parse failed"],
      needsReview: true,
      uploadPath: upload.path,
    };
  }
}

export async function runProductDocReaderJob(input: ProductDocReaderJobInput): Promise<ProductDocReaderSummary> {
  const record = readIntakeRecord(input.project, input.intakeId);
  const upload = record.uploads.find((item) => item.id === input.uploadId);
  if (!upload) throw new Error(`Intake upload not found: ${input.uploadId}`);
  markUpload(record, input.uploadId, { status: "processing", error: undefined });
  writeIntakeRecord(record);

  try {
    const uploadPath = input.uploadPath || upload.path;
    if (!uploadPath || !fs.existsSync(uploadPath)) {
      throw new Error(`Intake upload file is missing: ${input.uploadId}`);
    }
    const summary = await runExtractor(uploadPath, input.runCommand);
    const outputPath = resultPath(input.project, input.intakeId, input.uploadId);
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf-8");

    record.analysis.productDoc = summary;
    record.analysis.evidence = Array.from(new Set([
      ...(record.analysis.evidence || []),
      `product-doc-reader: ${summary.drawingNo || summary.productName || "extracted"} (${summary.confidence}%)`,
    ]));
    if (summary.needsReview) {
      record.analysis.confidence = Math.min(Number(record.analysis.confidence || 0), Math.max(35, summary.confidence));
      record.analysis.actions = (record.analysis.actions || []).map((action) => action.id === "place-file"
        ? { ...action, status: "needs_review" }
        : action);
    }
    markUpload(record, input.uploadId, {
      status: summary.needsReview ? "needs_review" : "completed",
      resultRef: outputPath,
      error: undefined,
    });
    writeIntakeRecord(record);
    upsertMemoryIndexRecord({
      workspaceId: input.project,
      sourceKind: "product_doc",
      sourceId: `${input.intakeId}:${input.uploadId}`,
      kind: "document",
      title: summary.drawingNo || summary.productName || upload.name,
      body: [
        summary.productName,
        summary.modelNo,
        summary.drawingNo,
        summary.packagingSpec,
        upload.name,
        uploadPath,
      ].filter(Boolean).join(" "),
      keywords: [
        summary.productName,
        summary.modelNo,
        summary.drawingNo,
        summary.packagingSpec,
        upload.name,
      ].filter(Boolean),
      path: uploadPath,
      mime: upload.type,
      size: upload.size,
      metadata: {
        intakeId: input.intakeId,
        uploadId: input.uploadId,
        resultRef: outputPath,
        confidence: summary.confidence,
        needsReview: summary.needsReview,
      },
    });
    return summary;
  } catch (error) {
    const failed = readIntakeRecord(input.project, input.intakeId);
    markUpload(failed, input.uploadId, {
      status: "failed",
      error: error instanceof Error ? error.message : "product-doc-reader failed",
    });
    writeIntakeRecord(failed);
    throw error;
  }
}

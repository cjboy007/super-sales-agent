import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { ensureDir, sanitizeSsaPathSegment, ssaCompanyDataPath } from "../ssa-data-paths";
import { upsertFileManifestRecords } from "./file-manifest";
import { isWorkspaceRuntimeFileAllowed } from "./files";
import { upsertMemoryIndexRecord } from "./memory-index";
import type { SalesRuntime } from "./sales-runtime";

const execFileAsync = promisify(execFile);
const MAX_FILE_CHARS = 6_000;
const MAX_TOTAL_CHARS = 24_000;

interface RawIntakeUpload {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
  processing?: {
    status?: string;
    kind?: string;
    resultRef?: string;
  };
}

interface RawIntakeRecord {
  id: string;
  project: string;
  pastedText?: string;
  uploads: RawIntakeUpload[];
  analysis?: {
    itemType?: string;
    destination?: string;
    relatedParty?: string;
    summary?: string;
    productDoc?: Record<string, unknown>;
  };
}

interface ExtractedSource {
  upload: RawIntakeUpload;
  text: string;
  method: string;
  warning?: string;
}

export interface SynthesizeIntakeInput {
  workspaceId: string;
  intakeId: string;
  instruction?: string;
  title?: string;
}

export interface SynthesizeIntakeResult {
  success: true;
  synthesisId: string;
  title: string;
  outputPath: string;
  fileName: string;
  filesRead: number;
  filesSkipped: number;
  warnings: string[];
  source: "local" | "llm";
  summary: string;
  includedFiles: Array<{
    name: string;
    type: string;
    size: number;
    chars: number;
    method: string;
  }>;
}

function sessionPath(workspaceId: string, intakeId: string) {
  return ssaCompanyDataPath(workspaceId, "intake", "sessions", `${sanitizeSsaPathSegment(intakeId)}.json`);
}

function synthesesDir(workspaceId: string) {
  return ensureDir(ssaCompanyDataPath(workspaceId, "documents", "syntheses"));
}

function makeSynthesisId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SYN-${date}-${random}`;
}

function cleanText(value: unknown, max = MAX_FILE_CHARS) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ");
}

async function runCommand(command: string, args: string[], timeout = 30_000) {
  try {
    const result = await execFileAsync(command, args, {
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout || "", stderr: result.stderr || "" };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    return { ok: false, stdout: err.stdout || "", stderr: err.stderr || err.message };
  }
}

async function extractPdfText(filePath: string) {
  const result = await runCommand("pdftotext", ["-layout", filePath, "-"], 45_000);
  if (!result.ok || !result.stdout.trim()) {
    return { text: "", warning: result.stderr || "pdftotext produced no readable text" };
  }
  return { text: cleanText(result.stdout), warning: "" };
}

function readConvertedHtml(resolved: string, outputDir: string): string {
  const baseName = path.basename(resolved, path.extname(resolved));
  const exact = path.join(outputDir, `${baseName}.html`);
  if (fs.existsSync(exact)) return fs.readFileSync(exact, "utf-8");
  const converted = fs.readdirSync(outputDir).find((file) => file.startsWith(baseName) && file.endsWith(".html"));
  if (!converted) throw new Error("document conversion produced no HTML");
  return fs.readFileSync(path.join(outputDir, converted), "utf-8");
}

async function extractOfficeText(filePath: string) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-synthesize-"));
  try {
    const result = await runCommand("soffice", [
      "--headless",
      "--convert-to", "html",
      "--outdir", outputDir,
      filePath,
    ], 45_000);
    if (!result.ok) return { text: "", warning: result.stderr || "LibreOffice conversion failed" };
    return { text: cleanText(htmlToText(readConvertedHtml(filePath, outputDir))), warning: "" };
  } catch (error) {
    return { text: "", warning: error instanceof Error ? error.message : "Office conversion failed" };
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function readProductDocResult(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function productDocText(record: RawIntakeRecord, upload: RawIntakeUpload) {
  const productDoc = upload.processing?.resultRef
    ? readProductDocResult(upload.processing.resultRef) || record.analysis?.productDoc
    : record.analysis?.productDoc;
  if (!productDoc || typeof productDoc !== "object") return "";
  return cleanText([
    `Product name: ${productDoc.productName || productDoc.product_name || ""}`,
    `Model no: ${productDoc.modelNo || productDoc.model_no || ""}`,
    `Drawing no: ${productDoc.drawingNo || productDoc.drawing_no || ""}`,
    `Packaging: ${productDoc.packagingSpec || productDoc.packaging_spec || ""}`,
    `Confidence: ${productDoc.confidence || ""}`,
  ].filter((line) => !line.endsWith(": ")).join("\n"));
}

async function extractUpload(record: RawIntakeRecord, upload: RawIntakeUpload): Promise<ExtractedSource> {
  const resolved = path.resolve(upload.path || "");
  if (!resolved || !fs.existsSync(resolved)) {
    return { upload, text: "", method: "missing", warning: "File is missing from local storage." };
  }
  if (!isWorkspaceRuntimeFileAllowed(resolved, record.project)) {
    return { upload, text: "", method: "blocked", warning: "File is outside allowed workspace storage." };
  }

  const ext = path.extname(resolved).toLowerCase();
  if ([".txt", ".md", ".csv", ".json"].includes(ext) || upload.type.startsWith("text/")) {
    return { upload, text: cleanText(fs.readFileSync(resolved, "utf-8")), method: "text" };
  }
  if (ext === ".html" || ext === ".htm") {
    return { upload, text: cleanText(htmlToText(fs.readFileSync(resolved, "utf-8"))), method: "html" };
  }
  if (ext === ".pdf") {
    const productDoc = productDocText(record, upload);
    if (productDoc) return { upload, text: productDoc, method: "product-doc-reader" };
    const extracted = await extractPdfText(resolved);
    return { upload, text: extracted.text, method: "pdftotext", warning: extracted.warning || undefined };
  }
  if ([".doc", ".docx", ".xls", ".xlsx"].includes(ext)) {
    const extracted = await extractOfficeText(resolved);
    return { upload, text: extracted.text, method: "office-html", warning: extracted.warning || undefined };
  }

  return { upload, text: "", method: "unsupported", warning: `Unsupported file type: ${ext || upload.type || "unknown"}` };
}

function loadIntakeRecord(workspaceId: string, intakeId: string): RawIntakeRecord {
  const filePath = sessionPath(workspaceId, intakeId);
  if (!fs.existsSync(filePath)) throw new Error(`Intake session not found: ${intakeId}`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RawIntakeRecord;
}

function buildLocalSummary(record: RawIntakeRecord, sources: ExtractedSource[]) {
  const readable = sources.filter((source) => source.text.trim());
  const names = readable.map((source) => source.upload.name).join(", ") || "the submitted files";
  const itemType = record.analysis?.itemType || "intake bundle";
  const relatedParty = record.analysis?.relatedParty && record.analysis.relatedParty !== "Unknown"
    ? ` for ${record.analysis.relatedParty}`
    : "";
  return `SSA combined ${readable.length} readable file(s) from ${names}. Current read: ${itemType}${relatedParty}. Review the extracted notes before using this with a customer.`;
}

function buildPrompt(record: RawIntakeRecord, sources: ExtractedSource[], instruction: string) {
  let remaining = MAX_TOTAL_CHARS;
  const excerpts = sources.map((source) => {
    const text = cleanText(source.text, Math.max(0, Math.min(MAX_FILE_CHARS, remaining)));
    remaining -= text.length;
    return {
      file: source.upload.name,
      type: source.upload.type,
      method: source.method,
      text,
    };
  });
  return [
    "You are Jaden inside Super Sales Agent.",
    "Synthesize a set of uploaded sales documents into a concise operator handoff.",
    "Do not claim that files were sent, moved, or externally changed.",
    "Mention important customer requirements, quantities, document gaps, and next safe actions.",
    `Operator instruction: ${instruction || "Create a concise synthesis."}`,
    `Intake analysis: ${JSON.stringify(record.analysis || {})}`,
    `Pasted text: ${cleanText(record.pastedText || "", 2000)}`,
    `Extracted files: ${JSON.stringify(excerpts)}`,
  ].join("\n");
}

function markdownEscapeFence(value: string) {
  return value.replace(/```/g, "'''");
}

function buildMarkdown(input: {
  title: string;
  synthesisId: string;
  record: RawIntakeRecord;
  sources: ExtractedSource[];
  summary: string;
  instruction: string;
  warnings: string[];
}) {
  const readable = input.sources.filter((source) => source.text.trim());
  const files = input.sources.map((source) =>
    `- ${source.upload.name} (${source.upload.type || "file"}, ${source.method})${source.warning ? ` - ${source.warning}` : ""}`
  ).join("\n");
  const notes = readable.map((source) => [
    `### ${source.upload.name}`,
    "",
    "```text",
    markdownEscapeFence(source.text),
    "```",
  ].join("\n")).join("\n\n");
  const warnings = input.warnings.length
    ? ["## Warnings", "", ...input.warnings.map((warning) => `- ${warning}`), ""].join("\n")
    : "";

  return [
    `# ${input.title}`,
    "",
    `Synthesis ID: ${input.synthesisId}`,
    `Generated at: ${new Date().toISOString()}`,
    `Intake: ${input.record.id}`,
    input.instruction ? `Instruction: ${input.instruction}` : "",
    "",
    "## Summary",
    "",
    input.summary,
    "",
    "## Source Files",
    "",
    files || "- No files were available.",
    "",
    warnings,
    "## Extracted Notes",
    "",
    notes || "No readable text was extracted. Review the original files manually.",
    "",
  ].filter(Boolean).join("\n");
}

export async function synthesizeIntakeDocuments(
  runtime: SalesRuntime,
  input: SynthesizeIntakeInput
): Promise<SynthesizeIntakeResult> {
  const workspace = runtime.getWorkspace(input.workspaceId);
  const record = { ...loadIntakeRecord(workspace.id, input.intakeId), project: workspace.id };
  const sources = await Promise.all((record.uploads || []).map((upload) => extractUpload(record, upload)));
  const warnings = sources
    .filter((source) => source.warning)
    .map((source) => `${source.upload.name}: ${source.warning}`);
  const readable = sources.filter((source) => source.text.trim());
  const localSummary = buildLocalSummary(record, sources);
  const llm = await runtime.runLlm({
    workspaceId: workspace.id,
    task: "summarize",
    input: buildPrompt(record, sources, input.instruction || ""),
    context: {
      source: "document.synthesize",
      intakeId: record.id,
      files: sources.map((source) => source.upload.name),
    },
  });
  const source = llm.source === "provider" ? "llm" : "local";
  const summary = source === "llm" ? llm.text : localSummary;
  const synthesisId = makeSynthesisId();
  const title = input.title?.trim() || `${record.analysis?.relatedParty && record.analysis.relatedParty !== "Unknown" ? record.analysis.relatedParty : "Intake"} synthesis`;
  const fileName = `${synthesisId}-${sanitizeSsaPathSegment(title, "synthesis")}.md`;
  const outputPath = path.join(synthesesDir(workspace.id), fileName);
  const markdown = buildMarkdown({
    title,
    synthesisId,
    record,
    sources,
    summary,
    instruction: input.instruction || "",
    warnings,
  });
  fs.writeFileSync(outputPath, markdown, "utf-8");

  const updatedAt = new Date().toISOString();
  upsertFileManifestRecords(workspace.id, [{
    id: `${synthesisId}:md:${outputPath}`,
    kind: "other",
    documentNo: synthesisId,
    fileName,
    path: outputPath,
    format: "md",
    customer: record.analysis?.relatedParty && record.analysis.relatedParty !== "Unknown" ? record.analysis.relatedParty : "-",
    amount: "-",
    mainProducts: readable.map((source) => source.upload.name).slice(0, 3).join(", ") || "-",
    sourceAction: "document.synthesize",
    updatedAt,
  }]);
  upsertMemoryIndexRecord({
    workspaceId: workspace.id,
    sourceKind: "intake",
    sourceId: `${record.id}:${synthesisId}`,
    kind: "document",
    title,
    body: [summary, readable.map((source) => source.text).join("\n")].join("\n").slice(0, MAX_TOTAL_CHARS),
    keywords: [synthesisId, record.id, title, ...readable.map((source) => source.upload.name)],
    path: outputPath,
    mime: "text/markdown",
    size: Buffer.byteLength(markdown, "utf-8"),
    metadata: {
      intakeId: record.id,
      synthesisId,
      sourceAction: "document.synthesize",
      files: sources.map((source) => source.upload.name),
    },
    updatedAt,
  });

  runtime.recordEvent("document.synthesized", workspace.id, {
    intakeId: record.id,
    synthesisId,
    fileName,
    filesRead: readable.length,
    filesSkipped: sources.length - readable.length,
    sideEffects: "local-only",
  });

  return {
    success: true,
    synthesisId,
    title,
    outputPath,
    fileName,
    filesRead: readable.length,
    filesSkipped: sources.length - readable.length,
    warnings,
    source,
    summary,
    includedFiles: sources.map((sourceItem) => ({
      name: sourceItem.upload.name,
      type: sourceItem.upload.type,
      size: sourceItem.upload.size,
      chars: sourceItem.text.length,
      method: sourceItem.method,
    })),
  };
}

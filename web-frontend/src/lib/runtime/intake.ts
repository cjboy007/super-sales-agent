import fs from "fs";
import path from "path";
import type { SalesRuntime } from "./sales-runtime";
import type { LlmResult } from "./types";
import type { ProductDocReaderSummary } from "./product-doc-reader";
import { ensureDir, ensureSsaCompanyDataPath, sanitizeSsaPathSegment, ssaCompanyDataPath } from "../ssa-data-paths";

export type IntakeMessageRole = "user" | "assistant";

export interface IntakeMessage {
  id: string;
  role: IntakeMessageRole;
  content: string;
  createdAt: string;
}

export interface IntakeUpload {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
  storedAt: string;
  processing?: IntakeUploadProcessing;
}

export interface IntakeUploadProcessing {
  status: "saved" | "queued" | "processing" | "completed" | "needs_review" | "failed";
  kind: "product_doc" | "lead_list" | "trade_doc" | "unknown";
  error?: string;
  resultRef?: string;
  updatedAt?: string;
}

export interface IntakeMatch {
  kind: "lead" | "quotation" | "document";
  title: string;
  detail: string;
  confidence: number;
}

export interface IntakeAction {
  id: string;
  label: string;
  target: string;
  status: "ready" | "approval_required" | "needs_review";
}

export interface IntakeAnalysis {
  source: "local" | "llm";
  itemType: string;
  destination: string;
  confidence: number;
  relatedParty: string;
  summary: string;
  evidence: string[];
  matches: IntakeMatch[];
  actions: IntakeAction[];
  productDoc?: ProductDocReaderSummary;
}

export interface IntakeRecord {
  id: string;
  project: string;
  status: "draft" | "pending_review";
  createdAt: string;
  updatedAt: string;
  pastedText: string;
  uploads: IntakeUpload[];
  messages: IntakeMessage[];
  analysis: IntakeAnalysis;
}

export interface IntakeInput {
  project: string;
  sessionId?: string;
  message?: string;
  pastedText?: string;
  files?: File[];
}

interface QueuedUploadProcessingTask {
  intakeId: string;
  uploadId: string;
  uploadPath: string;
  kind: IntakeUploadProcessing["kind"];
}

export interface IntakeSessionSummary {
  id: string;
  project: string;
  status: IntakeRecord["status"];
  updatedAt: string;
  itemType: string;
  destination: string;
  confidence: number;
  uploads: number;
  messages: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_SIZE = 150 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 8;
const MAX_INTAKE_SESSIONS = 25;

const EMPTY_ANALYSIS: IntakeAnalysis = {
  source: "local",
  itemType: "Unclassified",
  destination: "intake/review",
  confidence: 0,
  relatedParty: "Unknown",
  summary: "Waiting for upload, pasted text, or operator context.",
  evidence: [],
  matches: [],
  actions: [],
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140) || "upload";
}

function sessionPath(project: string, sessionId: string) {
  return ensureSsaCompanyDataPath(project, "intake", "sessions", `${sanitizeSegment(sessionId)}.json`);
}

function readRecord(project: string, sessionId: string): IntakeRecord | null {
  try {
    const filePath = sessionPath(project, sessionId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as IntakeRecord;
  } catch {
    return null;
  }
}

function writeRecord(record: IntakeRecord) {
  fs.writeFileSync(sessionPath(record.project, record.id), JSON.stringify(record, null, 2), "utf-8");
}

function readSessionRecords(project: string): IntakeRecord[] {
  const dir = ssaCompanyDataPath(project, "intake", "sessions");
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as IntakeRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is IntakeRecord => Boolean(record));
}

function pruneIntakeStorage(project: string) {
  const sessionsDir = ssaCompanyDataPath(project, "intake", "sessions");
  const uploadsDir = ssaCompanyDataPath(project, "intake", "uploads");
  const records = readSessionRecords(project).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const kept = new Set(records.slice(0, MAX_INTAKE_SESSIONS).map((record) => record.id));

  for (const record of records.slice(MAX_INTAKE_SESSIONS)) {
    try {
      fs.rmSync(path.join(sessionsDir, `${sanitizeSegment(record.id)}.json`), { force: true });
    } catch {
      // Best-effort cleanup should never block intake processing.
    }
  }

  try {
    if (!fs.existsSync(uploadsDir)) return;
    for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !kept.has(entry.name)) {
        fs.rmSync(path.join(uploadsDir, entry.name), { recursive: true, force: true });
      }
    }
  } catch {
    // Best-effort cleanup should never block intake processing.
  }
}

function createRecord(project: string): IntakeRecord {
  const createdAt = nowIso();
  return {
    id: makeId("intake"),
    project,
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    pastedText: "",
    uploads: [],
    messages: [],
    analysis: EMPTY_ANALYSIS,
  };
}

function compactText(value: string, max = 16000) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function extractEmails(text: string) {
  return Array.from(new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
}

function extractSearchTerms(text: string, uploads: IntakeUpload[]) {
  const terms = new Set<string>();
  for (const email of extractEmails(text)) {
    terms.add(email.toLowerCase());
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain) terms.add(domain);
    const domainRoot = domain?.split(".")[0];
    if (domainRoot && domainRoot.length > 3) terms.add(domainRoot);
  }

  const fileText = uploads.map((file) => path.basename(file.name, path.extname(file.name))).join(" ");
  const candidates = `${text} ${fileText}`
    .split(/[^a-zA-Z0-9@.-]+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 4 && term.length <= 48);

  for (const term of candidates.slice(0, 80)) {
    if (!/^\d+$/.test(term)) terms.add(term);
  }

  return Array.from(terms).slice(0, 32);
}

function detectItemType(text: string, uploads: IntakeUpload[]) {
  const lower = text.toLowerCase();
  const names = uploads.map((file) => file.name.toLowerCase()).join(" ");
  const haystack = `${lower} ${names}`;
  const ext = uploads.map((file) => path.extname(file.name).toLowerCase());

  if (/commercial invoice|\bci[-_\s]|\bc\/i\b/.test(haystack)) {
    return { itemType: "Commercial Invoice", destination: "documents/trade-docs", confidence: 78 };
  }
  if (/packing list|\bpl[-_\s]|\bp\/l\b/.test(haystack)) {
    return { itemType: "Packing List", destination: "documents/trade-docs", confidence: 76 };
  }
  if (/proforma invoice|\bpi[-_\s]|payment terms|bank info/.test(haystack)) {
    return { itemType: "Proforma Invoice", destination: "quotations", confidence: 80 };
  }
  if (/quotation|quote|offer sheet|\bqt[-_\s]/.test(haystack)) {
    return { itemType: "Quotation", destination: "quotations", confidence: 78 };
  }
  if (/sample request|sample order|\bspl[-_\s]/.test(haystack)) {
    return { itemType: "Sample Request", destination: "documents", confidence: 72 };
  }
  if (/payment proof|payment notice|receipt|remittance|wire transfer|tt copy/.test(haystack)) {
    return { itemType: "Payment Proof", destination: "documents/payments", confidence: 72 };
  }
  if (/datasheet|specification|catalog|catalogue|model no|product sheet|technical drawing/.test(haystack)) {
    return { itemType: "Product Spec", destination: "documents/product-specs", confidence: 74 };
  }
  if (/lead list|prospect|company list|contact list/.test(haystack) || ext.some((item) => [".csv", ".xlsx", ".xls"].includes(item))) {
    return { itemType: "Lead List", destination: "leads/imports", confidence: ext.length ? 66 : 62 };
  }
  if (/reply|inquiry|enquiry|rfq|email thread|fwd:|re:/.test(haystack)) {
    return { itemType: "Customer Conversation", destination: "mail/context", confidence: 64 };
  }

  return { itemType: "Unclassified", destination: "intake/review", confidence: uploads.length || text ? 38 : 0 };
}

function isPdfUpload(file: File) {
  return file.type === "application/pdf" || path.extname(file.name || "").toLowerCase() === ".pdf";
}

function isProductDocSignal(name: string, message = "", pastedText = "") {
  return /(599-\d{2,3}|drawing|technical|spec|datasheet|catalog|catalogue|model no|product sheet)/i.test(`${name} ${message} ${pastedText}`);
}

function inferProcessingKind(file: File, message = "", pastedText = ""): IntakeUploadProcessing["kind"] {
  const name = file.name || "";
  const ext = path.extname(name).toLowerCase();
  const haystack = `${name} ${message} ${pastedText}`.toLowerCase();
  if (isPdfUpload(file) && isProductDocSignal(name, message, pastedText)) return "product_doc";
  if ([".csv", ".xlsx", ".xls"].includes(ext) || /lead list|prospect|company list|contact list/.test(haystack)) return "lead_list";
  if (/(commercial invoice|\bci[-_\s]|\bc\/i\b|packing list|\bpl[-_\s]|\bp\/l\b|proforma invoice|\bpi[-_\s])/.test(haystack)) return "trade_doc";
  return "unknown";
}

function formatMb(bytes: number) {
  return `${Math.ceil(bytes / (1024 * 1024))}MB`;
}

function declaredFileSize(file: File) {
  const size = Number(file.size || 0);
  return Number.isFinite(size) ? Math.max(0, size) : 0;
}

function validateUploadLimits(files: File[]) {
  for (const file of files.slice(0, MAX_FILES_PER_REQUEST)) {
    if (declaredFileSize(file) > MAX_FILE_SIZE) {
      throw Object.assign(new Error(`${file.name || "upload"} exceeds the 50MB intake limit.`), { status: 413 });
    }
  }
  const total = files.reduce((sum, file) => sum + declaredFileSize(file), 0);
  if (total > MAX_TOTAL_UPLOAD_SIZE) {
    throw Object.assign(new Error(`Total upload size ${formatMb(total)} exceeds the 150MB intake limit.`), { status: 413 });
  }
}

function analyzeRecord(runtime: SalesRuntime, record: IntakeRecord, latestMessage: string): IntakeAnalysis {
  const transcript = record.messages.map((message) => `${message.role}: ${message.content}`).join("\n");
  const uploadNames = record.uploads.map((file) => `${file.name} ${file.type}`).join("\n");
  const text = compactText(`${latestMessage}\n${record.pastedText}\n${uploadNames}\n${transcript}`);
  const detected = detectItemType(text, record.uploads);
  const terms = extractSearchTerms(text, record.uploads);
  const matches: IntakeMatch[] = runtime.memory.findIntakeMatches(record.project, terms);

  const bestMatch = matches[0];
  const relatedParty = bestMatch?.kind === "lead" || bestMatch?.kind === "quotation"
    ? bestMatch.title
    : "Unknown";
  const matchLift = bestMatch ? Math.min(16, Math.round(bestMatch.confidence / 8)) : 0;
  const confidence = Math.min(94, detected.confidence + matchLift);
  const evidence = [
    record.uploads.length ? `${record.uploads.length} uploaded file(s)` : "",
    latestMessage ? "operator context supplied in chat" : "",
    detected.itemType !== "Unclassified" ? `type signal: ${detected.itemType}` : "",
    bestMatch ? `strongest local match: ${bestMatch.title}` : "",
  ].filter(Boolean);

  return {
    source: "local",
    itemType: detected.itemType,
    destination: detected.destination,
    confidence,
    relatedParty,
    summary: detected.itemType === "Unclassified"
      ? "SSA has enough to preserve the item, but not enough to place it without review."
      : `SSA reads this as ${detected.itemType} and would keep it in ${detected.destination} after approval.`,
    evidence,
    matches,
    actions: [
      {
        id: "archive-original",
        label: "Keep original in intake archive",
        target: `~/.ssa/data/companies/${sanitizeSsaPathSegment(record.project)}/intake/uploads/${record.id}`,
        status: "ready",
      },
      {
        id: "link-context",
        label: relatedParty === "Unknown" ? "Hold for client matching" : `Link context to ${relatedParty}`,
        target: relatedParty === "Unknown" ? "manual review queue" : "local client context",
        status: relatedParty === "Unknown" ? "needs_review" : "approval_required",
      },
      {
        id: "place-file",
        label: `Propose placement in ${detected.destination}`,
        target: `~/.ssa/data/${detected.destination}`,
        status: confidence >= 70 ? "approval_required" : "needs_review",
      },
    ],
  };
}

async function askRuntimeLlm(runtime: SalesRuntime, record: IntakeRecord, localAnalysis: IntakeAnalysis): Promise<LlmResult> {
  return runtime.runLlm({
    task: "recommend",
    workspaceId: record.project,
    input: JSON.stringify({
      project: record.project,
      uploads: record.uploads.map((file) => ({ name: file.name, type: file.type, size: file.size })),
      pastedText: compactText(record.pastedText, 4000),
      recentMessages: record.messages.slice(-6),
      localAnalysis,
    }),
    context: {
      source: "intake",
      intakeId: record.id,
    },
  });
}

function localAssistantMessage(analysis: IntakeAnalysis) {
  const confidence = analysis.confidence ? `${analysis.confidence}%` : "low";
  const matchText = analysis.matches.length > 0
    ? ` Best local match: ${analysis.matches[0].title}.`
    : " I do not have a strong local match yet.";
  const productDocText = analysis.productDoc
    ? ` Product doc reader extracted ${analysis.productDoc.productName || "an unnamed product"} (${analysis.productDoc.drawingNo || "no drawing no"}) with ${analysis.productDoc.confidence}% confidence.`
    : "";
  return [
    `I saved this intake draft and ran local triage. Current read: ${analysis.itemType} with ${confidence} confidence.`,
    `Suggested destination: ${analysis.destination}.${matchText}`,
    productDocText,
    "I would keep this approval-gated until you confirm the client and placement.",
  ].join(" ");
}

async function storeUploads(runtime: SalesRuntime, record: IntakeRecord, files: File[], message = "", pastedText = ""): Promise<QueuedUploadProcessingTask[]> {
  if (files.length === 0) return [];
  validateUploadLimits(files);
  const uploadDir = ensureDir(ssaCompanyDataPath(record.project, "intake", "uploads", record.id));
  const queuedTasks: QueuedUploadProcessingTask[] = [];

  for (const file of files.slice(0, MAX_FILES_PER_REQUEST)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const effectiveSize = Math.max(buffer.length, declaredFileSize(file));
    if (effectiveSize > MAX_FILE_SIZE) {
      throw Object.assign(new Error(`${file.name || "upload"} exceeds the 50MB intake limit.`), { status: 413 });
    }
    const storedName = `${Date.now()}-${sanitizeSegment(file.name || "upload.bin")}`;
    const storedPath = path.join(uploadDir, storedName);
    const kind = inferProcessingKind(file, message, pastedText);
    const uploadId = makeId("file");
    const processing: IntakeUploadProcessing = {
      status: kind === "product_doc" ? "queued" : "saved",
      kind,
      updatedAt: nowIso(),
    };
    fs.writeFileSync(storedPath, buffer);
    record.uploads.push({
      id: uploadId,
      name: file.name || storedName,
      type: file.type || "application/octet-stream",
      size: effectiveSize,
      path: storedPath,
      storedAt: nowIso(),
      processing,
    });

    runtime.recordEvent("intake.file.saved", record.project, {
      intakeId: record.id,
      uploadId,
      fileName: file.name || storedName,
      size: effectiveSize,
      processingKind: kind,
    });

    if (kind === "product_doc") {
      queuedTasks.push({
        intakeId: record.id,
        uploadId,
        uploadPath: storedPath,
        kind,
      });
    }
  }

  return queuedTasks;
}

function enqueueUploadProcessing(runtime: SalesRuntime, record: IntakeRecord, tasks: QueuedUploadProcessingTask[]) {
  for (const task of tasks) {
    const job = runtime.workflows.enqueue(record.project, "intake.product_doc.process", {
      intakeId: task.intakeId,
      uploadId: task.uploadId,
      uploadPath: task.uploadPath,
    });
    runtime.recordEvent("intake.file.processing_queued", record.project, {
      intakeId: task.intakeId,
      uploadId: task.uploadId,
      jobId: job.id,
      kind: task.kind,
    });
  }
}

export function listIntakeSessions(project: string): IntakeSessionSummary[] {
  return readSessionRecords(project)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_INTAKE_SESSIONS)
    .map((record) => ({
      id: record.id,
      project: record.project,
      status: record.status,
      updatedAt: record.updatedAt,
      itemType: record.analysis.itemType,
      destination: record.analysis.destination,
      confidence: record.analysis.confidence,
      uploads: record.uploads.length,
      messages: record.messages.length,
    }));
}

export async function processIntake(runtime: SalesRuntime, input: IntakeInput): Promise<IntakeRecord> {
  let record = input.sessionId ? readRecord(input.project, input.sessionId) : null;
  if (!record) record = createRecord(input.project);

  const pastedText = input.pastedText || "";
  if (pastedText.trim()) record.pastedText = pastedText.slice(0, 200_000);

  const userMessage = (input.message || "").trim() || ((input.files || []).length > 0 ? "Uploaded file(s) for SSA intake." : "");
  const queuedProcessing = await storeUploads(runtime, record, input.files || [], userMessage, pastedText);

  if (userMessage) {
    record.messages.push({
      id: makeId("msg"),
      role: "user",
      content: userMessage.slice(0, 8000),
      createdAt: nowIso(),
    });
  }
  record.updatedAt = nowIso();
  writeRecord(record);

  const localAnalysis = analyzeRecord(runtime, record, userMessage);
  const llm = await askRuntimeLlm(runtime, record, localAnalysis);
  const assistantContent = llm.text || localAssistantMessage(localAnalysis);

  record.analysis = {
    ...localAnalysis,
    source: llm.source === "provider" ? "llm" : "local",
  };
  record.status = "pending_review";
  record.messages.push({
    id: makeId("msg"),
    role: "assistant",
    content: assistantContent,
    createdAt: nowIso(),
  });
  record.updatedAt = nowIso();
  writeRecord(record);
  enqueueUploadProcessing(runtime, record, queuedProcessing);
  pruneIntakeStorage(record.project);

  runtime.recordEvent("intake.processed", record.project, {
    intakeId: record.id,
    itemType: record.analysis.itemType,
    destination: record.analysis.destination,
    confidence: record.analysis.confidence,
    uploads: record.uploads.length,
    productDoc: record.analysis.productDoc ? {
      drawingNo: record.analysis.productDoc.drawingNo,
      modelNo: record.analysis.productDoc.modelNo,
      confidence: record.analysis.productDoc.confidence,
      needsReview: record.analysis.productDoc.needsReview,
    } : null,
    sideEffects: "blocked",
  });

  return record;
}

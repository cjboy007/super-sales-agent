import fs from "fs";
import path from "path";
import type { SalesRuntime } from "./sales-runtime";
import type { LlmResult } from "./types";
import { ensureDir, ensureSsaDataPath, ssaDataPath } from "../ssa-data-paths";

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

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 8;

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

function sessionPath(sessionId: string) {
  return ensureSsaDataPath("intake", "sessions", `${sanitizeSegment(sessionId)}.json`);
}

function readRecord(sessionId: string): IntakeRecord | null {
  try {
    const filePath = sessionPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as IntakeRecord;
  } catch {
    return null;
  }
}

function writeRecord(record: IntakeRecord) {
  fs.writeFileSync(sessionPath(record.id), JSON.stringify(record, null, 2), "utf-8");
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
        target: `~/.ssa/data/intake/uploads/${record.id}`,
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
  return [
    `I saved this intake draft and ran local triage. Current read: ${analysis.itemType} with ${confidence} confidence.`,
    `Suggested destination: ${analysis.destination}.${matchText}`,
    "I would keep this approval-gated until you confirm the client and placement.",
  ].join(" ");
}

async function storeUploads(record: IntakeRecord, files: File[]) {
  if (files.length === 0) return;
  const uploadDir = ensureDir(ssaDataPath("intake", "uploads", record.id));

  for (const file of files.slice(0, MAX_FILES_PER_REQUEST)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_FILE_SIZE) {
      throw Object.assign(new Error(`${file.name} exceeds the 25MB intake limit`), { status: 413 });
    }
    const storedName = `${Date.now()}-${sanitizeSegment(file.name || "upload.bin")}`;
    const storedPath = path.join(uploadDir, storedName);
    fs.writeFileSync(storedPath, buffer);
    record.uploads.push({
      id: makeId("file"),
      name: file.name || storedName,
      type: file.type || "application/octet-stream",
      size: buffer.length,
      path: storedPath,
      storedAt: nowIso(),
    });
  }
}

export function listIntakeSessions(): IntakeSessionSummary[] {
  const dir = ssaDataPath("intake", "sessions");
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
    .filter((record): record is IntakeRecord => Boolean(record))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
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
  let record = input.sessionId ? readRecord(input.sessionId) : null;
  if (!record) record = createRecord(input.project);

  const pastedText = input.pastedText || "";
  if (pastedText.trim()) record.pastedText = pastedText.slice(0, 200_000);

  await storeUploads(record, input.files || []);

  const userMessage = (input.message || "").trim() || ((input.files || []).length > 0 ? "Uploaded file(s) for SSA intake." : "");
  if (userMessage) {
    record.messages.push({
      id: makeId("msg"),
      role: "user",
      content: userMessage.slice(0, 8000),
      createdAt: nowIso(),
    });
  }

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

  runtime.recordEvent("intake.processed", record.project, {
    intakeId: record.id,
    itemType: record.analysis.itemType,
    destination: record.analysis.destination,
    confidence: record.analysis.confidence,
    uploads: record.uploads.length,
    sideEffects: "blocked",
  });

  return record;
}

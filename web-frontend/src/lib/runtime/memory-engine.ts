import fs from "fs";
import type {
  CustomerMemoryContext,
  MemoryAuthority,
  MemoryHit,
  MemoryRecord,
  MemorySearchInput,
  MemoryTimelineSummary,
  MemoryWriteInput,
  WorkspaceId,
} from "./types";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";

const MAX_RECORDS_PER_WORKSPACE = 5000;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "for",
  "from",
  "have",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "please",
  "re",
  "the",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

function recordsPath(workspaceId: WorkspaceId) {
  return ensureSsaCompanyDataPath(workspaceId, "memory", "records.json");
}

function nowIso() {
  return new Date().toISOString();
}

function makeMemoryId(workspaceId: WorkspaceId, kind: string) {
  return `mem-${workspaceId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function normalizeRecord(input: MemoryWriteInput): MemoryRecord {
  const now = nowIso();
  const source = input.source || { type: "operator" as const };
  return {
    id: makeMemoryId(input.workspaceId, input.kind || "fact"),
    workspaceId: input.workspaceId,
    kind: input.kind || "fact",
    customerId: cleanString(input.customerId),
    customerName: cleanString(input.customerName),
    subject: cleanString(input.subject),
    title: input.title.trim(),
    body: input.body.trim(),
    tags: uniqueStrings(input.tags || []),
    source,
    authority: input.authority || defaultAuthorityForSource(source.type),
    confidence: clampConfidence(input.confidence),
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
    idempotencyKey: cleanString(input.idempotencyKey),
  };
}

function defaultAuthorityForSource(sourceType: string): MemoryAuthority {
  if (sourceType === "operator" || sourceType === "system" || sourceType === "approval" || sourceType === "workflow") {
    return "authoritative";
  }
  if (sourceType === "llm" || sourceType === "openclaw" || sourceType === "hermes" || sourceType === "external-memory") {
    return "suggested";
  }
  return "imported";
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.85;
  return Math.max(0, Math.min(1, value));
}

function readRecords(workspaceId: WorkspaceId): MemoryRecord[] {
  return readJsonFile<MemoryRecord[]>(recordsPath(workspaceId), []);
}

function writeRecords(workspaceId: WorkspaceId, records: MemoryRecord[]) {
  fs.writeFileSync(recordsPath(workspaceId), JSON.stringify(records.slice(0, MAX_RECORDS_PER_WORKSPACE), null, 2), "utf-8");
}

function tokenize(value: string): string[] {
  return Array.from(new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9@._-]+/g, " ")
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 1 && !STOP_WORDS.has(term))
  ));
}

function haystack(record: MemoryRecord) {
  return [
    record.customerId,
    record.customerName,
    record.subject,
    record.title,
    record.body,
    record.tags.join(" "),
    record.source.type,
    record.source.id,
  ].filter(Boolean).join(" ").toLowerCase();
}

function scoreRecord(record: MemoryRecord, terms: string[], input: MemorySearchInput): MemoryHit | null {
  const text = haystack(record);
  const matchedTerms = terms.filter((term) => text.includes(term));
  const customerText = `${record.customerId || ""} ${record.customerName || ""}`.toLowerCase();
  const customerMatches = [
    input.customerId,
    input.customerName,
  ].filter((value): value is string => Boolean(value)).some((value) => customerText.includes(value.toLowerCase()));

  if (matchedTerms.length === 0 && !customerMatches) return null;

  const kindWeight = record.kind === "episode" ? 0.08 : 0;
  const customerWeight = customerMatches ? 0.3 : 0;
  const sourceWeight = record.source.type === "operator" ? 0.08 : 0;
  const authorityWeight = record.authority === "authoritative" ? 0.12 : record.authority === "imported" ? 0.04 : 0;
  const confidenceWeight = record.confidence * 0.15;
  const termWeight = terms.length > 0 ? matchedTerms.length / terms.length : 0;
  const score = Number(Math.min(1, termWeight + customerWeight + kindWeight + sourceWeight + authorityWeight + confidenceWeight).toFixed(4));

  return {
    ...record,
    score,
    matchedTerms,
    reason: matchedTerms.length > 0
      ? `Matched ${matchedTerms.slice(0, 5).join(", ")}`
      : "Matched customer scope",
  };
}

function recentFirst(a: MemoryRecord, b: MemoryRecord) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function riskFrom(record: MemoryRecord): string | null {
  const text = `${record.title} ${record.body} ${record.tags.join(" ")}`.toLowerCase();
  if (!/(risk|blocked|reject|rejected|complaint|margin|discount|overdue|urgent|competitor)/.test(text)) return null;
  return record.title;
}

function nextStepFrom(record: MemoryRecord): string | null {
  const explicit = record.metadata.recommendedNextStep;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (record.kind === "episode") return `Review episode: ${record.title}`;
  if (record.tags.includes("preference")) return `Apply known preference: ${record.title}`;
  return null;
}

function authorityRank(record: MemoryRecord): number {
  // SSA's audited ledger must outrank imported/suggested agent memories when relevance is tied.
  if (record.authority === "authoritative") return 3;
  if (record.authority === "imported") return 2;
  return 1;
}

export class MemoryEngine {
  write(input: MemoryWriteInput): MemoryRecord {
    if (!input.title.trim()) throw new Error("Memory title is required.");
    if (!input.body.trim()) throw new Error("Memory body is required.");

    const records = readRecords(input.workspaceId);
    if (input.idempotencyKey) {
      const existing = records.find((record) => record.idempotencyKey === input.idempotencyKey);
      if (existing) return existing;
    }

    const record = normalizeRecord(input);
    writeRecords(input.workspaceId, [record, ...records]);
    return record;
  }

  list(workspaceId: WorkspaceId, limit = 100): MemoryRecord[] {
    return readRecords(workspaceId).sort(recentFirst).slice(0, Math.max(1, Math.min(500, limit)));
  }

  search(input: MemorySearchInput): MemoryHit[] {
    const terms = tokenize([
      input.query,
      input.customerId,
      input.customerName,
    ].filter(Boolean).join(" "));
    const limit = Math.max(1, Math.min(50, input.limit || 10));
    return readRecords(input.workspaceId)
      .filter((record) => !input.kinds?.length || input.kinds.includes(record.kind))
      .filter((record) => !input.authorities?.length || input.authorities.includes(record.authority))
      .map((record) => scoreRecord(record, terms, input))
      .filter((hit): hit is MemoryHit => Boolean(hit))
      .sort((a, b) => b.score - a.score || authorityRank(b) - authorityRank(a) || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  summarizeTimeline(input: MemorySearchInput): MemoryTimelineSummary {
    const hits = this.search({ ...input, limit: Math.max(input.limit || 12, 12) });
    const recentRecords = hits.map(({ score, matchedTerms, reason, ...record }) => record).slice(0, 8);
    const openRisks = uniqueStrings(recentRecords.map(riskFrom).filter((item): item is string => Boolean(item))).slice(0, 5);
    const recommendedNextSteps = uniqueStrings(recentRecords.map(nextStepFrom).filter((item): item is string => Boolean(item))).slice(0, 5);
    const summary = recentRecords.length > 0
      ? recentRecords.slice(0, 4).map((record) => `${record.kind}: ${record.title}`).join(" | ")
      : "No local long-term memory records found for this customer yet.";

    return {
      workspaceId: input.workspaceId,
      query: input.query,
      customerId: input.customerId,
      customerName: input.customerName,
      summary,
      openRisks,
      recommendedNextSteps,
      recentRecords,
      updatedAt: nowIso(),
    };
  }

  buildCustomerContext(input: MemorySearchInput): CustomerMemoryContext {
    const facts = this.search({ ...input, kinds: ["fact"], limit: input.limit || 8 });
    const episodes = this.search({ ...input, kinds: ["episode"], limit: input.limit || 8 });
    const timeline = this.summarizeTimeline(input);

    return {
      workspaceId: input.workspaceId,
      query: input.query,
      customerId: input.customerId,
      customerName: input.customerName,
      facts,
      episodes,
      timeline,
      retrieval: {
        provider: "local-lexical",
        query: input.query,
        totalHits: facts.length + episodes.length,
      },
    };
  }

  clear(workspaceId?: WorkspaceId): void {
    if (!workspaceId) return;
    writeRecords(workspaceId, []);
  }
}

export function createMemoryEngine() {
  return new MemoryEngine();
}

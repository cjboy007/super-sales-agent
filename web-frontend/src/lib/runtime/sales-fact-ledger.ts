import crypto from "crypto";
import fs from "fs";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";
import type { SalesWorldFact, SalesWorldFactSource, SalesWorldFactType } from "./sales-world-model";
import type { WorkspaceId } from "./types";

export type SalesFactConflictStatus = "none" | "conflict" | "superseded";

export type SalesFactSourceType =
  | SalesWorldFactSource["type"]
  | "sales-fact-ledger"
  | "quotation-draft"
  | "price-memory"
  | "prospecting-packet"
  | "outbound-approval"
  | "document"
  | "system";

export interface SalesFactSourceRef {
  type: SalesFactSourceType;
  id?: string;
  path?: string;
  url?: string;
}

export interface CanonicalSalesFact {
  factId: string;
  workspaceId: WorkspaceId;
  type: SalesWorldFactType;
  subject: string;
  customerId?: string;
  customerName?: string;
  sourceRefs: SalesFactSourceRef[];
  confidence: number;
  occurredAt?: string;
  updatedAt: string;
  version: number;
  idempotencyKey: string;
  conflictStatus: SalesFactConflictStatus;
  supersedes?: string;
  supersededBy?: string;
  data: Record<string, unknown>;
}

export interface SalesFactWriteInput {
  type: SalesWorldFactType;
  subject: string;
  customerId?: string;
  customerName?: string;
  source?: SalesFactSourceRef;
  sourceRefs?: SalesFactSourceRef[];
  confidence?: number;
  occurredAt?: string;
  updatedAt?: string;
  idempotencyKey: string;
  supersedes?: string;
  data?: Record<string, unknown>;
}

export type CoreSalesFactWriteInput = Omit<SalesFactWriteInput, "type">;

interface SalesFactStore {
  version: 1;
  workspaceId: WorkspaceId;
  updatedAt: string;
  facts: CanonicalSalesFact[];
}

export function salesFactLedgerPath(workspaceId: WorkspaceId): string {
  return ensureSsaCompanyDataPath(workspaceId, "world-model", "sales-fact-ledger.json");
}

export function listSalesFacts(workspaceId: WorkspaceId, options: { includeSuperseded?: boolean } = {}): CanonicalSalesFact[] {
  return readSalesFactStore(workspaceId).facts
    .filter((fact) => fact.workspaceId === workspaceId)
    .filter((fact) => options.includeSuperseded || !fact.supersededBy)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.type.localeCompare(b.type) || a.factId.localeCompare(b.factId));
}

export function upsertSalesFact(workspaceId: WorkspaceId, input: SalesFactWriteInput): CanonicalSalesFact {
  const store = readSalesFactStore(workspaceId);
  const now = new Date().toISOString();
  const normalized = normalizeFactInput(workspaceId, input, now);
  const existingIndex = store.facts.findIndex((fact) =>
    fact.workspaceId === workspaceId &&
    fact.idempotencyKey === normalized.idempotencyKey &&
    !fact.supersededBy
  );

  if (existingIndex >= 0) {
    const existing = store.facts[existingIndex];
    const sourceRefs = mergeSourceRefs(existing.sourceRefs, normalized.sourceRefs);
    const comparableChanged = stableJson(comparableFact(existing)) !== stableJson(comparableFact(normalized));
    const sourceChanged = stableJson(existing.sourceRefs) !== stableJson(sourceRefs);
    if (comparableChanged || sourceChanged) {
      store.facts[existingIndex] = {
        ...existing,
        ...normalized,
        factId: existing.factId,
        version: comparableChanged ? existing.version + 1 : existing.version,
        sourceRefs,
        updatedAt: normalized.updatedAt || now,
        conflictStatus: existing.conflictStatus,
      };
    }
  } else {
    store.facts.push(normalized);
  }

  store.updatedAt = now;
  store.facts = recomputeConflicts(store.facts);
  writeSalesFactStore(workspaceId, store);

  const saved = store.facts.find((fact) =>
    fact.workspaceId === workspaceId &&
    fact.idempotencyKey === normalized.idempotencyKey &&
    !fact.supersededBy
  );
  if (!saved) throw new Error("Sales fact ledger write failed");
  return saved;
}

export function upsertCustomerAccountFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "customer.account" });
}

export function upsertContactFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "contact" });
}

export function upsertEmailInteractionFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "email.interaction" });
}

export function upsertLeadFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "lead" });
}

export function upsertRfqFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "rfq" });
}

export function upsertQuotationDraftFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "quotation" });
}

export function upsertPiOrderFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "pi.order" });
}

export function upsertPaymentMilestoneFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "payment.milestone" });
}

export function upsertShipmentMilestoneFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "shipment.milestone" });
}

export function upsertAfterSalesExceptionFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "after_sales.exception" });
}

export function upsertIntelligenceFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "customer.intelligence" });
}

export function upsertMemoryFact(workspaceId: WorkspaceId, input: CoreSalesFactWriteInput): CanonicalSalesFact {
  return upsertSalesFact(workspaceId, { ...input, type: "memory.record" });
}

export function salesFactToWorldFact(fact: CanonicalSalesFact): SalesWorldFact {
  const source = toWorldSource(fact.sourceRefs[0]) || { type: "sales-fact-ledger", id: fact.factId };
  const provenance = fact.sourceRefs.map(toWorldSource).filter((item): item is SalesWorldFactSource => Boolean(item));
  return {
    id: fact.factId,
    factId: fact.factId,
    workspaceId: fact.workspaceId,
    type: fact.type,
    subject: fact.subject,
    summary: summaryForFact(fact),
    customerId: fact.customerId,
    customerName: fact.customerName,
    occurredAt: fact.occurredAt,
    updatedAt: fact.updatedAt,
    source,
    confidence: fact.confidence,
    provenance: provenance.length ? provenance : [source],
    sourceRefs: fact.sourceRefs,
    idempotencyKey: fact.idempotencyKey,
    version: fact.version,
    conflictStatus: fact.conflictStatus,
    supersedes: fact.supersedes,
    supersededBy: fact.supersededBy,
    data: fact.data,
  };
}

function readSalesFactStore(workspaceId: WorkspaceId): SalesFactStore {
  const fallback: SalesFactStore = {
    version: 1,
    workspaceId,
    updatedAt: "",
    facts: [],
  };
  const store = readJsonFile<SalesFactStore>(salesFactLedgerPath(workspaceId), fallback);
  if (!store || !Array.isArray(store.facts)) return fallback;
  return {
    version: 1,
    workspaceId,
    updatedAt: cleanText(store.updatedAt),
    facts: store.facts.filter((fact) => fact && fact.workspaceId === workspaceId && typeof fact.idempotencyKey === "string"),
  };
}

function writeSalesFactStore(workspaceId: WorkspaceId, store: SalesFactStore): void {
  fs.writeFileSync(salesFactLedgerPath(workspaceId), JSON.stringify({
    version: 1,
    workspaceId,
    updatedAt: store.updatedAt,
    facts: store.facts.slice(0, 5000),
  }, null, 2), "utf-8");
}

function normalizeFactInput(workspaceId: WorkspaceId, input: SalesFactWriteInput, now: string): CanonicalSalesFact {
  const idempotencyKey = cleanText(input.idempotencyKey);
  if (!idempotencyKey) throw new Error("Sales fact idempotencyKey is required");
  const sourceRefs = mergeSourceRefs(input.source ? [input.source] : [], input.sourceRefs || []);
  return {
    factId: factIdFor(workspaceId, idempotencyKey),
    workspaceId,
    type: input.type,
    subject: cleanText(input.subject, input.type),
    customerId: cleanText(input.customerId) || undefined,
    customerName: cleanText(input.customerName) || undefined,
    sourceRefs: sourceRefs.length ? sourceRefs : [{ type: "system", id: idempotencyKey }],
    confidence: clampConfidence(input.confidence, 0.72),
    occurredAt: cleanText(input.occurredAt) || undefined,
    updatedAt: cleanText(input.updatedAt, now),
    version: 1,
    idempotencyKey,
    conflictStatus: "none",
    supersedes: cleanText(input.supersedes) || undefined,
    data: { ...(input.data || {}) },
  };
}

function recomputeConflicts(facts: CanonicalSalesFact[]): CanonicalSalesFact[] {
  const active = facts.filter((fact) => !fact.supersededBy);
  const conflictGroups = new Map<string, CanonicalSalesFact[]>();
  for (const fact of active) {
    const key = conflictKey(fact);
    const group = conflictGroups.get(key) || [];
    group.push(fact);
    conflictGroups.set(key, group);
  }

  const conflicts = new Map<string, string[]>();
  for (const group of conflictGroups.values()) {
    const signatures = new Set(group.map((fact) => stableJson(dataWithoutConflictMetadata(fact.data))));
    if (group.length > 1 && signatures.size > 1) {
      const ids = group.map((fact) => fact.factId).sort();
      for (const fact of group) conflicts.set(fact.factId, ids.filter((id) => id !== fact.factId));
    }
  }

  return facts.map((fact) => {
    if (fact.supersededBy) return { ...fact, conflictStatus: "superseded" };
    const conflictWith = conflicts.get(fact.factId);
    if (!conflictWith) {
      return {
        ...fact,
        conflictStatus: "none",
        data: dataWithoutConflictMetadata(fact.data),
      };
    }
    return {
      ...fact,
      conflictStatus: "conflict",
      data: {
        ...dataWithoutConflictMetadata(fact.data),
        reviewRequired: true,
        conflictWith,
      },
    };
  });
}

function comparableFact(fact: CanonicalSalesFact): Record<string, unknown> {
  return {
    type: fact.type,
    subject: fact.subject,
    customerId: fact.customerId || "",
    customerName: fact.customerName || "",
    confidence: fact.confidence,
    occurredAt: fact.occurredAt || "",
    supersedes: fact.supersedes || "",
    data: dataWithoutConflictMetadata(fact.data),
  };
}

function conflictKey(fact: CanonicalSalesFact): string {
  return [
    fact.workspaceId,
    fact.type,
    stablePart(fact.customerId || fact.customerName || "unknown-customer"),
    stablePart(fact.subject),
  ].join(":");
}

function dataWithoutConflictMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const { conflictWith: _conflictWith, conflictReason: _conflictReason, ...rest } = data;
  return rest;
}

function mergeSourceRefs(...groups: SalesFactSourceRef[][]): SalesFactSourceRef[] {
  const byKey = new Map<string, SalesFactSourceRef>();
  for (const source of groups.flat()) {
    const normalized = normalizeSourceRef(source);
    if (!normalized) continue;
    byKey.set(stableJson(normalized), normalized);
  }
  return Array.from(byKey.values()).sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
}

function normalizeSourceRef(source: SalesFactSourceRef | null | undefined): SalesFactSourceRef | null {
  if (!source || !source.type) return null;
  return {
    type: source.type,
    id: cleanText(source.id) || undefined,
    path: cleanText(source.path) || undefined,
    url: cleanText(source.url) || undefined,
  };
}

function toWorldSource(source: SalesFactSourceRef | undefined): SalesWorldFactSource | null {
  if (!source) return null;
  return {
    type: source.type,
    id: source.id,
    path: source.path,
    url: source.url,
  };
}

function summaryForFact(fact: CanonicalSalesFact): string {
  const summary = fact.data.summary;
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  const status = fact.data.status || fact.data.paymentStatus || fact.data.fulfillmentStatus;
  return [fact.subject, status].filter(Boolean).join(" | ");
}

function factIdFor(workspaceId: WorkspaceId, idempotencyKey: string): string {
  return `sales-fact-${hashStable(`${workspaceId}:${idempotencyKey}`).slice(0, 20)}`;
}

function hashStable(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stablePart(value: unknown): string {
  return cleanText(value, "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown";
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = sortDeep((value as Record<string, unknown>)[key]);
    return acc;
  }, {});
}

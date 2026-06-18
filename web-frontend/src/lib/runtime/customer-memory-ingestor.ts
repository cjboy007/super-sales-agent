import path from "path";
import {
  appendCustomerActivity,
  appendCustomerOrderActivity,
  readCustomerActivities,
  type CustomerActivityKind,
  type CustomerActivityRecord,
} from "./customer-activity";
import { companyIntelClientSlug, type CompanyIntelLeadInput } from "./company-intel";
import { upsertCustomerAccountsFromLeads } from "./customers";
import { searchMemoryIndex, upsertMemoryIndexRecord } from "./memory-index";
import type {
  MemoryAuthority,
  MemoryHit,
  MemoryRecord,
  MemorySource,
  MemoryWriteInput,
  WorkspaceAdapter,
  WorkspaceId,
} from "./types";

type LeadSearchResult = { data?: CompanyIntelLeadInput[] };

export interface CustomerMemoryRuntimeHost {
  getWorkspace(id?: WorkspaceId | null): WorkspaceAdapter;
  writeMemory(input: MemoryWriteInput): MemoryRecord | unknown;
  searchMemory?(input: {
    workspaceId: WorkspaceId;
    query: string;
    customerId?: string;
    customerName?: string;
    limit?: number;
  }): MemoryHit[];
  getCustomerMemoryContext?(input: {
    workspaceId: WorkspaceId;
    query: string;
    customerId?: string;
    customerName?: string;
    limit?: number;
  }): unknown;
  recordEvent(type: string, workspaceId: WorkspaceId, payload: Record<string, unknown>): unknown;
  memory?: {
    getLeads?: (
      workspaceId: string,
      params: { search?: string; page?: number; pageSize?: number }
    ) => LeadSearchResult;
  };
}

export interface CustomerAffiliationInput {
  workspaceId: WorkspaceId;
  email?: unknown;
  customerName?: unknown;
  contactName?: unknown;
  subject?: unknown;
  body?: unknown;
  text?: unknown;
  orderNumber?: unknown;
  documentNo?: unknown;
  filePath?: unknown;
  metadata?: Record<string, unknown>;
}

export interface CustomerAffiliationCandidate {
  customerId: string;
  customerName: string;
  contactEmail?: string;
  score: number;
  matchedSignals: string[];
}

export interface CustomerAffiliationResult {
  workspaceId: WorkspaceId;
  customerId?: string;
  customerName?: string;
  contactEmail?: string;
  confidence: number;
  matchedSignals: string[];
  ambiguous: boolean;
  candidates: CustomerAffiliationCandidate[];
}

export type CustomerInteractionDirection =
  | "inbound_email"
  | "outbound_email"
  | "inbox_reply_draft"
  | "inbox_reply_sent"
  | "operator_note"
  | "crm_write"
  | "document_requested"
  | "document_generated"
  | "order_update";

export interface CustomerMemoryInteractionInput extends CustomerAffiliationInput {
  direction: CustomerInteractionDirection;
  source: MemorySource;
  occurredAt?: unknown;
  idempotencyKey?: string;
  authority?: MemoryAuthority;
  confidence?: number;
  tags?: string[];
  writeActivity?: boolean;
}

export interface CustomerMemoryIngestResult {
  resolution: CustomerAffiliationResult;
  activity?: CustomerActivityRecord;
  memory?: MemoryRecord;
  reviewRequired: boolean;
  indexedDocumentRefs: string[];
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "qq.com",
  "163.com",
  "126.com",
]);

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function normalizeEmail(value: unknown): string {
  const raw = cleanText(value).toLowerCase();
  const match = raw.match(/<([^>]+)>/);
  const email = (match ? match[1] : raw).trim();
  return email.includes("@") ? email : "";
}

function emailDomain(value: unknown): string {
  const email = normalizeEmail(value);
  return email.includes("@") ? (email.split("@").pop() || "").replace(/^www\./i, "") : "";
}

function domainCompanyName(domain: string): string {
  const root = domain.replace(/^www\./i, "").split(".").filter(Boolean)[0] || domain;
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || domain || "Unknown Customer";
}

function normalizeKey(value: unknown): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeRef(value: unknown): string {
  return cleanText(value)
    .replace(/\s*#\s*/g, "-")
    .replace(/\s+/g, "-")
    .toUpperCase();
}

function documentRefsFromText(value: string): string[] {
  const refs = new Set<string>();
  const pattern = /\b(?:PI|QT|RFQ|PO)[-\s#]*[A-Z0-9][A-Z0-9-]*\b/gi;
  for (const match of value.matchAll(pattern)) refs.add(normalizeRef(match[0]));
  return Array.from(refs);
}

function combinedText(input: CustomerAffiliationInput): string {
  return [
    input.customerName,
    input.contactName,
    input.email,
    input.subject,
    input.body,
    input.text,
    input.orderNumber,
    input.documentNo,
    input.filePath,
    ...(input.metadata ? Object.values(input.metadata) : []),
  ].map((value) => cleanText(value)).filter(Boolean).join("\n");
}

function extractDocumentRefs(input: CustomerAffiliationInput): string[] {
  const refs = new Set<string>();
  for (const value of [input.orderNumber, input.documentNo]) {
    const ref = normalizeRef(value);
    if (ref) refs.add(ref);
  }
  for (const ref of documentRefsFromText(combinedText(input))) refs.add(ref);
  return Array.from(refs);
}

function addCandidate(
  candidates: Map<string, CustomerAffiliationCandidate>,
  input: {
    customerId: string;
    customerName: string;
    contactEmail?: string;
    score: number;
    signals: string[];
  }
) {
  const customerId = cleanText(input.customerId);
  const customerName = cleanText(input.customerName, customerId);
  if (!customerId || !customerName) return;
  const key = customerId.toLowerCase();
  const existing = candidates.get(key);
  if (existing) {
    existing.score += input.score;
    existing.matchedSignals = Array.from(new Set([...existing.matchedSignals, ...input.signals]));
    if (!existing.contactEmail && input.contactEmail) existing.contactEmail = input.contactEmail;
    return;
  }
  candidates.set(key, {
    customerId,
    customerName,
    contactEmail: input.contactEmail,
    score: input.score,
    matchedSignals: Array.from(new Set(input.signals)),
  });
}

function signalTextForActivity(activity: CustomerActivityRecord): string {
  return [
    activity.customerId,
    activity.customerName,
    activity.contactEmail,
    activity.contactName,
    activity.subject,
    activity.summary,
    activity.status,
    ...(activity.metadata ? Object.values(activity.metadata) : []),
  ].map((value) => cleanText(value)).filter(Boolean).join(" ").toLowerCase();
}

function seedCandidateFromEmail(candidates: Map<string, CustomerAffiliationCandidate>, input: CustomerAffiliationInput) {
  const email = normalizeEmail(input.email);
  const domain = emailDomain(email);
  if (!email) return;
  if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
    addCandidate(candidates, {
      customerId: domain,
      customerName: cleanText(input.customerName, domainCompanyName(domain)),
      contactEmail: email,
      score: 0.62,
      signals: [`email:${email}`, `domain:${domain}`],
    });
  } else {
    const fallbackName = cleanText(input.customerName, cleanText(input.contactName, email));
    addCandidate(candidates, {
      customerId: email,
      customerName: fallbackName,
      contactEmail: email,
      score: 0.48,
      signals: [`email:${email}`],
    });
  }
}

function addActivityCandidates(
  candidates: Map<string, CustomerAffiliationCandidate>,
  workspaceId: WorkspaceId,
  input: CustomerAffiliationInput,
  docRefs: string[]
) {
  const text = combinedText(input).toLowerCase();
  const normalizedText = normalizeKey(text);
  const explicitEmail = normalizeEmail(input.email);
  const explicitDomain = emailDomain(explicitEmail);
  const explicitName = normalizeKey(input.customerName);

  for (const activity of readCustomerActivities(workspaceId)) {
    const activityText = signalTextForActivity(activity);
    const activityEmail = normalizeEmail(activity.contactEmail);
    const activityDomain = emailDomain(activityEmail);
    const activityName = normalizeKey(activity.customerName);
    const signals: string[] = [];
    let score = 0;

    if (explicitEmail && activityEmail && explicitEmail === activityEmail) {
      score += 0.72;
      signals.push(`email:${explicitEmail}`);
    }
    if (explicitDomain && activityDomain && explicitDomain === activityDomain) {
      score += 0.56;
      signals.push(`domain:${explicitDomain}`);
    }
    if (explicitName && activityName && (explicitName.includes(activityName) || activityName.includes(explicitName))) {
      score += 0.58;
      signals.push(`customer:${activity.customerName}`);
    } else if (activityName && normalizedText.includes(activityName)) {
      score += 0.48;
      signals.push(`customer:${activity.customerName}`);
    }
    for (const ref of docRefs) {
      if (activityText.includes(ref.toLowerCase())) {
        score += 0.82;
        signals.push(`document:${ref}`);
      }
    }

    if (score > 0) {
      addCandidate(candidates, {
        customerId: activity.customerId,
        customerName: activity.customerName,
        contactEmail: activity.contactEmail,
        score,
        signals,
      });
    }
  }
}

function addLeadCandidates(
  host: CustomerMemoryRuntimeHost,
  candidates: Map<string, CustomerAffiliationCandidate>,
  workspaceId: WorkspaceId,
  input: CustomerAffiliationInput
) {
  const searchTerms = Array.from(new Set([
    cleanText(input.email),
    cleanText(input.customerName),
    emailDomain(input.email),
  ].filter(Boolean))).slice(0, 3);
  for (const term of searchTerms) {
    const leads = host.memory?.getLeads?.(workspaceId, { search: term, page: 1, pageSize: 8 }).data || [];
    for (const lead of leads) {
      const leadEmail = normalizeEmail(lead.email);
      const leadDomain = emailDomain(leadEmail || lead.homepage || "");
      const signals: string[] = [];
      let score = 0.26;
      if (leadEmail && normalizeEmail(input.email) === leadEmail) {
        score += 0.4;
        signals.push(`lead-email:${leadEmail}`);
      }
      if (leadDomain && leadDomain === emailDomain(input.email)) {
        score += 0.3;
        signals.push(`lead-domain:${leadDomain}`);
      }
      if (cleanText(lead.companyName) && normalizeKey(combinedText(input)).includes(normalizeKey(lead.companyName))) {
        score += 0.3;
        signals.push(`lead:${lead.companyName}`);
      }
      addCandidate(candidates, {
        customerId: companyIntelClientSlug(lead),
        customerName: cleanText(lead.companyName, cleanText(lead.email, "Unknown customer")),
        contactEmail: leadEmail,
        score,
        signals: signals.length ? signals : [`lead:${term}`],
      });
    }
  }
}

function addMemoryCandidates(
  host: CustomerMemoryRuntimeHost,
  candidates: Map<string, CustomerAffiliationCandidate>,
  workspaceId: WorkspaceId,
  input: CustomerAffiliationInput
) {
  if (!host.searchMemory) return;
  const query = [
    input.email,
    input.customerName,
    input.subject,
    input.documentNo,
    input.orderNumber,
  ].map((value) => cleanText(value)).filter(Boolean).join(" ");
  if (!query) return;

  for (const hit of host.searchMemory({ workspaceId, query, limit: 8 })) {
    if (!hit.customerId || !hit.customerName) continue;
    addCandidate(candidates, {
      customerId: hit.customerId,
      customerName: hit.customerName,
      score: Math.max(0.16, Math.min(0.42, hit.score * 0.42)),
      signals: [`memory:${hit.title}`],
    });
  }
}

function addIndexCandidates(
  candidates: Map<string, CustomerAffiliationCandidate>,
  workspaceId: WorkspaceId,
  input: CustomerAffiliationInput,
  docRefs: string[]
) {
  const terms = docRefs.length ? docRefs : [cleanText(input.customerName), cleanText(input.email)].filter(Boolean);
  if (terms.length === 0) return;
  try {
    for (const match of searchMemoryIndex(workspaceId, terms, 8)) {
      const customer = cleanText(match.metadata.customer);
      const email = normalizeEmail(match.metadata.email);
      if (!customer && !email) continue;
      const domain = emailDomain(email);
      addCandidate(candidates, {
        customerId: domain || normalizeKey(customer) || customer,
        customerName: customer || domainCompanyName(domain),
        contactEmail: email,
        score: 0.36 + Math.min(0.2, match.confidence / 500),
        signals: [`index:${match.title}`],
      });
    }
  } catch {
    // The index is an optimization layer; resolver still works from local records.
  }
}

function finalizeCandidates(workspaceId: WorkspaceId, candidates: Map<string, CustomerAffiliationCandidate>): CustomerAffiliationResult {
  const sorted = Array.from(candidates.values())
    .map((candidate) => ({
      ...candidate,
      score: Number(Math.min(0.98, candidate.score).toFixed(4)),
    }))
    .sort((a, b) => b.score - a.score || a.customerName.localeCompare(b.customerName));
  const top = sorted[0];
  const second = sorted[1];
  const confidence = top?.score || 0;
  const ambiguous = !top || confidence < 0.45 || Boolean(second && second.score >= 0.45 && confidence - second.score < 0.16);
  return {
    workspaceId,
    customerId: ambiguous ? undefined : top.customerId,
    customerName: ambiguous ? undefined : top.customerName,
    contactEmail: ambiguous ? undefined : top.contactEmail,
    confidence,
    matchedSignals: top?.matchedSignals || [],
    ambiguous,
    candidates: sorted.slice(0, 5),
  };
}

export function resolveCustomerAffiliation(
  host: CustomerMemoryRuntimeHost,
  input: CustomerAffiliationInput
): CustomerAffiliationResult {
  const workspace = host.getWorkspace(input.workspaceId);
  const candidates = new Map<string, CustomerAffiliationCandidate>();
  const docRefs = extractDocumentRefs(input);
  seedCandidateFromEmail(candidates, input);
  addActivityCandidates(candidates, workspace.id, input, docRefs);
  addLeadCandidates(host, candidates, workspace.id, input);
  addMemoryCandidates(host, candidates, workspace.id, input);
  addIndexCandidates(candidates, workspace.id, input, docRefs);
  if (candidates.size === 0 && cleanText(input.customerName)) {
    addCandidate(candidates, {
      customerId: normalizeKey(input.customerName) || cleanText(input.customerName),
      customerName: cleanText(input.customerName),
      score: 0.52,
      signals: [`explicit-customer:${cleanText(input.customerName)}`],
    });
  }
  return finalizeCandidates(workspace.id, candidates);
}

function directionLabel(direction: CustomerInteractionDirection): string {
  if (direction === "outbound_email") return "Outbound email";
  if (direction === "inbox_reply_sent") return "Inbox reply sent";
  if (direction === "inbox_reply_draft") return "Inbox reply draft";
  if (direction === "inbound_email") return "Inbound email";
  if (direction === "operator_note") return "Operator note";
  if (direction === "document_requested") return "Document request";
  if (direction === "document_generated") return "Document generated";
  if (direction === "order_update") return "Order update";
  return "CRM update";
}

function directionTags(direction: CustomerInteractionDirection): string[] {
  if (direction === "outbound_email") return ["outbound-email"];
  if (direction === "inbound_email") return ["inbound-email"];
  if (direction === "inbox_reply_sent") return ["inbox-reply", "outbound-email"];
  if (direction === "inbox_reply_draft") return ["inbox-reply", "draft"];
  if (direction === "operator_note") return ["operator-command"];
  if (direction === "document_requested" || direction === "document_generated") return ["document-progress"];
  if (direction === "order_update") return ["order-progress"];
  return ["crm-write"];
}

function activityKindFor(direction: CustomerInteractionDirection): CustomerActivityKind {
  if (direction === "inbound_email") return "email_received";
  if (direction === "outbound_email" || direction === "inbox_reply_sent") return "email_sent";
  if (direction === "order_update") return "order_status";
  return "crm_note";
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function defaultIdempotencyKey(input: CustomerMemoryInteractionInput, resolution: CustomerAffiliationResult): string {
  return [
    input.workspaceId,
    "customer-memory",
    input.direction,
    input.source.type,
    input.source.id || input.source.path || "",
    resolution.customerId || "unresolved",
    cleanText(input.subject),
    cleanText(input.occurredAt),
    stableHash(cleanText(input.body, cleanText(input.text))),
  ].join(":");
}

function summaryFor(input: CustomerMemoryInteractionInput): string {
  const body = cleanText(input.body, cleanText(input.text));
  const subject = cleanText(input.subject, directionLabel(input.direction));
  const refs = extractDocumentRefs(input);
  const suffix = body.replace(/\s+/g, " ").slice(0, 500);
  return [
    subject,
    refs.length ? `Refs: ${refs.join(", ")}` : "",
    suffix,
  ].filter(Boolean).join(" - ");
}

function buildActivity(
  input: CustomerMemoryInteractionInput,
  resolution: CustomerAffiliationResult,
  occurredAt: string,
  idempotencyKey: string
): CustomerActivityRecord {
  return {
    id: `memory:${stableHash(idempotencyKey)}`,
    workspaceId: resolution.workspaceId,
    customerId: resolution.customerId || "unknown-customer",
    customerName: resolution.customerName || "Unknown customer",
    kind: activityKindFor(input.direction),
    occurredAt,
    createdAt: new Date().toISOString(),
    contactName: cleanText(input.contactName),
    contactEmail: normalizeEmail(input.email) || resolution.contactEmail || "",
    subject: cleanText(input.subject, directionLabel(input.direction)),
    summary: summaryFor(input),
    status: input.direction.includes("draft") ? "drafted" : input.direction.includes("requested") ? "requested" : "recorded",
    source: input.source.type,
    metadata: {
      direction: input.direction,
      source: input.source,
      confidence: resolution.confidence,
      matchedSignals: resolution.matchedSignals,
      documentRefs: extractDocumentRefs(input),
    },
  };
}

function memoryAuthority(input: CustomerMemoryInteractionInput, resolution: CustomerAffiliationResult): MemoryAuthority {
  if (input.authority) return input.authority;
  if (resolution.ambiguous) return "suggested";
  if (input.source.type === "operator" || input.source.type === "approval") return "authoritative";
  return "imported";
}

function writeDocumentIndexRecords(
  workspaceId: WorkspaceId,
  input: CustomerMemoryInteractionInput,
  resolution: CustomerAffiliationResult,
  idempotencyKey: string
): string[] {
  const refs = extractDocumentRefs(input);
  const filePath = cleanText(input.filePath);
  if (!refs.length && !filePath) return [];
  const titleRefs = refs.length ? refs : [path.basename(filePath)];
  const indexed: string[] = [];
  for (const ref of titleRefs) {
    upsertMemoryIndexRecord({
      workspaceId,
      sourceKind: "document",
      sourceId: `${idempotencyKey}:${ref}`,
      kind: "document",
      title: ref,
      body: summaryFor(input),
      keywords: [
        ref,
        resolution.customerName || "",
        resolution.contactEmail || "",
        cleanText(input.subject),
      ].filter(Boolean),
      path: filePath || undefined,
      metadata: {
        customer: resolution.customerName || null,
        email: resolution.contactEmail || normalizeEmail(input.email) || null,
        documentNo: ref,
        direction: input.direction,
      },
    });
    indexed.push(ref);
  }
  return indexed;
}

function maybeUpsertCustomerAccount(workspaceId: WorkspaceId, input: CustomerMemoryInteractionInput, resolution: CustomerAffiliationResult) {
  if (!resolution.customerId || !resolution.customerName) return;
  const sourceType = input.source.type === "email" ? "email" : "lead";
  upsertCustomerAccountsFromLeads(workspaceId, [{
    companyName: resolution.customerName,
    contact: cleanText(input.contactName),
    email: normalizeEmail(input.email) || resolution.contactEmail || "",
    homepage: resolution.customerId.includes(".") ? `https://${resolution.customerId}` : "",
    category: "Customer Memory",
    reason: `${directionLabel(input.direction)} memory ingestion`,
    confidence: `${Math.round(resolution.confidence * 100)}%`,
    score: resolution.confidence >= 0.75 ? "Hot" : "Warm",
  }], {
    sourceType,
    importedAt: cleanText(input.occurredAt, new Date().toISOString()),
  });
}

function shouldWriteActivity(direction: CustomerInteractionDirection): boolean {
  return direction !== "inbox_reply_draft";
}

function shouldWriteOrderActivity(input: CustomerMemoryInteractionInput): boolean {
  if (input.direction !== "order_update") return false;
  return extractDocumentRefs(input).length > 0 || /payment|paid|shipment|shipped|delivered|refund|exception|order/i.test(summaryFor(input));
}

export function ingestCustomerInteraction(
  host: CustomerMemoryRuntimeHost,
  input: CustomerMemoryInteractionInput
): CustomerMemoryIngestResult {
  const workspace = host.getWorkspace(input.workspaceId);
  const resolution = resolveCustomerAffiliation(host, { ...input, workspaceId: workspace.id });
  const occurredAt = cleanText(input.occurredAt, new Date().toISOString());
  const idempotencyKey = input.idempotencyKey || defaultIdempotencyKey({ ...input, workspaceId: workspace.id }, resolution);
  const reviewRequired = resolution.ambiguous;
  const tags = Array.from(new Set([
    ...directionTags(input.direction),
    "customer-progress",
    ...(input.tags || []),
    ...(reviewRequired ? ["review-required", "ambiguous-customer"] : []),
  ]));

  let activity: CustomerActivityRecord | undefined;
  if (!reviewRequired && resolution.customerId && input.writeActivity !== false && shouldWriteActivity(input.direction)) {
    maybeUpsertCustomerAccount(workspace.id, input, resolution);
    if (shouldWriteOrderActivity(input)) {
      activity = appendCustomerOrderActivity({
        workspaceId: workspace.id,
        customerId: resolution.customerId,
        customerName: resolution.customerName,
        contactName: input.contactName,
        contactEmail: normalizeEmail(input.email) || resolution.contactEmail,
        orderNumber: cleanText(input.orderNumber, cleanText(input.documentNo, extractDocumentRefs(input)[0])),
        productType: input.metadata?.productType,
        amount: input.metadata?.amount,
        lifecycleStage: input.metadata?.lifecycleStage,
        paymentStatus: input.metadata?.paymentStatus,
        fulfillmentStatus: input.metadata?.fulfillmentStatus,
        status: input.metadata?.status,
        summary: summaryFor(input),
        occurredAt,
        source: input.source.type,
      });
    } else {
      activity = appendCustomerActivity(workspace.id, buildActivity(input, resolution, occurredAt, idempotencyKey));
    }
  }

  const titlePrefix = reviewRequired ? "Unresolved customer interaction" : directionLabel(input.direction);
  const memory = host.writeMemory({
    workspaceId: workspace.id,
    kind: "episode",
    customerId: reviewRequired ? undefined : resolution.customerId,
    customerName: reviewRequired ? undefined : resolution.customerName,
    subject: cleanText(input.subject, directionLabel(input.direction)),
    title: `${titlePrefix}: ${cleanText(input.subject, resolution.customerName || "customer context")}`,
    body: summaryFor(input),
    tags,
    source: input.source,
    authority: memoryAuthority(input, resolution),
    confidence: input.confidence ?? resolution.confidence,
    metadata: {
      direction: input.direction,
      occurredAt,
      reviewRequired,
      resolution: {
        confidence: resolution.confidence,
        matchedSignals: resolution.matchedSignals,
        candidates: resolution.candidates.map((candidate) => ({
          customerId: candidate.customerId,
          customerName: candidate.customerName,
          score: candidate.score,
          matchedSignals: candidate.matchedSignals,
        })),
      },
      documentRefs: extractDocumentRefs(input),
      original: {
        email: normalizeEmail(input.email) || null,
        customerName: cleanText(input.customerName) || null,
        contactName: cleanText(input.contactName) || null,
        filePath: cleanText(input.filePath) || null,
      },
    },
    idempotencyKey,
  }) as MemoryRecord;

  const indexedDocumentRefs = reviewRequired
    ? []
    : writeDocumentIndexRecords(workspace.id, input, resolution, idempotencyKey);

  host.recordEvent("customer.memory.ingested", workspace.id, {
    direction: input.direction,
    customerId: resolution.customerId || null,
    customerName: resolution.customerName || null,
    confidence: resolution.confidence,
    ambiguous: resolution.ambiguous,
    reviewRequired,
    activityId: activity?.id || null,
    memoryId: memory?.id || null,
    indexedDocumentRefs,
    sideEffects: "local-only",
  });

  return {
    resolution,
    activity,
    memory,
    reviewRequired,
    indexedDocumentRefs,
  };
}

import path from "path";
import { readJsonFile, ssaCompanyDataPath } from "../ssa-data-paths";
import { buildCustomerDirectory, type CustomerView } from "./customers";
import { listPiRecords, type PiRecord } from "./documents";
import { listPriceMemory, type PriceMemoryRecord } from "./price-memory";
import { listPersonalizedSalesDraftRuns, type PersonalizedSalesDraft } from "./product-quotation-drafts";
import {
  listSalesFacts,
  upsertAfterSalesExceptionFact,
  upsertContactFact,
  upsertCustomerAccountFact,
  upsertEmailInteractionFact,
  upsertIntelligenceFact,
  upsertMemoryFact,
  upsertPaymentMilestoneFact,
  upsertPiOrderFact,
  upsertQuotationDraftFact,
  upsertRfqFact,
  upsertSalesFact,
  upsertShipmentMilestoneFact,
  type CanonicalSalesFact,
} from "./sales-fact-ledger";
import type { MemoryRecord, WorkspaceId } from "./types";

type CustomerActivityKind =
  | "email_received"
  | "email_sent"
  | "follow_up_due"
  | "lifecycle_status"
  | "crm_note"
  | "order_status";

export interface LedgerCustomerActivityRecord {
  id: string;
  workspaceId: WorkspaceId;
  customerId: string;
  customerName: string;
  kind: CustomerActivityKind;
  occurredAt: string;
  createdAt: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  summary: string;
  status: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface SalesFactReplayResult {
  workspaceId: WorkspaceId;
  written: number;
  replayed: {
    customerDirectory: number;
    customerActivities: number;
    piRecords: number;
    priceMemory: number;
    memoryRecords: number;
    quotationDrafts: number;
  };
}

export interface LifecycleDraftInput {
  customerId?: string;
  customerName?: string;
  orderNo?: string;
}

export interface OrderPaymentLifecycleDraft {
  workspaceId: WorkspaceId;
  customerId?: string;
  customerName?: string;
  orderNo?: string;
  order: {
    status: "unknown" | "recorded" | "draft" | "conflict";
    verificationStatus: "unknown" | "unverified" | "confirmed";
  };
  payment: {
    status: "unknown" | "pending" | "partial" | "paid" | "overdue" | "refunded" | "conflict";
    verificationStatus: "unknown" | "unverified" | "confirmed";
  };
  shipment: {
    status: "unknown" | "preparing" | "shipped" | "delivered" | "exception" | "conflict";
    verificationStatus: "unknown" | "unverified" | "confirmed";
  };
  exception: {
    active: boolean;
    summary: string;
  };
  reviewRequired: boolean;
  recommendedOperatorAction: string;
  evidenceRefs: string[];
  authority: "draft_only_not_accounting_authority";
  updatedAt: string;
}

type RuntimeForReplay = {
  memory: {
    engine: {
      list(workspaceId: WorkspaceId, limit?: number): MemoryRecord[];
    };
  };
};

export function ingestCustomerActivityRecordToFactLedger(activity: LedgerCustomerActivityRecord): CanonicalSalesFact[] {
  const facts: CanonicalSalesFact[] = [];
  if (!activity || !activity.workspaceId || !activity.id) return facts;
  const source = { type: "customer-activity" as const, id: activity.id };
  const customerName = cleanText(activity.customerName, activity.contactEmail || activity.customerId || "Unknown customer");
  const customerId = cleanText(activity.customerId) || stablePart(customerName);
  const occurredAt = cleanText(activity.occurredAt, cleanText(activity.createdAt, new Date().toISOString()));
  const metadata = activity.metadata || {};

  facts.push(upsertCustomerAccountFact(activity.workspaceId, {
    subject: customerName,
    customerId,
    customerName,
    source,
    occurredAt,
    idempotencyKey: `${activity.workspaceId}:customer:${customerId}`,
    confidence: 0.78,
    data: {
      authority: "local_customer_activity_seed",
      sourceKind: activity.kind,
    },
  }));

  if (activity.contactEmail || activity.contactName) {
    const contactKey = cleanText(activity.contactEmail, activity.contactName || customerId).toLowerCase();
    facts.push(upsertContactFact(activity.workspaceId, {
      subject: cleanText(activity.contactName, activity.contactEmail || `${customerName} contact`),
      customerId,
      customerName,
      source,
      occurredAt,
      idempotencyKey: `${activity.workspaceId}:contact:${customerId}:${contactKey}`,
      confidence: 0.76,
      data: {
        name: cleanText(activity.contactName),
        email: cleanText(activity.contactEmail),
        authority: "local_customer_activity_seed",
      },
    }));
  }

  if (activity.kind === "email_received" || activity.kind === "email_sent") {
    facts.push(upsertEmailInteractionFact(activity.workspaceId, {
      subject: activity.subject || activity.kind,
      customerId,
      customerName,
      source,
      occurredAt,
      idempotencyKey: `${activity.workspaceId}:activity:${activity.id}:email`,
      confidence: 0.8,
      data: {
        summary: activity.summary,
        status: activity.status,
        direction: activity.kind,
        authority: "customer_activity",
        verificationStatus: "unverified",
      },
    }));
  }

  if (isRfqActivity(activity)) {
    facts.push(upsertRfqFact(activity.workspaceId, {
      subject: `RFQ signal for ${customerName}`,
      customerId,
      customerName,
      source,
      occurredAt,
      idempotencyKey: `${activity.workspaceId}:activity:${activity.id}:rfq`,
      confidence: 0.74,
      data: {
        summary: activity.summary,
        intent: metadata.intent || null,
        authority: "inferred_from_customer_activity",
        verificationStatus: "unverified",
        reviewRequired: true,
      },
    }));
  }

  if (activity.kind === "order_status") {
    facts.push(...ingestOrderActivityFacts(activity, customerId, customerName, source, occurredAt));
  }

  return facts;
}

export function ingestPiRecordToFactLedger(workspaceId: WorkspaceId, record: PiRecord): CanonicalSalesFact[] {
  const piNo = cleanText(record.piNo);
  if (!piNo) return [];
  const customerName = cleanText(record.customer, "Unknown customer");
  const source = { type: "pi-record" as const, id: piNo };
  return [
    upsertPiOrderFact(workspaceId, {
      subject: piNo,
      customerName,
      source,
      occurredAt: record.date,
      updatedAt: record.updatedAt,
      confidence: 0.9,
      idempotencyKey: `${workspaceId}:pi-record:${piNo}`,
      data: {
        ...record,
        orderNo: piNo,
        orderStatus: "recorded",
        authority: "document_record_not_payment_confirmation",
        paymentAuthority: "not_bank_confirmed",
        reviewRequired: false,
      } as unknown as Record<string, unknown>,
    }),
    upsertQuotationDraftFact(workspaceId, {
      subject: `${piNo} commercial terms`,
      customerName,
      source,
      occurredAt: record.date,
      updatedAt: record.updatedAt,
      confidence: 0.86,
      idempotencyKey: `${workspaceId}:pi-record:${piNo}:quotation-evidence`,
      data: {
        customer: record.customer,
        amount: record.amount,
        productSummary: record.productSummary,
        orderNo: piNo,
        authority: "historical_document_record",
        generatedNow: false,
        notAuthorityForPayment: true,
      },
    }),
  ];
}

export function ingestPriceMemoryRecordToFactLedger(record: PriceMemoryRecord): CanonicalSalesFact | null {
  if (!record || !record.workspaceId || !record.id) return null;
  return upsertSalesFact(record.workspaceId, {
    type: "quotation",
    subject: `${record.piNo || record.id} price reference`,
    customerName: record.customer,
    source: { type: "price-memory", id: record.id },
    occurredAt: record.date,
    updatedAt: record.updatedAt,
    confidence: 0.78,
    idempotencyKey: `${record.workspaceId}:price-memory:${record.id}`,
    data: {
      ...record,
      orderNo: record.piNo,
      authority: "price_reference_evidence",
      notAuthorityForPayment: true,
      notOfficialQuote: true,
    } as unknown as Record<string, unknown>,
  });
}

export function ingestMemoryRecordToFactLedger(record: MemoryRecord): CanonicalSalesFact | null {
  if (!record || !record.workspaceId || !record.id) return null;
  return upsertMemoryFact(record.workspaceId, {
    subject: record.title,
    customerId: record.customerId,
    customerName: record.customerName,
    source: { type: "memory", id: record.id },
    occurredAt: record.createdAt,
    updatedAt: record.updatedAt,
    confidence: record.confidence,
    idempotencyKey: record.idempotencyKey || `${record.workspaceId}:memory:${record.id}`,
    data: {
      ...record,
      authority: record.authority,
    } as unknown as Record<string, unknown>,
  });
}

export function ingestQuotationDraftToFactLedger(draft: PersonalizedSalesDraft): CanonicalSalesFact {
  return upsertQuotationDraftFact(draft.workspaceId, {
    subject: `Quotation draft for ${draft.candidate.companyName || draft.prospectingPacketId}`,
    customerName: draft.candidate.companyName,
    source: { type: "quotation-draft", id: draft.quotationDraft.id },
    occurredAt: draft.createdAt,
    updatedAt: draft.createdAt,
    confidence: draft.confidence,
    idempotencyKey: `${draft.workspaceId}:quotation-draft:${draft.quotationDraft.id}`,
    data: {
      prospectingPacketId: draft.prospectingPacketId,
      recommendedProducts: draft.recommendedProducts,
      quotationDraftLines: draft.quotationDraftLines,
      missingInfoChecklist: draft.missingInfoChecklist,
      riskFlags: draft.riskFlags,
      evidenceRefs: draft.evidenceRefs,
      draftOnly: true,
      dryRun: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      authority: "draft_only",
      reviewRequired: true,
    },
  });
}

export function replayWorkspaceSourcesToFactLedger(runtime: RuntimeForReplay, workspaceId: WorkspaceId): SalesFactReplayResult {
  const before = factFingerprints(workspaceId);
  const replayed = {
    customerDirectory: 0,
    customerActivities: 0,
    piRecords: 0,
    priceMemory: 0,
    memoryRecords: 0,
    quotationDrafts: 0,
  };

  try {
    const directory = buildCustomerDirectory(runtime as Parameters<typeof buildCustomerDirectory>[0], workspaceId, { page: 1, pageSize: 500 });
    for (const customer of directory.customers) {
      replayed.customerDirectory += ingestCustomerViewToFactLedger(workspaceId, customer);
    }
  } catch {
    // Replay is best-effort over local read models.
  }

  for (const activity of readActivityStore(workspaceId)) {
    replayed.customerActivities += ingestCustomerActivityRecordToFactLedger(activity).length;
  }

  for (const record of listPiRecords(workspaceId).records) {
    replayed.piRecords += ingestPiRecordToFactLedger(workspaceId, record).length;
  }

  for (const record of listPriceMemory(workspaceId)) {
    if (ingestPriceMemoryRecordToFactLedger(record)) replayed.priceMemory += 1;
  }

  for (const record of runtime.memory.engine.list(workspaceId, 5000)) {
    if (ingestMemoryRecordToFactLedger(record)) replayed.memoryRecords += 1;
  }

  for (const run of listPersonalizedSalesDraftRuns(workspaceId, 100)) {
    for (const draft of run.drafts || []) {
      ingestQuotationDraftToFactLedger(draft);
      replayed.quotationDrafts += 1;
    }
  }

  const after = factFingerprints(workspaceId);
  return {
    workspaceId,
    written: countChangedFacts(before, after),
    replayed,
  };
}

export function deriveOrderPaymentLifecycleDraft(workspaceId: WorkspaceId, input: LifecycleDraftInput = {}): OrderPaymentLifecycleDraft {
  const facts = listSalesFacts(workspaceId).filter((fact) => factMatchesLifecycleInput(fact, input));
  const orderFacts = facts.filter((fact) => fact.type === "pi.order" || fact.type === "quotation");
  const paymentFacts = facts.filter((fact) => fact.type === "payment.milestone");
  const shipmentFacts = facts.filter((fact) => fact.type === "shipment.milestone");
  const exceptionFacts = facts.filter((fact) => fact.type === "after_sales.exception");

  const payment = lifecycleStatus(paymentFacts, "paymentStatus", ["pending", "partial", "paid", "overdue", "refunded"]);
  const shipment = lifecycleStatus(shipmentFacts, "fulfillmentStatus", ["preparing", "shipped", "delivered", "exception"]);
  const orderConflict = orderFacts.some((fact) => fact.conflictStatus === "conflict");
  const reviewRequired = Boolean(
    orderConflict ||
    payment.status === "conflict" ||
    shipment.status === "conflict" ||
    payment.verificationStatus === "unverified" && payment.status !== "unknown" ||
    exceptionFacts.length > 0 ||
    facts.some((fact) => fact.data.reviewRequired === true)
  );

  return {
    workspaceId,
    customerId: input.customerId,
    customerName: input.customerName,
    orderNo: input.orderNo,
    order: {
      status: orderConflict ? "conflict" : orderFacts.length > 0 ? "recorded" : "unknown",
      verificationStatus: orderFacts.length > 0 ? "unverified" : "unknown",
    },
    payment: {
      status: payment.status as OrderPaymentLifecycleDraft["payment"]["status"],
      verificationStatus: payment.verificationStatus,
    },
    shipment: {
      status: shipment.status as OrderPaymentLifecycleDraft["shipment"]["status"],
      verificationStatus: shipment.verificationStatus,
    },
    exception: {
      active: exceptionFacts.length > 0,
      summary: exceptionFacts.map((fact) => cleanText(fact.data.summary, fact.subject)).filter(Boolean).slice(0, 3).join(" | "),
    },
    reviewRequired,
    recommendedOperatorAction: recommendedOperatorAction({
      paymentStatus: payment.status,
      shipmentStatus: shipment.status,
      exceptionCount: exceptionFacts.length,
      reviewRequired,
    }),
    evidenceRefs: facts.map((fact) => fact.factId).filter(Boolean),
    authority: "draft_only_not_accounting_authority",
    updatedAt: new Date().toISOString(),
  };
}

function ingestOrderActivityFacts(
  activity: LedgerCustomerActivityRecord,
  customerId: string,
  customerName: string,
  source: { type: "customer-activity"; id: string },
  occurredAt: string
): CanonicalSalesFact[] {
  const facts: CanonicalSalesFact[] = [];
  const metadata = activity.metadata || {};
  const orderNo = cleanText(metadata.orderNumber, activity.subject);
  const lifecycleStage = cleanText(metadata.lifecycleStage, activity.status);
  const paymentStatus = cleanText(metadata.paymentStatus);
  const fulfillmentStatus = cleanText(metadata.fulfillmentStatus);
  const amount = cleanText(metadata.amount);
  const productType = cleanText(metadata.productType);
  const orderSubject = orderNo || `${customerName} order`;

  facts.push(upsertPiOrderFact(activity.workspaceId, {
    subject: orderSubject,
    customerId,
    customerName,
    source,
    occurredAt,
    idempotencyKey: `${activity.workspaceId}:activity:${activity.id}:order`,
    confidence: 0.78,
    data: {
      orderNo,
      orderType: metadata.orderType || "Order",
      productType,
      amount,
      lifecycleStage,
      status: activity.status,
      summary: activity.summary,
      authority: "inferred_from_customer_activity",
      verificationStatus: "unverified",
      reviewRequired: true,
    },
  }));

  if (paymentStatus && paymentStatus !== "not_started") {
    facts.push(upsertPaymentMilestoneFact(activity.workspaceId, {
      subject: `${orderSubject} payment`,
      customerId,
      customerName,
      source,
      occurredAt,
      idempotencyKey: `${activity.workspaceId}:activity:${activity.id}:payment`,
      confidence: 0.76,
      data: {
        orderNo,
        amount,
        paymentStatus,
        summary: activity.summary,
        authority: "inferred_from_customer_activity",
        verificationStatus: "unverified",
        reviewRequired: true,
      },
    }));
  }

  if (fulfillmentStatus && fulfillmentStatus !== "not_started") {
    facts.push(upsertShipmentMilestoneFact(activity.workspaceId, {
      subject: `${orderSubject} shipment`,
      customerId,
      customerName,
      source,
      occurredAt,
      idempotencyKey: `${activity.workspaceId}:activity:${activity.id}:shipment`,
      confidence: 0.74,
      data: {
        orderNo,
        fulfillmentStatus,
        summary: activity.summary,
        authority: "inferred_from_customer_activity",
        verificationStatus: "unverified",
        reviewRequired: fulfillmentStatus === "exception",
      },
    }));
  }

  if (
    lifecycleStage === "exception" ||
    lifecycleStage === "after_sales" ||
    lifecycleStage === "refund" ||
    paymentStatus === "overdue" ||
    paymentStatus === "refunded" ||
    fulfillmentStatus === "exception"
  ) {
    facts.push(upsertAfterSalesExceptionFact(activity.workspaceId, {
      subject: `${orderSubject} exception`,
      customerId,
      customerName,
      source,
      occurredAt,
      idempotencyKey: `${activity.workspaceId}:activity:${activity.id}:exception`,
      confidence: 0.78,
      data: {
        orderNo,
        lifecycleStage,
        paymentStatus,
        fulfillmentStatus,
        summary: activity.summary,
        authority: "inferred_from_customer_activity",
        verificationStatus: "unverified",
        reviewRequired: true,
      },
    }));
  }

  return facts;
}

function ingestCustomerViewToFactLedger(workspaceId: WorkspaceId, customer: CustomerView): number {
  let written = 0;
  upsertCustomerAccountFact(workspaceId, {
    subject: customer.companyName,
    customerId: customer.id,
    customerName: customer.companyName,
    source: { type: "customer-directory", id: customer.id },
    updatedAt: customer.updatedAt,
    confidence: 0.88,
    idempotencyKey: `${workspaceId}:customer:${customer.id}`,
    data: {
      country: customer.country,
      website: customer.website,
      domain: customer.domain,
      industry: customer.industry,
      status: customer.status,
      authority: "customer_directory",
    },
  });
  written += 1;

  for (const contact of customer.contacts || []) {
    const key = contact.email || `${customer.id}:${contact.name}:${contact.role}`;
    upsertContactFact(workspaceId, {
      subject: contact.name || contact.email || `${customer.companyName} contact`,
      customerId: customer.id,
      customerName: customer.companyName,
      source: { type: "customer-contact", id: key },
      updatedAt: customer.updatedAt,
      confidence: 0.82,
      idempotencyKey: `${workspaceId}:contact:${customer.id}:${key}`,
      data: {
        ...contact,
        authority: "customer_directory",
      },
    });
    written += 1;
  }

  upsertIntelligenceFact(workspaceId, {
    subject: `${customer.companyName} intelligence`,
    customerId: customer.id,
    customerName: customer.companyName,
    source: { type: "customer-intelligence", id: customer.id },
    updatedAt: customer.intelligence.generatedAt || customer.updatedAt,
    confidence: customer.intelligence.status === "ready" ? 0.82 : 0.55,
    idempotencyKey: `${workspaceId}:customer-intelligence:${customer.id}`,
    data: {
      ...customer.intelligence,
      authority: "customer_directory",
    },
  });
  written += 1;
  return written;
}

function readActivityStore(workspaceId: WorkspaceId): LedgerCustomerActivityRecord[] {
  return readJsonFile<LedgerCustomerActivityRecord[]>(path.join(ssaCompanyDataPath(workspaceId, "customers"), "activity.json"), [])
    .filter((activity) => activity && activity.workspaceId === workspaceId);
}

function isRfqActivity(activity: LedgerCustomerActivityRecord): boolean {
  const text = `${activity.subject} ${activity.summary} ${activity.status} ${activity.metadata?.intent || ""}`.toLowerCase();
  return /\b(rfq|quote|quotation|pricing|price|inquiry)\b/.test(text);
}

function factMatchesLifecycleInput(fact: CanonicalSalesFact, input: LifecycleDraftInput): boolean {
  if (input.customerId && fact.customerId !== input.customerId) return false;
  if (input.customerName && cleanText(fact.customerName).toLowerCase() !== cleanText(input.customerName).toLowerCase()) return false;
  if (input.orderNo) {
    const orderNo = cleanText(input.orderNo).toLowerCase();
    const factOrder = cleanText(fact.data.orderNo || fact.data.piNo || fact.data.documentNo).toLowerCase();
    const subject = fact.subject.toLowerCase();
    if (factOrder !== orderNo && !subject.includes(orderNo)) return false;
  }
  return true;
}

function lifecycleStatus(
  facts: CanonicalSalesFact[],
  field: string,
  allowed: string[]
): { status: string; verificationStatus: "unknown" | "unverified" | "confirmed" } {
  if (facts.length === 0) return { status: "unknown", verificationStatus: "unknown" };
  if (facts.some((fact) => fact.conflictStatus === "conflict")) {
    return { status: "conflict", verificationStatus: verificationStatusFor(facts) };
  }
  const statuses = Array.from(new Set(facts.map((fact) => cleanText(fact.data[field])).filter(Boolean)));
  const validStatuses = statuses.filter((status) => allowed.includes(status));
  if (validStatuses.length > 1) return { status: "conflict", verificationStatus: verificationStatusFor(facts) };
  const latest = facts.slice().sort((a, b) => b.occurredAt?.localeCompare(a.occurredAt || "") || b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    status: validStatuses[0] || cleanText(latest.data[field], "unknown"),
    verificationStatus: verificationStatusFor(facts),
  };
}

function verificationStatusFor(facts: CanonicalSalesFact[]): "unknown" | "unverified" | "confirmed" {
  if (facts.length === 0) return "unknown";
  if (facts.every((fact) => fact.data.verificationStatus === "confirmed")) return "confirmed";
  return "unverified";
}

function recommendedOperatorAction(input: {
  paymentStatus: string;
  shipmentStatus: string;
  exceptionCount: number;
  reviewRequired: boolean;
}): string {
  if (input.paymentStatus === "conflict") return "Review conflicting payment evidence before updating any order or finance status.";
  if (input.shipmentStatus === "conflict") return "Review conflicting shipment evidence before updating the customer timeline.";
  if (input.exceptionCount > 0) return "Review exception evidence and decide the next customer follow-up manually.";
  if (input.paymentStatus === "paid") return "Verify payment against bank or finance records before marking payment confirmed.";
  if (input.paymentStatus === "overdue") return "Review overdue payment evidence and prepare a human-approved follow-up.";
  if (input.reviewRequired) return "Review unverified lifecycle evidence before taking customer-visible action.";
  return "No verified lifecycle action is ready; keep monitoring local evidence.";
}

function factFingerprints(workspaceId: WorkspaceId): Map<string, string> {
  return new Map(listSalesFacts(workspaceId).map((fact) => [fact.idempotencyKey, stableJson({
    version: fact.version,
    conflictStatus: fact.conflictStatus,
    data: fact.data,
    sourceRefs: fact.sourceRefs,
  })]));
}

function countChangedFacts(before: Map<string, string>, after: Map<string, string>): number {
  let count = 0;
  for (const [key, fingerprint] of after) {
    if (before.get(key) !== fingerprint) count += 1;
  }
  return count;
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

function stablePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

import type { Lead } from "../leads";
import type { Quotation } from "../quotations";
import type {
  CustomerInteractionView,
  CustomerOrderView,
  CustomerView,
} from "./customers";
import { buildCustomerDirectory } from "./customers";
import type { PiRecord } from "./documents";
import type { SalesRuntime } from "./sales-runtime";
import type { MemoryRecord, WorkspaceAdapter, WorkspaceId } from "./types";
import { listSalesFacts, salesFactToWorldFact, type SalesFactConflictStatus, type SalesFactSourceRef } from "./sales-fact-ledger";

export type SalesWorldFactType =
  | "workspace"
  | "customer.account"
  | "contact"
  | "email.interaction"
  | "lead"
  | "quotation"
  | "rfq"
  | "pi.order"
  | "payment.milestone"
  | "shipment.milestone"
  | "after_sales.exception"
  | "customer.intelligence"
  | "memory.record";

export interface SalesWorldFactSource {
  type:
    | "workspace"
    | "customer-directory"
    | "customer-contact"
    | "customer-activity"
    | "lead"
    | "quotation"
    | "pi-record"
    | "customer-intelligence"
    | "memory"
    | "sales-fact-ledger"
    | "quotation-draft"
    | "price-memory"
    | "prospecting-packet"
    | "outbound-approval"
    | "document"
    | "system";
  id?: string;
  path?: string;
  url?: string;
}

export interface SalesWorldFact {
  id: string;
  factId?: string;
  workspaceId: WorkspaceId;
  type: SalesWorldFactType;
  subject: string;
  summary: string;
  customerId?: string;
  customerName?: string;
  occurredAt?: string;
  updatedAt: string;
  source: SalesWorldFactSource;
  confidence: number;
  provenance: SalesWorldFactSource[];
  sourceRefs?: SalesFactSourceRef[];
  idempotencyKey: string;
  version?: number;
  conflictStatus?: SalesFactConflictStatus;
  supersedes?: string;
  supersededBy?: string;
  data: Record<string, unknown>;
}

export interface SalesWorldModelCoverage {
  factTypes: SalesWorldFactType[];
  customerCount: number;
  factCount: number;
  generatedFrom: string[];
}

export interface SalesWorldModel {
  workspaceId: WorkspaceId;
  generatedAt: string;
  coverage: SalesWorldModelCoverage;
  facts: SalesWorldFact[];
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampConfidence(value: unknown, fallback = 0.82): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function stablePart(value: unknown): string {
  return cleanText(value, "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown";
}

function makeFactId(workspaceId: WorkspaceId, type: SalesWorldFactType, key: string): string {
  return `fact-${stablePart(workspaceId)}-${stablePart(type)}-${stablePart(key)}`;
}

function fact(input: Omit<SalesWorldFact, "id" | "provenance"> & { provenance?: SalesWorldFactSource[] }): SalesWorldFact {
  const provenance = input.provenance?.length ? input.provenance : [input.source];
  return {
    ...input,
    id: makeFactId(input.workspaceId, input.type, input.idempotencyKey),
    confidence: clampConfidence(input.confidence),
    provenance,
  };
}

function addFact(facts: Map<string, SalesWorldFact>, input: Omit<SalesWorldFact, "id" | "provenance"> & { provenance?: SalesWorldFactSource[] }) {
  const next = fact(input);
  const key = `${next.type}:${next.idempotencyKey}`;
  const existing = facts.get(key);
  if (!existing || existing.confidence < next.confidence || existing.updatedAt < next.updatedAt) {
    facts.set(key, next);
  }
}

function customerSource(customer: CustomerView): SalesWorldFactSource {
  return { type: "customer-directory", id: customer.id };
}

function addWorkspaceFact(facts: Map<string, SalesWorldFact>, workspace: WorkspaceAdapter, generatedAt: string) {
  addFact(facts, {
    workspaceId: workspace.id,
    type: "workspace",
    subject: workspace.name,
    summary: `${workspace.name} runtime workspace for ${workspace.industry || "sales operations"}.`,
    updatedAt: generatedAt,
    source: { type: "workspace", id: workspace.id },
    confidence: 1,
    idempotencyKey: `${workspace.id}:workspace`,
    data: {
      name: workspace.name,
      brandName: workspace.brandName,
      industry: workspace.industry,
      packs: workspace.packs,
      capabilities: workspace.capabilities,
    },
  });
}

function addCustomerFacts(facts: Map<string, SalesWorldFact>, workspaceId: WorkspaceId, customer: CustomerView) {
  const source = customerSource(customer);
  addFact(facts, {
    workspaceId,
    type: "customer.account",
    subject: customer.companyName,
    summary: `${customer.companyName} is ${customer.status}. ${customer.sourceSummary}`.trim(),
    customerId: customer.id,
    customerName: customer.companyName,
    updatedAt: customer.updatedAt,
    source,
    confidence: 0.9,
    idempotencyKey: `${workspaceId}:customer:${customer.id}`,
    data: {
      country: customer.country,
      website: customer.website,
      domain: customer.domain,
      industry: customer.industry,
      status: customer.status,
      statusExplanation: customer.statusExplanation,
      nextActions: customer.nextActions,
    },
  });

  for (const contact of customer.contacts) {
    const contactKey = contact.email || `${customer.id}:${contact.name}:${contact.role}`;
    addFact(facts, {
      workspaceId,
      type: "contact",
      subject: contact.name || contact.email || `${customer.companyName} contact`,
      summary: `${contact.name || contact.email} ${contact.role ? `(${contact.role})` : ""}`.trim(),
      customerId: customer.id,
      customerName: customer.companyName,
      updatedAt: customer.updatedAt,
      source: { type: "customer-contact", id: contactKey },
      confidence: 0.86,
      provenance: [source, { type: "customer-contact", id: contactKey }],
      idempotencyKey: `${workspaceId}:contact:${customer.id}:${contactKey}`,
      data: contact as unknown as Record<string, unknown>,
    });
  }

  addFact(facts, {
    workspaceId,
    type: "customer.intelligence",
    subject: `${customer.companyName} intelligence`,
    summary: [
      customer.intelligence.completenessLabel,
      customer.intelligence.companySummary,
      customer.intelligence.productFit,
      customer.intelligence.riskSummary,
    ].filter(Boolean).join(" | "),
    customerId: customer.id,
    customerName: customer.companyName,
    updatedAt: customer.intelligence.generatedAt || customer.updatedAt,
    source: { type: "customer-intelligence", id: customer.id },
    confidence: customer.intelligence.status === "ready" ? 0.82 : 0.55,
    provenance: [source, { type: "customer-intelligence", id: customer.id }],
    idempotencyKey: `${workspaceId}:customer-intelligence:${customer.id}`,
    data: customer.intelligence as unknown as Record<string, unknown>,
  });
}

function isRfqInteraction(interaction: CustomerInteractionView): boolean {
  return /\b(rfq|quote|quotation|pricing|price|inquiry)\b/i.test(`${interaction.type} ${interaction.summary}`);
}

function addInteractionFact(
  facts: Map<string, SalesWorldFact>,
  workspaceId: WorkspaceId,
  customer: CustomerView,
  interaction: CustomerInteractionView,
  index: number
) {
  const source: SalesWorldFactSource = {
    type: "customer-activity",
    id: `${customer.id}:${interaction.date}:${interaction.type}:${index}`,
  };
  const base = {
    workspaceId,
    subject: interaction.type,
    summary: interaction.summary,
    customerId: customer.id,
    customerName: customer.companyName,
    occurredAt: interaction.date,
    updatedAt: interaction.date || customer.updatedAt,
    source,
    confidence: 0.78,
    provenance: [customerSource(customer), source],
    data: interaction as unknown as Record<string, unknown>,
  };

  if (interaction.type === "Email" || interaction.type === "Follow-up") {
    addFact(facts, {
      ...base,
      type: "email.interaction",
      idempotencyKey: `${workspaceId}:interaction:${source.id}:email`,
    });
  }
  if (isRfqInteraction(interaction)) {
    addFact(facts, {
      ...base,
      type: "rfq",
      subject: `RFQ signal for ${customer.companyName}`,
      confidence: 0.72,
      idempotencyKey: `${workspaceId}:interaction:${source.id}:rfq`,
    });
  }
  if (interaction.type === "Quote") {
    addFact(facts, {
      ...base,
      type: "quotation",
      idempotencyKey: `${workspaceId}:interaction:${source.id}:quotation`,
    });
  }
  if (interaction.type === "Order") {
    addFact(facts, {
      ...base,
      type: "pi.order",
      idempotencyKey: `${workspaceId}:interaction:${source.id}:order`,
    });
  }
  if (interaction.type === "Payment") {
    addFact(facts, {
      ...base,
      type: "payment.milestone",
      idempotencyKey: `${workspaceId}:interaction:${source.id}:payment`,
    });
  }
  if (interaction.type === "Shipment") {
    addFact(facts, {
      ...base,
      type: "shipment.milestone",
      idempotencyKey: `${workspaceId}:interaction:${source.id}:shipment`,
    });
  }
  if (interaction.type === "After-sales" || interaction.type === "Refund" || interaction.type === "Exception") {
    addFact(facts, {
      ...base,
      type: "after_sales.exception",
      idempotencyKey: `${workspaceId}:interaction:${source.id}:after-sales`,
    });
  }
}

function addOrderFact(facts: Map<string, SalesWorldFact>, workspaceId: WorkspaceId, customer: CustomerView, order: CustomerOrderView, index: number) {
  const source: SalesWorldFactSource = {
    type: "customer-directory",
    id: `${customer.id}:order:${order.type}:${order.date}:${index}`,
  };
  const type: SalesWorldFactType = order.type === "QT" ? "quotation" : "pi.order";
  const idempotencyBase = `${workspaceId}:order:${customer.id}:${order.type}:${order.date}:${order.productType}:${order.amount}`;

  addFact(facts, {
    workspaceId,
    type,
    subject: `${order.type} for ${customer.companyName}`,
    summary: `${order.productType} ${order.amount} ${order.status}`.trim(),
    customerId: customer.id,
    customerName: customer.companyName,
    occurredAt: order.date,
    updatedAt: order.date || customer.updatedAt,
    source,
    confidence: 0.83,
    provenance: [customerSource(customer), source],
    idempotencyKey: idempotencyBase,
    data: order as unknown as Record<string, unknown>,
  });

  if (order.lifecycle.paymentStatus && order.lifecycle.paymentStatus !== "not_started") {
    addFact(facts, {
      workspaceId,
      type: "payment.milestone",
      subject: `${order.lifecycle.paymentStatus} payment for ${customer.companyName}`,
      summary: `${order.type} payment status: ${order.lifecycle.paymentStatus}. ${order.lifecycle.nextStep}`,
      customerId: customer.id,
      customerName: customer.companyName,
      occurredAt: order.date,
      updatedAt: order.date || customer.updatedAt,
      source,
      confidence: 0.8,
      provenance: [customerSource(customer), source],
      idempotencyKey: `${idempotencyBase}:payment:${order.lifecycle.paymentStatus}`,
      data: order.lifecycle as unknown as Record<string, unknown>,
    });
  }

  if (order.lifecycle.fulfillmentStatus && order.lifecycle.fulfillmentStatus !== "not_started") {
    addFact(facts, {
      workspaceId,
      type: "shipment.milestone",
      subject: `${order.lifecycle.fulfillmentStatus} shipment for ${customer.companyName}`,
      summary: `${order.type} fulfillment status: ${order.lifecycle.fulfillmentStatus}. ${order.lifecycle.nextStep}`,
      customerId: customer.id,
      customerName: customer.companyName,
      occurredAt: order.date,
      updatedAt: order.date || customer.updatedAt,
      source,
      confidence: 0.8,
      provenance: [customerSource(customer), source],
      idempotencyKey: `${idempotencyBase}:shipment:${order.lifecycle.fulfillmentStatus}`,
      data: order.lifecycle as unknown as Record<string, unknown>,
    });
  }

  if (
    order.lifecycle.stage === "after_sales" ||
    order.lifecycle.stage === "refund" ||
    order.lifecycle.stage === "exception" ||
    order.lifecycle.paymentStatus === "overdue" ||
    order.lifecycle.paymentStatus === "refunded" ||
    order.lifecycle.fulfillmentStatus === "exception"
  ) {
    addFact(facts, {
      workspaceId,
      type: "after_sales.exception",
      subject: `${order.lifecycle.stage} signal for ${customer.companyName}`,
      summary: order.lifecycle.nextStep,
      customerId: customer.id,
      customerName: customer.companyName,
      occurredAt: order.date,
      updatedAt: order.date || customer.updatedAt,
      source,
      confidence: 0.8,
      provenance: [customerSource(customer), source],
      idempotencyKey: `${idempotencyBase}:exception:${order.lifecycle.stage}`,
      data: order.lifecycle as unknown as Record<string, unknown>,
    });
  }
}

function leadConfidence(lead: Lead): number {
  if (lead.score === "Hot") return 0.82;
  if (lead.score === "Warm") return 0.68;
  return 0.55;
}

function addLeadFacts(facts: Map<string, SalesWorldFact>, workspaceId: WorkspaceId, leads: Lead[], updatedAt: string) {
  for (const lead of leads) {
    const customerName = cleanText(lead.companyName, cleanText(lead.email, "Unknown lead"));
    const key = lead.email || lead.homepage || customerName;
    addFact(facts, {
      workspaceId,
      type: "lead",
      subject: customerName,
      summary: [lead.category, lead.reason, lead.confidence].filter(Boolean).join(" | "),
      customerName,
      updatedAt,
      source: { type: "lead", id: key },
      confidence: leadConfidence(lead),
      idempotencyKey: `${workspaceId}:lead:${key}`,
      data: lead as unknown as Record<string, unknown>,
    });
  }
}

function addQuotationFacts(facts: Map<string, SalesWorldFact>, workspaceId: WorkspaceId, quotations: Quotation[]) {
  for (const quotation of quotations) {
    addFact(facts, {
      workspaceId,
      type: "quotation",
      subject: `${quotation.type} ${quotation.id}`,
      summary: `${quotation.customer} ${quotation.amount} ${quotation.status} ${quotation.mainProducts}`.trim(),
      customerName: quotation.customer,
      occurredAt: quotation.date,
      updatedAt: quotation.date,
      source: { type: "quotation", id: quotation.id, path: quotation.filePath },
      confidence: 0.84,
      idempotencyKey: `${workspaceId}:quotation:${quotation.id}`,
      data: quotation as unknown as Record<string, unknown>,
    });
  }
}

function addPiFacts(facts: Map<string, SalesWorldFact>, workspaceId: WorkspaceId, records: PiRecord[]) {
  for (const record of records) {
    addFact(facts, {
      workspaceId,
      type: "pi.order",
      subject: record.piNo,
      summary: `${record.customer} ${record.amount} ${record.productSummary}`.trim(),
      customerName: record.customer,
      occurredAt: record.date,
      updatedAt: record.updatedAt,
      source: { type: "pi-record", id: record.piNo },
      confidence: 0.92,
      idempotencyKey: `${workspaceId}:pi-record:${record.piNo}`,
      data: record as unknown as Record<string, unknown>,
    });
  }
}

function addMemoryFacts(facts: Map<string, SalesWorldFact>, workspaceId: WorkspaceId, records: MemoryRecord[]) {
  for (const record of records) {
    addFact(facts, {
      workspaceId,
      type: "memory.record",
      subject: record.title,
      summary: record.body,
      customerId: record.customerId,
      customerName: record.customerName,
      occurredAt: record.createdAt,
      updatedAt: record.updatedAt,
      source: { type: "memory", id: record.id },
      confidence: record.confidence,
      idempotencyKey: record.idempotencyKey || `${workspaceId}:memory:${record.id}`,
      data: record as unknown as Record<string, unknown>,
    });
  }
}

function withResolvedCustomerIds(facts: SalesWorldFact[], customers: CustomerView[]): SalesWorldFact[] {
  const byName = new Map<string, string>();
  for (const customer of customers) {
    byName.set(customer.companyName.toLowerCase(), customer.id);
  }

  return facts.map((item) => {
    if (item.customerId || !item.customerName) return item;
    const customerId = byName.get(item.customerName.toLowerCase());
    return customerId ? { ...item, customerId } : item;
  });
}

export function buildSalesWorldModel(runtime: SalesRuntime, workspaceId: WorkspaceId): SalesWorldModel {
  const workspace = runtime.getWorkspace(workspaceId);
  const generatedAt = new Date().toISOString();
  const facts = new Map<string, SalesWorldFact>();

  addWorkspaceFact(facts, workspace, generatedAt);

  const directory = buildCustomerDirectory(runtime, workspace.id, { page: 1, pageSize: 100 });
  for (const customer of directory.customers) {
    addCustomerFacts(facts, workspace.id, customer);
    customer.interactions.forEach((interaction, index) => addInteractionFact(facts, workspace.id, customer, interaction, index));
    customer.orders.forEach((order, index) => addOrderFact(facts, workspace.id, customer, order, index));
  }

  addLeadFacts(facts, workspace.id, runtime.memory.getLeads(workspace.id, { page: 1, pageSize: 1000 }).data || [], generatedAt);
  addQuotationFacts(facts, workspace.id, runtime.memory.getQuotations(workspace.id, { page: 1, pageSize: 500 }).quotations || []);
  addPiFacts(facts, workspace.id, runtime.listPiRecords(workspace.id).records || []);
  addMemoryFacts(facts, workspace.id, runtime.memory.engine.list(workspace.id, 500));
  for (const ledgerFact of listSalesFacts(workspace.id)) {
    const worldFact = salesFactToWorldFact(ledgerFact);
    facts.set(`${worldFact.type}:${worldFact.idempotencyKey}`, worldFact);
  }

  const sortedFacts = withResolvedCustomerIds(Array.from(facts.values()), directory.customers).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt) ||
    a.type.localeCompare(b.type) ||
    a.id.localeCompare(b.id)
  );
  const factTypes = Array.from(new Set(sortedFacts.map((item) => item.type))).sort() as SalesWorldFactType[];

  return {
    workspaceId: workspace.id,
    generatedAt,
    facts: sortedFacts,
    coverage: {
      factTypes,
      customerCount: directory.total,
      factCount: sortedFacts.length,
      generatedFrom: [
        "workspace",
        "customer-directory",
        "customer-activity",
        "leads",
        "quotations",
        "pi-records",
        "memory",
        "sales-fact-ledger",
      ],
    },
  };
}

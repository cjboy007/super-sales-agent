import fs from "fs";
import path from "path";
import type { InboundEmail } from "../../types/inbox";
import { ensureDir, readJsonFile, ssaCompanyDataPath } from "../ssa-data-paths";
import type { CompanyIntelLeadInput } from "./company-intel";
import { companyIntelClientSlug } from "./company-intel";
import { syncCustomerLifecycleStatuses, upsertCustomerAccountsFromLeads } from "./customers";
import { ingestCustomerInteraction } from "./customer-memory-ingestor";
import type { MemoryWriteInput, RuntimeJob, RuntimeWorkflowType, WorkspaceAdapter, WorkspaceId } from "./types";

export type CustomerActivityKind =
  | "email_received"
  | "email_sent"
  | "follow_up_due"
  | "lifecycle_status"
  | "crm_note"
  | "order_status";

export type CustomerOrderActivityStage = "quote" | "payment" | "production" | "shipment" | "after_sales" | "refund" | "exception";
export type CustomerOrderActivityPaymentStatus = "not_started" | "pending" | "partial" | "paid" | "overdue" | "refunded";
export type CustomerOrderActivityFulfillmentStatus = "not_started" | "preparing" | "shipped" | "delivered" | "exception";

export interface CustomerActivityRecord {
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

export interface CustomerActivityEmailInput {
  id?: string | number;
  uid?: string | number;
  from_email?: string;
  fromEmail?: string;
  email?: string;
  from?: string;
  from_name?: string;
  fromName?: string;
  sender?: string;
  name?: string;
  subject?: string;
  body_text?: string;
  body?: string;
  text?: string;
  received_at?: string;
  receivedAt?: string;
  date?: string;
  timestamp?: string;
  status?: string;
  analysis?: InboundEmail["analysis"];
  customer_id?: string;
}

export interface CustomerOrderActivityInput {
  workspaceId: WorkspaceId;
  customerId?: unknown;
  customerName?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  orderNumber?: unknown;
  orderType?: unknown;
  productType?: unknown;
  amount?: unknown;
  lifecycleStage?: unknown;
  paymentStatus?: unknown;
  fulfillmentStatus?: unknown;
  status?: unknown;
  summary?: unknown;
  occurredAt?: unknown;
  source?: unknown;
}

export interface CustomerActivityRuntimeHost {
  getWorkspace(id?: WorkspaceId | null): WorkspaceAdapter;
  queueCompanyIntel(input: { workspaceId: string; lead: CompanyIntelLeadInput; force?: boolean; source?: string }): {
    queued: boolean;
    jobId?: string;
  };
  recordEvent(type: string, workspaceId: WorkspaceId, payload: Record<string, unknown>): unknown;
  writeMemory(input: MemoryWriteInput): unknown;
  workflows?: {
    enqueue(workspaceId: WorkspaceId, workflow: RuntimeWorkflowType, input: Record<string, unknown>): RuntimeJob;
  };
}

export interface CustomerActivitySyncResult {
  workspaceId: WorkspaceId;
  received: number;
  newActivities: number;
  orderActivities: number;
  customersUpserted: number;
  companyIntelQueued: number;
  lifecycleStatuses: number;
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

function customerVisibleText(value: unknown, fallback = ""): string {
  return cleanText(value, fallback)
    .replace(/\bPO\s*#\s*[A-Z0-9][A-Z0-9-]*\b/gi, "the purchase order")
    .replace(/\bPO-[A-Z0-9][A-Z0-9-]*\b/gi, "the purchase order")
    .replace(/\bPI-[A-Z0-9][A-Z0-9-]*\b/gi, "the PI")
    .replace(/\bQT-[A-Z0-9][A-Z0-9-]*\b/gi, "the quote")
    .replace(/\bRFQ-[A-Z0-9][A-Z0-9-]*\b/gi, "the RFQ")
    .replace(/\bworkflows?\b/gi, "process")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  const email = (match ? match[1] : value).trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function emailDomain(value: string): string {
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

function customerNameFromEmail(email: string, contactName: string): string {
  const domain = emailDomain(email);
  if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) return domainCompanyName(domain);
  return contactName || email || "Unknown Customer";
}

function stableEmailActivityId(email: CustomerActivityEmailInput): string {
  return [
    cleanText(email.id, cleanText(email.uid)),
    cleanText(email.from_email, cleanText(email.fromEmail, cleanText(email.email, cleanText(email.from)))),
    cleanText(email.subject),
    cleanText(email.received_at, cleanText(email.receivedAt, cleanText(email.date, cleanText(email.timestamp)))),
  ].filter(Boolean).join("|").toLowerCase();
}

function activityStorePath(workspaceId: WorkspaceId) {
  return ssaCompanyDataPath(workspaceId, "customers", "activity.json");
}

export function readCustomerActivities(workspaceId: WorkspaceId): CustomerActivityRecord[] {
  return readJsonFile<CustomerActivityRecord[]>(activityStorePath(workspaceId), []);
}

function writeCustomerActivities(workspaceId: WorkspaceId, activities: CustomerActivityRecord[]) {
  ensureDir(path.dirname(activityStorePath(workspaceId)));
  fs.writeFileSync(activityStorePath(workspaceId), JSON.stringify(activities.slice(0, 2000), null, 2), "utf-8");
}

export function appendCustomerActivity(workspaceId: WorkspaceId, activity: CustomerActivityRecord): CustomerActivityRecord {
  const existing = readCustomerActivities(workspaceId);
  const next = [
    activity,
    ...existing.filter((item) => item.id !== activity.id),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  writeCustomerActivities(workspaceId, next);
  return activity;
}

function customerIdFromOrderInput(input: CustomerOrderActivityInput): string {
  return cleanText(input.customerId)
    || emailDomain(cleanText(input.contactEmail))
    || cleanText(input.customerName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    || "unknown-customer";
}

function normalizedOrderType(value: unknown): "PI" | "QT" | "SPL" | "Order" {
  const text = cleanText(value).toUpperCase();
  if (text === "PI" || text === "QT" || text === "SPL") return text;
  return "Order";
}

function normalizedStage(value: unknown): CustomerOrderActivityStage {
  const text = cleanText(value).toLowerCase();
  if (text === "quote" || text === "payment" || text === "production" || text === "shipment" || text === "after_sales" || text === "refund" || text === "exception") {
    return text;
  }
  return "payment";
}

function normalizedPaymentStatus(value: unknown): CustomerOrderActivityPaymentStatus {
  const text = cleanText(value).toLowerCase();
  if (text === "not_started" || text === "pending" || text === "partial" || text === "paid" || text === "overdue" || text === "refunded") {
    return text;
  }
  return "pending";
}

function normalizedFulfillmentStatus(value: unknown): CustomerOrderActivityFulfillmentStatus {
  const text = cleanText(value).toLowerCase();
  if (text === "not_started" || text === "preparing" || text === "shipped" || text === "delivered" || text === "exception") {
    return text;
  }
  return "not_started";
}

function orderActivitySummary(input: {
  productType: string;
  amount: string;
  stage: CustomerOrderActivityStage;
  paymentStatus: CustomerOrderActivityPaymentStatus;
  fulfillmentStatus: CustomerOrderActivityFulfillmentStatus;
  status: string;
  summary: string;
}): string {
  if (input.summary) return customerVisibleText(input.summary);
  const product = input.productType || "Order";
  const amount = input.amount ? ` for ${input.amount}` : "";
  if (input.stage === "exception" || input.fulfillmentStatus === "exception" || input.paymentStatus === "overdue") {
    return `${product} shipment exception requires review: payment ${input.paymentStatus}, shipment ${input.fulfillmentStatus}${amount}.`;
  }
  if (input.stage === "refund" || input.paymentStatus === "refunded") {
    return `${product} refund follow-up is active${amount}.`;
  }
  if (input.stage === "after_sales") {
    return `${product} after-sales follow-up is active${amount}.`;
  }
  if (input.stage === "shipment" || input.fulfillmentStatus === "shipped" || input.fulfillmentStatus === "delivered") {
    return `${product} shipment ${input.fulfillmentStatus}${amount}.`;
  }
  if (input.stage === "payment" || input.paymentStatus !== "not_started") {
    return `${product} payment ${input.paymentStatus}${amount}.`;
  }
  return `${product} order status ${input.status || input.stage}${amount}.`;
}

function buildCustomerOrderActivity(input: CustomerOrderActivityInput): CustomerActivityRecord {
  const workspaceId = input.workspaceId;
  const customerId = customerIdFromOrderInput(input);
  const customerName = cleanText(input.customerName, cleanText(input.contactEmail, customerId));
  const occurredAt = cleanText(input.occurredAt, new Date().toISOString());
  const orderType = normalizedOrderType(input.orderType);
  const lifecycleStage = normalizedStage(input.lifecycleStage);
  const paymentStatus = normalizedPaymentStatus(input.paymentStatus);
  const fulfillmentStatus = normalizedFulfillmentStatus(input.fulfillmentStatus);
  const productType = customerVisibleText(input.productType, "Order");
  const amount = customerVisibleText(input.amount);
  const status = customerVisibleText(input.status, lifecycleStage);
  const orderNumber = cleanText(input.orderNumber);
  const stableOrderKey = orderNumber || `${customerId}:${productType}:${amount}`;
  const summary = orderActivitySummary({
    productType,
    amount,
    stage: lifecycleStage,
    paymentStatus,
    fulfillmentStatus,
    status,
    summary: cleanText(input.summary),
  });
  return {
    id: `order:${customerId}:${stableOrderKey}:${lifecycleStage}:${paymentStatus}:${fulfillmentStatus}:${occurredAt}`.toLowerCase(),
    workspaceId,
    customerId,
    customerName,
    kind: "order_status",
    occurredAt,
    createdAt: new Date().toISOString(),
    contactName: cleanText(input.contactName),
    contactEmail: cleanText(input.contactEmail),
    subject: "Order lifecycle update",
    summary,
    status,
    source: customerVisibleText(input.source, "order-update"),
    metadata: {
      orderNumber: orderNumber || null,
      orderType,
      productType,
      amount,
      lifecycleStage,
      paymentStatus,
      fulfillmentStatus,
      status,
    },
  };
}

export function appendCustomerOrderActivity(input: CustomerOrderActivityInput): CustomerActivityRecord {
  const activity = buildCustomerOrderActivity(input);
  return appendCustomerActivity(input.workspaceId, activity);
}

function bodyPreview(email: CustomerActivityEmailInput): string {
  return cleanText(email.body_text, cleanText(email.body, cleanText(email.text))).replace(/\s+/g, " ").slice(0, 220);
}

function fullEmailText(email: CustomerActivityEmailInput): string {
  return [
    cleanText(email.subject),
    cleanText(email.body_text, cleanText(email.body, cleanText(email.text))),
    ...(email.analysis?.key_points || []),
  ].filter(Boolean).join("\n");
}

function orderNumberFromText(text: string): string {
  const match = text.match(/\b(?:PI|QT|RFQ|PO)[-\s#]*[A-Z0-9][A-Z0-9-]*\b/i);
  return match ? match[0].replace(/\s*#\s*/g, "-").replace(/\s+/g, "-").toUpperCase() : "";
}

function amountFromText(text: string): string {
  const match = text.match(/\b(USD|EUR|GBP|CNY|RMB)\s*[$€£¥]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i)
    || text.match(/[$€£¥]\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!match) return "";
  if (match.length >= 3) return `${match[1].toUpperCase()} ${match[2].replace(/,/g, "")}`;
  return `USD ${match[1].replace(/,/g, "")}`;
}

function productTypeFromText(text: string): string {
  const candidates = [
    /\b(HDMI\s*[0-9.]*\s+cable(?:\s+program|\s+order|\s+replacement)?)\b/i,
    /\b(HDMI\s*[0-9.]*\s*cables?)\b/i,
    /\b(DisplayPort\s*cables?)\b/i,
    /\b(USB-C\s+cable(?:\s+program|\s+order|\s+replacement)?)\b/i,
    /\b(USB-C\s*cables?)\b/i,
    /\b([A-Z0-9+.-]+(?:\s+to\s+[A-Z0-9+.-]+)?\s+cable(?:\s+program|\s+order|\s+replacement)?)\b/i,
  ];
  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (match?.[1]) return customerVisibleText(match[1]);
  }
  return "Order";
}

function paymentStatusFromText(text: string): CustomerOrderActivityPaymentStatus {
  const lower = text.toLowerCase();
  if (/refund(ed)?|credit note/.test(lower)) return "refunded";
  if (/overdue|payment delay|unpaid|past due/.test(lower)) return "overdue";
  if (/partial payment|deposit received|balance pending/.test(lower)) return "partial";
  if (/payment received|paid|wire received|tt received|deposit paid/.test(lower)) return "paid";
  if (/payment pending|awaiting payment|invoice issued/.test(lower)) return "pending";
  return "pending";
}

function fulfillmentStatusFromText(text: string): CustomerOrderActivityFulfillmentStatus {
  const lower = text.toLowerCase();
  if (/exception|customs hold|quality issue|claim|dispute|delay/.test(lower)) return "exception";
  if (/delivered|received by customer|signed for/.test(lower)) return "delivered";
  if (/shipped|shipment booked|tracking|air waybill|awb|bl issued/.test(lower)) return "shipped";
  if (/production|preparing|packing|ready to ship/.test(lower)) return "preparing";
  return "not_started";
}

function lifecycleStageFromText(
  text: string,
  paymentStatus: CustomerOrderActivityPaymentStatus,
  fulfillmentStatus: CustomerOrderActivityFulfillmentStatus
): CustomerOrderActivityStage {
  const lower = text.toLowerCase();
  if (/exception|customs hold|quality issue|claim|dispute|overdue|delay/.test(lower) || fulfillmentStatus === "exception" || paymentStatus === "overdue") return "exception";
  if (/refund|credit note/.test(lower) || paymentStatus === "refunded") return "refund";
  if (/after-sales|after sales|warranty|replacement|complaint/.test(lower)) return "after_sales";
  if (fulfillmentStatus === "shipped" || fulfillmentStatus === "delivered") return "shipment";
  if (fulfillmentStatus === "preparing") return "production";
  return "payment";
}

function orderTypeFromNumber(orderNumber: string): "PI" | "QT" | "SPL" | "Order" {
  if (/^PI\b|^PI-/i.test(orderNumber)) return "PI";
  if (/^QT\b|^QT-/i.test(orderNumber)) return "QT";
  return "Order";
}

function orderActivityFromEmail(
  workspaceId: WorkspaceId,
  lead: CompanyIntelLeadInput,
  email: CustomerActivityEmailInput,
  now: string,
  source: string
): CustomerActivityRecord | null {
  const text = fullEmailText(email);
  const lower = text.toLowerCase();
  const hasOrderSignal = /\b(pi|po|order|payment|paid|shipment|shipped|delivered|refund|after-sales|after sales|exception|customs hold|quality issue)\b/i.test(text);
  if (!hasOrderSignal) return null;
  const orderNumber = orderNumberFromText(text);
  const paymentStatus = paymentStatusFromText(text);
  const fulfillmentStatus = fulfillmentStatusFromText(text);
  const lifecycleStage = lifecycleStageFromText(text, paymentStatus, fulfillmentStatus);
  if (!orderNumber && lifecycleStage === "payment" && paymentStatus === "pending" && fulfillmentStatus === "not_started" && !/order confirmation|new order|purchase order/i.test(lower)) {
    return null;
  }
  return buildCustomerOrderActivity({
    workspaceId,
    customerId: companyIntelClientSlug(lead),
    customerName: lead.companyName,
    contactName: lead.contact,
    contactEmail: lead.email,
    orderNumber,
    orderType: orderTypeFromNumber(orderNumber),
    productType: productTypeFromText(text),
    amount: amountFromText(text),
    lifecycleStage,
    paymentStatus,
    fulfillmentStatus,
    status: lifecycleStage,
    occurredAt: cleanText(email.received_at, cleanText(email.receivedAt, cleanText(email.date, cleanText(email.timestamp, now)))),
    source,
  });
}

function leadScoreFromEmail(email: CustomerActivityEmailInput): CompanyIntelLeadInput["score"] {
  const analysis = email.analysis;
  const intent = cleanText(analysis?.intent).toLowerCase();
  const urgency = cleanText(analysis?.urgency).toLowerCase();
  const subject = cleanText(email.subject).toLowerCase();
  if (/order|rfq|quote|quotation|urgent/.test(`${intent} ${urgency} ${subject}`)) return "Hot";
  if (/inquiry|follow|negotiation|technical/.test(`${intent} ${subject}`)) return "Warm";
  return "Cold";
}

function confidenceFromEmail(email: CustomerActivityEmailInput): string {
  const confidence = email.analysis?.confidence;
  if (typeof confidence === "number" && Number.isFinite(confidence)) return `${Math.round(confidence * 100)}%`;
  const score = leadScoreFromEmail(email);
  if (score === "Hot") return "82%";
  if (score === "Warm") return "68%";
  return "50%";
}

function emailToLead(email: CustomerActivityEmailInput): CompanyIntelLeadInput | null {
  const fromEmail = normalizeEmail(cleanText(email.from_email, cleanText(email.fromEmail, cleanText(email.email, cleanText(email.from)))));
  if (!fromEmail) return null;
  const domain = emailDomain(fromEmail);
  const contact = cleanText(email.from_name, cleanText(email.fromName, cleanText(email.sender, cleanText(email.name))));
  const companyName = customerNameFromEmail(fromEmail, contact);
  const score = leadScoreFromEmail(email);
  const keyPoints = email.analysis?.key_points?.filter(Boolean).join("; ");
  return {
    companyName,
    contact,
    email: fromEmail,
    homepage: domain && !PUBLIC_EMAIL_DOMAINS.has(domain) ? `https://${domain}` : "",
    category: "Inbound Email",
    reason: `Inbound email: ${cleanText(email.subject, "(no subject)")}${keyPoints ? ` / ${keyPoints}` : ""}`,
    confidence: confidenceFromEmail(email),
    score,
  };
}

function emailActivityFromLead(
  workspaceId: WorkspaceId,
  lead: CompanyIntelLeadInput,
  email: CustomerActivityEmailInput,
  now: string,
  source: string
): CustomerActivityRecord {
  const subject = cleanText(email.subject, "(no subject)");
  const contactEmail = normalizeEmail(cleanText(email.from_email, cleanText(email.fromEmail, cleanText(email.email, cleanText(email.from)))));
  const summary = bodyPreview(email);
  return {
    id: `email:${stableEmailActivityId(email)}`,
    workspaceId,
    customerId: companyIntelClientSlug(lead),
    customerName: cleanText(lead.companyName, contactEmail),
    kind: "email_received",
    occurredAt: cleanText(email.received_at, cleanText(email.receivedAt, cleanText(email.date, cleanText(email.timestamp, now)))),
    createdAt: now,
    contactName: cleanText(lead.contact),
    contactEmail,
    subject,
    summary: summary ? `${subject} - ${summary}` : subject,
    status: cleanText(email.status, "received"),
    source,
    metadata: {
      intent: email.analysis?.intent || null,
      urgency: email.analysis?.urgency || null,
      sentiment: email.analysis?.sentiment || null,
      customerId: cleanText(email.customer_id) || null,
    },
  };
}

export function syncInboxEmailsToCustomers(
  host: CustomerActivityRuntimeHost,
  workspaceId: WorkspaceId,
  emails: CustomerActivityEmailInput[],
  options: { now?: string; source?: string } = {}
): CustomerActivitySyncResult {
  const workspace = host.getWorkspace(workspaceId);
  const now = options.now || new Date().toISOString();
  const source = options.source || "inbox-sync";
  const existing = readCustomerActivities(workspace.id);
  const seen = new Set(existing.map((activity) => activity.id));
  const newActivities: CustomerActivityRecord[] = [];
  const newOrderActivities: CustomerActivityRecord[] = [];
  const leads: CompanyIntelLeadInput[] = [];
  let orderActivities = 0;

  for (const email of emails) {
    const lead = emailToLead(email);
    if (!lead) continue;
    const activity = emailActivityFromLead(workspace.id, lead, email, now, source);
    if (seen.has(activity.id)) continue;
    seen.add(activity.id);
    newActivities.push(activity);
    leads.push(lead);
    const orderActivity = orderActivityFromEmail(workspace.id, lead, email, now, source);
    if (orderActivity && !seen.has(orderActivity.id)) {
      seen.add(orderActivity.id);
      newOrderActivities.push(orderActivity);
      orderActivities += 1;
    }
  }

  if (newActivities.length === 0) {
    return {
      workspaceId: workspace.id,
      received: emails.length,
      newActivities: 0,
      orderActivities,
      customersUpserted: 0,
      companyIntelQueued: 0,
      lifecycleStatuses: 0,
    };
  }

  const customers = upsertCustomerAccountsFromLeads(workspace.id, leads, {
    sourceType: "email",
    importedAt: now,
  });
  let companyIntelQueued = 0;
  for (const lead of leads) {
    const queued = host.queueCompanyIntel({
      workspaceId: workspace.id,
      lead,
      source,
    });
    if (queued.queued) companyIntelQueued += 1;
  }

  writeCustomerActivities(workspace.id, [...newOrderActivities, ...newActivities, ...existing].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
  const lifecycle = syncCustomerLifecycleStatuses(host as Parameters<typeof syncCustomerLifecycleStatuses>[0], workspace.id, {
    now,
  });

  for (const activity of newActivities) {
    ingestCustomerInteraction(host, {
      workspaceId: workspace.id,
      direction: "inbound_email",
      email: activity.contactEmail,
      customerName: activity.customerName,
      contactName: activity.contactName,
      subject: activity.subject,
      body: activity.summary,
      occurredAt: activity.occurredAt,
      writeActivity: false,
      source: {
        type: "email",
        id: activity.id,
      },
      confidence: 0.8,
      tags: ["inbound-email", "customer-activity", activity.kind],
      metadata: {
        contactEmail: activity.contactEmail,
        contactName: activity.contactName,
        occurredAt: activity.occurredAt,
        sideEffects: "local-only",
      },
      idempotencyKey: `${workspace.id}:${activity.id}`,
    });
  }

  for (const activity of newOrderActivities) {
    host.writeMemory({
      workspaceId: workspace.id,
      kind: "episode",
      customerId: activity.customerId,
      customerName: activity.customerName,
      subject: activity.subject,
      title: `Inbound order update: ${activity.customerName}`,
      body: activity.summary,
      tags: ["inbound-email", "customer-activity", "order-status"],
      source: {
        type: "email",
        id: activity.id,
      },
      confidence: 0.8,
      metadata: {
        contactEmail: activity.contactEmail,
        contactName: activity.contactName,
        occurredAt: activity.occurredAt,
        sideEffects: "local-only",
      },
      idempotencyKey: `${workspace.id}:${activity.id}`,
    });
  }

  host.recordEvent("customer.crm.inbox_synced", workspace.id, {
    received: emails.length,
    newActivities: newActivities.length,
    orderActivities,
    customersUpserted: customers.upserted,
    companyIntelQueued,
    lifecycleStatuses: lifecycle.recorded,
    source,
    sideEffects: "local-only",
  });

  return {
    workspaceId: workspace.id,
    received: emails.length,
    newActivities: newActivities.length,
    orderActivities,
    customersUpserted: customers.upserted,
    companyIntelQueued,
    lifecycleStatuses: lifecycle.recorded,
  };
}

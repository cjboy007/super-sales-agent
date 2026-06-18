import fs from "fs";
import path from "path";
import type { Lead } from "../leads";
import { readJsonFile, ssaCompanyDataPath } from "../ssa-data-paths";
import type { Quotation } from "../quotations";
import type { PendingEmail } from "../emails";
import type { SalesRuntime } from "./sales-runtime";
import type { CompanyIntelDossier, CompanyIntelLeadInput, CompanyIntelStatus } from "./company-intel";
import { companyIntelClientSlug, companyIntelPaths } from "./company-intel";
import type { PiRecord } from "./documents";
import type { CustomerActivityRecord } from "./customer-activity";
import type { WorkspaceId } from "./types";

export type CustomerStatus = "Prospect" | "Active Customer" | "Dormant" | "Risk" | "Archived";
export type CustomerIntelRating = "Hot" | "Warm" | "Cold" | "Unknown";

export interface CustomerContactView {
  name: string;
  role: string;
  email: string;
  emailStatus: string;
  sourceNote: string;
}

export interface CustomerOrderView {
  type: "PI" | "QT" | "SPL" | "Order";
  date: string;
  productType: string;
  amount: string;
  currency: string;
  status: string;
  lifecycle: CustomerOrderLifecycle;
}

export interface CustomerOrderLifecycle {
  stage: "quote" | "payment" | "production" | "shipment" | "after_sales" | "refund" | "exception";
  paymentStatus?: "not_started" | "pending" | "partial" | "paid" | "overdue" | "refunded";
  fulfillmentStatus?: "not_started" | "preparing" | "shipped" | "delivered" | "exception";
  nextStep: string;
}

export interface CustomerInteractionView {
  date: string;
  type: "Lead" | "Intel" | "Quote" | "Order" | "Email" | "Follow-up" | "Lifecycle" | "Payment" | "Shipment" | "After-sales" | "Refund" | "Exception";
  summary: string;
}

export interface CustomerStatusExplanation {
  status: CustomerStatus;
  reason: string;
  signals: string[];
  updatedAt: string;
  manualOverride: boolean;
  ruleId: string;
  priority: number;
  enteredWhen: string;
  exitsWhen: string;
}

export interface CustomerIntelligenceView {
  status: CompanyIntelStatus | "partial";
  score: number | null;
  rating: CustomerIntelRating;
  completenessLabel: string;
  companySummary: string;
  productFit: string;
  salesAngle: string;
  riskSummary: string;
  generatedAt: string;
}

export interface CustomerView {
  id: string;
  companyName: string;
  country: string;
  website: string;
  domain: string;
  industry: string;
  status: CustomerStatus;
  statusExplanation: CustomerStatusExplanation;
  sourceCount: number;
  sourceSummary: string;
  intelligence: CustomerIntelligenceView;
  contacts: CustomerContactView[];
  orders: CustomerOrderView[];
  interactions: CustomerInteractionView[];
  nextActions: string[];
  recentSummary: string;
  updatedAt: string;
}

export interface CustomerDirectoryStats {
  total: number;
  prospect: number;
  active: number;
  dormant: number;
  risk: number;
  archived: number;
  countries: number;
}

export interface CustomerDirectoryReadModel {
  workspaceId: string;
  customers: CustomerView[];
  stats: CustomerDirectoryStats;
  countries: string[];
  statuses: CustomerStatus[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  updatedAt: string;
}

export interface CustomerAccountSource {
  type: "lead" | "email";
  companyName: string;
  contact: string;
  role: string;
  email: string;
  website: string;
  country: string;
  industry: string;
  category: string;
  reason: string;
  confidence: string;
  importedAt: string;
}

export interface CustomerAccountRecord {
  id: string;
  companyName: string;
  country: string;
  website: string;
  domain: string;
  industry: string;
  status: CustomerStatus;
  sources: CustomerAccountSource[];
  intelligence: {
    status: CompanyIntelStatus;
    queuedAt?: string;
  };
  statusOverride?: CustomerStatusOverride;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerStatusOverride {
  status: CustomerStatus;
  reason: string;
  setAt: string;
  setBy: string;
}

export interface CustomerUpsertResult {
  upserted: number;
  accounts: string[];
}

export interface CustomerAccountUpsertOptions {
  sourceType?: CustomerAccountSource["type"];
  importedAt?: string;
}

export interface CustomerStatusOverrideInput {
  workspaceId: WorkspaceId;
  customerId: string;
  status: unknown;
  reason?: string;
  operatorId?: string;
  now?: string;
  runtime?: SalesRuntime;
}

export interface CustomerStatusOverrideResult {
  customerId: string;
  status: CustomerStatus;
  manualOverride: boolean;
  reason: string;
  updatedAt: string;
}

export interface CustomerLifecycleSyncResult {
  workspaceId: WorkspaceId;
  evaluated: number;
  recorded: number;
  changes: Array<{
    customerId: string;
    companyName: string;
    status: CustomerStatus;
    ruleId: string;
    reason: string;
  }>;
}

interface StoredCustomerLifecycleState {
  customerId: string;
  status: CustomerStatus;
  ruleId: string;
  manualOverride: boolean;
  reason: string;
  updatedAt: string;
}

export interface ClearCustomerStatusOverrideInput {
  workspaceId: WorkspaceId;
  customerId: string;
  reason?: string;
  operatorId?: string;
  now?: string;
}

interface CustomerDirectoryParams {
  search?: string;
  status?: string;
  country?: string;
  page?: number;
  pageSize?: number;
}

interface ClientProfile {
  company?: string;
  country?: string;
  contact?: string;
  industry?: string;
  status?: string;
  stage?: string;
  products_quoted?: string[];
  rfq_date?: string;
  notes?: string;
  last_updated?: string;
}

interface InternalCustomerOrderView extends CustomerOrderView {
  internalId: string;
}

interface CustomerBucket {
  id: string;
  domain: string;
  companyName: string;
  country: string;
  website: string;
  industry: string;
  leads: Lead[];
  account: CustomerAccountRecord | null;
  dossier: CompanyIntelDossier | null;
  intelStatus: CompanyIntelStatus;
  profile: ClientProfile | null;
  orders: InternalCustomerOrderView[];
  activities: CustomerActivityRecord[];
}

const CUSTOMER_STATUSES: CustomerStatus[] = ["Prospect", "Active Customer", "Dormant", "Risk", "Archived"];

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function businessText(value: unknown, fallback = ""): string {
  return customerVisibleText(cleanText(value, fallback))
    .replace(/线索池/g, "客户档案")
    .replace(/线索/g, "客户来源")
    .replace(/lead-pool/gi, "customer profile")
    .replace(/lead pool/gi, "customer profile");
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

function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function domainFromUrl(value: string): string {
  const normalized = normalizeWebsite(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0] || "";
  }
}

function domainFromEmail(value: string): string {
  return value.includes("@") ? (value.split("@").pop() || "").replace(/^www\./i, "") : "";
}

function leadDomain(lead: Lead): string {
  return domainFromUrl(lead.homepage) || domainFromEmail(lead.email);
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function leadToIntelInput(lead: Lead): CompanyIntelLeadInput {
  return {
    companyName: lead.companyName,
    country: lead.country,
    industry: lead.industry,
    contact: lead.contact,
    position: lead.position,
    email: lead.email,
    homepage: lead.homepage,
    category: lead.category,
    reason: lead.reason,
    confidence: lead.confidence,
    score: lead.score,
  };
}

function sourceToLead(source: CustomerAccountSource, account: CustomerAccountRecord): Lead {
  return {
    companyName: source.companyName || account.companyName,
    country: source.country || account.country,
    industry: source.industry || account.industry,
    contact: source.contact,
    position: source.role,
    email: source.email,
    homepage: source.website || account.website,
    category: source.category,
    reason: source.reason,
    confidence: source.confidence,
    score: source.category.includes("Tier1") ? "Hot" : source.category.includes("Tier2") ? "Warm" : "Cold",
  };
}

function leadInputDomain(lead: CompanyIntelLeadInput): string {
  return domainFromUrl(cleanText(lead.homepage)) || domainFromEmail(cleanText(lead.email));
}

function leadInputId(lead: CompanyIntelLeadInput): string {
  return leadInputDomain(lead) || companyIntelClientSlug(lead);
}

function accountStorePath(workspaceId: string) {
  return ssaCompanyDataPath(workspaceId, "customers", "accounts.json");
}

function lifecycleStateStorePath(workspaceId: string) {
  return ssaCompanyDataPath(workspaceId, "customers", "lifecycle-state.json");
}

function readAccounts(workspaceId: string): CustomerAccountRecord[] {
  return readJsonFile<CustomerAccountRecord[]>(accountStorePath(workspaceId), []);
}

function writeAccounts(workspaceId: string, accounts: CustomerAccountRecord[]) {
  fs.mkdirSync(path.dirname(accountStorePath(workspaceId)), { recursive: true });
  fs.writeFileSync(accountStorePath(workspaceId), JSON.stringify(accounts, null, 2), "utf-8");
}

function readLifecycleState(workspaceId: string): Record<string, StoredCustomerLifecycleState> {
  return readJsonFile<Record<string, StoredCustomerLifecycleState>>(lifecycleStateStorePath(workspaceId), {});
}

function writeLifecycleState(workspaceId: string, state: Record<string, StoredCustomerLifecycleState>) {
  fs.mkdirSync(path.dirname(lifecycleStateStorePath(workspaceId)), { recursive: true });
  fs.writeFileSync(lifecycleStateStorePath(workspaceId), JSON.stringify(state, null, 2), "utf-8");
}

function assertCustomerStatus(value: unknown): asserts value is CustomerStatus {
  if (typeof value !== "string" || !CUSTOMER_STATUSES.includes(value as CustomerStatus)) {
    throw Object.assign(new Error("Unsupported customer status."), { status: 400 });
  }
}

function findAccountIndex(accounts: CustomerAccountRecord[], customerId: string): number {
  const normalized = cleanText(customerId).toLowerCase();
  return accounts.findIndex((account) =>
    account.id.toLowerCase() === normalized ||
    account.domain.toLowerCase() === normalized ||
    normalizedKey(account.companyName) === normalizedKey(customerId)
  );
}

function createAccountFromActivity(workspaceId: WorkspaceId, customerId: string, now: string): CustomerAccountRecord | null {
  const normalized = cleanText(customerId).toLowerCase();
  const activity = readCustomerActivitiesForDirectory(workspaceId).find((item) =>
    item.customerId.toLowerCase() === normalized ||
    normalizedKey(item.customerName) === normalizedKey(customerId) ||
    Boolean(item.contactEmail && domainFromEmail(item.contactEmail).toLowerCase() === normalized)
  );
  if (!activity) return null;
  const domain = domainFromEmail(activity.contactEmail) || normalized;
  const website = domain ? normalizeWebsite(domain) : "";
  return {
    id: cleanText(activity.customerId, domain || customerId),
    companyName: cleanText(activity.customerName, activity.contactEmail || customerId),
    country: "",
    website,
    domain,
    industry: "",
    status: "Prospect",
    sources: [
      {
        type: "email",
        companyName: cleanText(activity.customerName, activity.contactEmail || customerId),
        contact: cleanText(activity.contactName),
        role: "Email contact",
        email: cleanText(activity.contactEmail),
        website,
        country: "",
        industry: "",
        category: "Inbound Email",
        reason: cleanText(activity.subject, activity.summary || "Inbound customer activity"),
        confidence: "",
        importedAt: now,
      },
    ],
    intelligence: {
      status: "queued",
      queuedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createAccountFromCustomerView(customer: CustomerView, now: string): CustomerAccountRecord {
  const contact = customer.contacts[0];
  const leadInteraction = customer.interactions.find((item) => item.type === "Lead");
  const fromLead = Boolean(leadInteraction);
  return {
    id: customer.id,
    companyName: customer.companyName,
    country: customer.country,
    website: customer.website || (customer.domain ? normalizeWebsite(customer.domain) : ""),
    domain: customer.domain || domainFromUrl(customer.website) || domainFromEmail(contact?.email || "") || customer.id,
    industry: customer.industry,
    status: "Prospect",
    sources: [
      {
        type: fromLead ? "lead" : "email",
        companyName: customer.companyName,
        contact: cleanText(contact?.name),
        role: cleanText(contact?.role),
        email: cleanText(contact?.email),
        website: customer.website || (customer.domain ? normalizeWebsite(customer.domain) : ""),
        country: customer.country,
        industry: customer.industry,
        category: fromLead ? "Customer Directory Lead" : "Customer Directory Activity",
        reason: cleanText(leadInteraction?.summary, customer.recentSummary || "Created from customer directory for lifecycle management."),
        confidence: customer.intelligence.score === null ? "" : String(customer.intelligence.score),
        importedAt: now,
      },
    ],
    intelligence: {
      status: customer.intelligence.status === "partial" ? "ready" : customer.intelligence.status,
      queuedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createAccountFromDirectory(runtime: SalesRuntime | undefined, workspaceId: WorkspaceId, customerId: string, now: string): CustomerAccountRecord | null {
  if (!runtime) return null;
  const directory = buildCustomerDirectory(runtime, workspaceId, {
    search: customerId,
    page: 1,
    pageSize: 100,
  });
  const normalized = cleanText(customerId).toLowerCase();
  const customer = directory.customers.find((item) =>
    item.id.toLowerCase() === normalized ||
    item.domain.toLowerCase() === normalized ||
    normalizedKey(item.companyName) === normalizedKey(customerId)
  ) || directory.customers[0] || null;
  return customer ? createAccountFromCustomerView(customer, now) : null;
}

function ensureAccountForStatusChange(workspaceId: WorkspaceId, customerId: string, now: string, runtime?: SalesRuntime): {
  accounts: CustomerAccountRecord[];
  index: number;
} {
  const accounts = readAccounts(workspaceId);
  const existingIndex = findAccountIndex(accounts, customerId);
  if (existingIndex >= 0) return { accounts, index: existingIndex };

  const account = createAccountFromActivity(workspaceId, customerId, now) || createAccountFromDirectory(runtime, workspaceId, customerId, now);
  if (!account) throw Object.assign(new Error("Customer account was not found."), { status: 404 });
  accounts.unshift(account);
  return { accounts, index: 0 };
}

function appendLifecycleStatusActivity(input: {
  workspaceId: WorkspaceId;
  account: CustomerAccountRecord;
  occurredAt: string;
  summary: string;
  status: CustomerStatus | "";
  reason: string;
  source: string;
  operatorId: string;
}) {
  const activityId = `lifecycle:${input.account.id}:${input.source}:${input.occurredAt}`;
  appendCustomerActivityForDirectory(input.workspaceId, {
    id: activityId,
    workspaceId: input.workspaceId,
    customerId: input.account.id,
    customerName: input.account.companyName,
    kind: "lifecycle_status",
    occurredAt: input.occurredAt,
    createdAt: input.occurredAt,
    contactName: "",
    contactEmail: "",
    subject: input.summary,
    summary: input.summary,
    status: input.status || "automatic",
    source: "customer-lifecycle",
    metadata: {
      reason: input.reason,
      operator: input.operatorId,
    },
  });
}

function lifecycleStateKey(customerId: string): string {
  return cleanText(customerId).toLowerCase();
}

function shouldRecordAutomaticLifecycleChange(
  explanation: CustomerStatusExplanation,
  previous: StoredCustomerLifecycleState | undefined
): boolean {
  if (explanation.manualOverride) return false;
  if (!previous && explanation.status === "Prospect") return false;
  if (!previous) return true;
  return previous.status !== explanation.status ||
    previous.ruleId !== explanation.ruleId ||
    previous.manualOverride !== explanation.manualOverride;
}

function automaticLifecycleSummary(
  explanation: CustomerStatusExplanation,
  previous: StoredCustomerLifecycleState | undefined
): string {
  const previousStatus = previous?.status && previous.status !== explanation.status ? ` from ${previous.status}` : "";
  return customerVisibleText(`Automatic status changed to ${explanation.status}${previousStatus}: ${explanation.reason}`);
}

function appendAutomaticLifecycleActivity(input: {
  workspaceId: WorkspaceId;
  customer: CustomerView;
  previous?: StoredCustomerLifecycleState;
  now: string;
}) {
  const explanation = input.customer.statusExplanation;
  const occurredAt = explanation.updatedAt || input.now;
  const summary = automaticLifecycleSummary(explanation, input.previous);
  appendCustomerActivityForDirectory(input.workspaceId, {
    id: `lifecycle:auto:${input.customer.id}:${explanation.status}:${explanation.ruleId}:${occurredAt}`.toLowerCase(),
    workspaceId: input.workspaceId,
    customerId: input.customer.id,
    customerName: input.customer.companyName,
    kind: "lifecycle_status",
    occurredAt,
    createdAt: input.now,
    contactName: "",
    contactEmail: "",
    subject: summary,
    summary,
    status: explanation.status,
    source: "customer-lifecycle",
    metadata: {
      automatic: true,
      previousStatus: input.previous?.status || null,
      status: explanation.status,
      reason: explanation.reason,
      signals: explanation.signals,
      ruleId: explanation.ruleId,
      priority: explanation.priority,
      enteredWhen: explanation.enteredWhen,
      exitsWhen: explanation.exitsWhen,
    },
  });
}

export function setCustomerStatusOverride(input: CustomerStatusOverrideInput): CustomerStatusOverrideResult {
  const now = input.now || new Date().toISOString();
  const customerId = cleanText(input.customerId);
  const reason = cleanText(input.reason, "Manual lifecycle review.");
  const operatorId = cleanText(input.operatorId, "operator");
  assertCustomerStatus(input.status);
  if (!customerId) throw Object.assign(new Error("Customer id is required."), { status: 400 });

  const { accounts, index } = ensureAccountForStatusChange(input.workspaceId, customerId, now, input.runtime);

  const existing = accounts[index];
  const updated: CustomerAccountRecord = {
    ...existing,
    status: input.status,
    statusOverride: {
      status: input.status,
      reason,
      setAt: now,
      setBy: operatorId,
    },
    updatedAt: now,
  };
  accounts[index] = updated;
  writeAccounts(input.workspaceId, accounts);
  appendLifecycleStatusActivity({
    workspaceId: input.workspaceId,
    account: updated,
    occurredAt: now,
    summary: `Manual status set to ${input.status}: ${reason}`,
    status: input.status,
    reason,
    source: "manual-set",
    operatorId,
  });
  return {
    customerId: updated.id,
    status: input.status,
    manualOverride: true,
    reason,
    updatedAt: now,
  };
}

export function clearCustomerStatusOverride(input: ClearCustomerStatusOverrideInput): CustomerStatusOverrideResult {
  const now = input.now || new Date().toISOString();
  const customerId = cleanText(input.customerId);
  const reason = cleanText(input.reason, "Manual lifecycle override cleared.");
  const operatorId = cleanText(input.operatorId, "operator");
  if (!customerId) throw Object.assign(new Error("Customer id is required."), { status: 400 });

  const accounts = readAccounts(input.workspaceId);
  const index = findAccountIndex(accounts, customerId);
  if (index < 0) throw Object.assign(new Error("Customer account was not found."), { status: 404 });

  const existing = accounts[index];
  const updated: CustomerAccountRecord = {
    ...existing,
    status: "Prospect",
    statusOverride: undefined,
    updatedAt: now,
  };
  accounts[index] = updated;
  writeAccounts(input.workspaceId, accounts);
  appendLifecycleStatusActivity({
    workspaceId: input.workspaceId,
    account: updated,
    occurredAt: now,
    summary: `Manual status cleared: ${reason}`,
    status: "",
    reason,
    source: "manual-clear",
    operatorId,
  });
  return {
    customerId: updated.id,
    status: "Prospect",
    manualOverride: false,
    reason,
    updatedAt: now,
  };
}

function activityStorePath(workspaceId: string) {
  return ssaCompanyDataPath(workspaceId, "customers", "activity.json");
}

function readCustomerActivitiesForDirectory(workspaceId: string): CustomerActivityRecord[] {
  return readJsonFile<CustomerActivityRecord[]>(activityStorePath(workspaceId), []);
}

function appendCustomerActivityForDirectory(workspaceId: string, activity: CustomerActivityRecord): CustomerActivityRecord {
  const existing = readCustomerActivitiesForDirectory(workspaceId);
  const next = [
    activity,
    ...existing.filter((item) => item.id !== activity.id),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  fs.mkdirSync(path.dirname(activityStorePath(workspaceId)), { recursive: true });
  fs.writeFileSync(activityStorePath(workspaceId), JSON.stringify(next.slice(0, 2000), null, 2), "utf-8");
  return activity;
}

export function upsertCustomerAccountsFromLeads(
  workspaceId: string,
  leads: CompanyIntelLeadInput[],
  options: CustomerAccountUpsertOptions = {}
): CustomerUpsertResult {
  const now = options.importedAt || new Date().toISOString();
  const sourceType = options.sourceType || "lead";
  const byId = new Map(readAccounts(workspaceId).map((account) => [account.id, account]));
  const touched = new Set<string>();

  for (const lead of leads) {
    const id = leadInputId(lead);
    const companyName = cleanText(lead.companyName, id);
    if (!id || !companyName) continue;
    const domain = leadInputDomain(lead);
    const source: CustomerAccountSource = {
      type: sourceType,
      companyName,
      contact: cleanText(lead.contact),
      role: cleanText(lead.position),
      email: cleanText(lead.email),
      website: normalizeWebsite(cleanText(lead.homepage)),
      country: cleanText(lead.country),
      industry: cleanText(lead.industry),
      category: cleanText(lead.category),
      reason: cleanText(lead.reason),
      confidence: cleanText(lead.confidence),
      importedAt: now,
    };
    const existing = byId.get(id);
    const existingSources = existing?.sources || [];
    const sourceKey = `${source.companyName}|${source.email}|${source.website}`.toLowerCase();
    const sources = [
      source,
      ...existingSources.filter((item) => `${item.companyName}|${item.email}|${item.website}`.toLowerCase() !== sourceKey),
    ].slice(0, 20);
    byId.set(id, {
      id,
      companyName: existing?.companyName || companyName,
      country: cleanText(existing?.country, source.country),
      website: cleanText(existing?.website, source.website),
      domain,
      industry: cleanText(existing?.industry, source.industry),
      status: existing?.status || "Prospect",
      sources,
      intelligence: {
        ...existing?.intelligence,
        status: existing?.intelligence.status === "ready" ? "ready" : "queued",
        queuedAt: existing?.intelligence.queuedAt || now,
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    touched.add(id);
  }

  const next = Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeAccounts(workspaceId, next);
  return { upserted: touched.size, accounts: Array.from(touched) };
}

function customerKey(lead: Lead): string {
  const domain = leadDomain(lead);
  if (domain) return `domain:${domain.toLowerCase()}`;
  const company = normalizedKey(lead.companyName);
  if (company) return `company:${company}`;
  return `email:${lead.email.toLowerCase()}`;
}

function readCustomerIntel(workspaceId: string, lead: Lead): { dossier: CompanyIntelDossier | null; status: CompanyIntelStatus } {
  const paths = companyIntelPaths(workspaceId, leadToIntelInput(lead));
  const dossier = readJsonFile<CompanyIntelDossier | null>(paths.json, null);
  if (dossier) return { dossier, status: "ready" };
  const queued = readJsonFile<{ status?: string } | null>(path.join(paths.directory, "queued.json"), null);
  if (queued?.status === "queued") return { dossier: null, status: "queued" };
  return { dossier: null, status: "not_started" };
}

function readClientProfiles(workspaceId: string): ClientProfile[] {
  const clientsDir = ssaCompanyDataPath(workspaceId, "clients");
  if (!fs.existsSync(clientsDir)) return [];
  const profiles: ClientProfile[] = [];

  for (const entry of fs.readdirSync(clientsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const fileName of ["client-profile.json", "client.json"]) {
      const profile = readJsonFile<ClientProfile | null>(path.join(clientsDir, entry.name, fileName), null);
      if (profile) profiles.push(profile);
    }
  }

  return profiles;
}

function profileMatchesBucket(profile: ClientProfile, bucket: Pick<CustomerBucket, "companyName" | "domain">): boolean {
  const profileCompany = cleanText(profile.company);
  if (!profileCompany) return false;
  const profileKey = normalizedKey(profileCompany);
  const companyKey = normalizedKey(bucket.companyName);
  if (profileKey && companyKey && (profileKey.includes(companyKey) || companyKey.includes(profileKey))) return true;
  return Boolean(bucket.domain && normalizedKey(profileCompany).includes(normalizedKey(bucket.domain.replace(/\.[a-z]+$/i, ""))));
}

function currencyFromAmount(amount: string): string {
  const match = amount.match(/^[A-Z]{3}/);
  if (match) return match[0];
  if (amount.includes("$")) return "USD";
  return "";
}

function latestDate(values: Array<string | undefined | null>): string {
  return values.filter(Boolean).sort().pop() || new Date().toISOString();
}

function orderLifecycleNextStep(input: {
  stage?: CustomerOrderLifecycle["stage"];
  paymentStatus?: CustomerOrderLifecycle["paymentStatus"];
  fulfillmentStatus?: CustomerOrderLifecycle["fulfillmentStatus"];
}): string {
  if (input.stage === "exception" || input.fulfillmentStatus === "exception" || input.paymentStatus === "overdue") {
    return "Review exception owner, recovery action, and customer communication.";
  }
  if (input.stage === "refund" || input.paymentStatus === "refunded") {
    return "Confirm refund closure and preserve relationship context.";
  }
  if (input.stage === "after_sales") {
    return "Track after-sales resolution and repeat-order opportunity.";
  }
  if (input.paymentStatus === "paid") return "Prepare fulfillment and shipment update.";
  return "Confirm payment status and expected shipment date.";
}

function orderFromQuotation(quote: Quotation): InternalCustomerOrderView {
  return {
    internalId: quote.id,
    type: quote.type,
    date: quote.date,
    productType: quote.mainProducts || "Unspecified products",
    amount: quote.amount,
    currency: currencyFromAmount(quote.amount),
    status: quote.status,
    lifecycle: {
      stage: "quote",
      paymentStatus: "not_started",
      fulfillmentStatus: "not_started",
      nextStep: quote.status === "Confirmed" ? "Prepare PI and payment confirmation." : "Confirm quote feedback and purchasing timeline.",
    },
  };
}

function orderFromPiRecord(record: PiRecord): InternalCustomerOrderView {
  const raw = record as PiRecord & {
    paymentStatus?: CustomerOrderLifecycle["paymentStatus"];
    fulfillmentStatus?: CustomerOrderLifecycle["fulfillmentStatus"];
    lifecycleStage?: CustomerOrderLifecycle["stage"];
    status?: string;
  };
  const paymentStatus = raw.paymentStatus || "pending";
  const fulfillmentStatus = raw.fulfillmentStatus || "not_started";
  return {
    internalId: record.piNo,
    type: "PI",
    date: record.date,
    productType: record.productSummary || "Unspecified products",
    amount: record.amount,
    currency: currencyFromAmount(record.amount),
    status: raw.status || "Issued",
    lifecycle: {
      stage: raw.lifecycleStage || (fulfillmentStatus === "shipped" || fulfillmentStatus === "delivered" ? "shipment" : "payment"),
      paymentStatus,
      fulfillmentStatus,
      nextStep: orderLifecycleNextStep({
        stage: raw.lifecycleStage || (fulfillmentStatus === "shipped" || fulfillmentStatus === "delivered" ? "shipment" : "payment"),
        paymentStatus,
        fulfillmentStatus,
      }),
    },
  };
}

function orderFromProfile(profile: ClientProfile, fallbackId: string): InternalCustomerOrderView | null {
  const rfqDate = cleanText(profile.rfq_date);
  const products = profile.products_quoted?.filter(Boolean).join(", ") || "";
  if (!rfqDate && !products) return null;
  const idSuffix = fallbackId.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "CUSTOMER";
  return {
    internalId: `RFQ-${rfqDate.replace(/-/g, "") || "OPEN"}-${idSuffix}`,
    type: "QT",
    date: rfqDate || cleanText(profile.last_updated),
    productType: products || "Quoted products under review",
    amount: "—",
    currency: "",
    status: cleanText(profile.stage, "Quotation in Progress"),
    lifecycle: {
      stage: "quote",
      paymentStatus: "not_started",
      fulfillmentStatus: "not_started",
      nextStep: "Clarify requirements and move qualified demand toward PI.",
    },
  };
}

function orderFromActivity(activity: CustomerActivityRecord): InternalCustomerOrderView | null {
  if (activity.kind !== "order_status") return null;
  const metadata = activity.metadata || {};
  const orderType = cleanText(metadata.orderType, "Order");
  const type: InternalCustomerOrderView["type"] =
    orderType === "PI" || orderType === "QT" || orderType === "SPL" ? orderType : "Order";
  const stage = cleanText(metadata.lifecycleStage, "payment") as CustomerOrderLifecycle["stage"];
  const paymentStatus = cleanText(metadata.paymentStatus, "pending") as CustomerOrderLifecycle["paymentStatus"];
  const fulfillmentStatus = cleanText(metadata.fulfillmentStatus, "not_started") as CustomerOrderLifecycle["fulfillmentStatus"];
  const productType = customerVisibleText(metadata.productType, "Order");
  const amount = customerVisibleText(metadata.amount);
  const status = customerVisibleText(metadata.status, activity.status || stage);
  const orderNumber = cleanText(metadata.orderNumber);
  return {
    internalId: orderNumber || activity.id,
    type,
    date: activity.occurredAt,
    productType,
    amount,
    currency: currencyFromAmount(amount),
    status,
    lifecycle: {
      stage,
      paymentStatus,
      fulfillmentStatus,
      nextStep: orderLifecycleNextStep({
        stage,
        paymentStatus,
        fulfillmentStatus,
      }),
    },
  };
}

function recordMatchesBucket(record: { customer: string; id?: string; piNo?: string; productSummary?: string; mainProducts?: string }, bucket: CustomerBucket): boolean {
  const fields = [
    record.customer,
    record.id || "",
    record.piNo || "",
    record.productSummary || "",
    record.mainProducts || "",
  ].map(normalizedKey).filter(Boolean);
  const needles = [
    bucket.companyName,
    bucket.domain,
    bucket.dossier?.company.name || "",
    bucket.profile?.company || "",
    ...bucket.leads.map((lead) => lead.email),
  ].map(normalizedKey).filter(Boolean);
  return needles.some((needle) => fields.some((field) => field.includes(needle) || needle.includes(field)));
}

function dedupeOrders(orders: InternalCustomerOrderView[]): InternalCustomerOrderView[] {
  const byId = new Map<string, InternalCustomerOrderView>();
  for (const order of orders) {
    const existing = byId.get(order.internalId);
    if (!existing) {
      byId.set(order.internalId, order);
      continue;
    }
    const newer = (order.date || "").localeCompare(existing.date || "") >= 0 ? order : existing;
    const older = newer === order ? existing : order;
    byId.set(order.internalId, {
      ...newer,
      productType: cleanText(newer.productType, older.productType),
      amount: cleanText(newer.amount, older.amount),
      currency: cleanText(newer.currency, older.currency),
      lifecycle: {
        ...newer.lifecycle,
        paymentStatus: newer.lifecycle.paymentStatus === "pending" || newer.lifecycle.paymentStatus === "not_started"
          ? older.lifecycle.paymentStatus || newer.lifecycle.paymentStatus
          : newer.lifecycle.paymentStatus,
        fulfillmentStatus: newer.lifecycle.fulfillmentStatus === "not_started"
          ? older.lifecycle.fulfillmentStatus || newer.lifecycle.fulfillmentStatus
          : newer.lifecycle.fulfillmentStatus,
      },
    });
  }
  return Array.from(byId.values())
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 8);
}

function publicOrders(orders: InternalCustomerOrderView[]): CustomerOrderView[] {
  return orders.map(({ internalId: _internalId, ...order }) => order);
}

function pendingEmailMatchesBucket(email: PendingEmail, bucket: CustomerBucket): boolean {
  const fields = [email.to, email.subject, email.reason].map(normalizedKey).filter(Boolean);
  const needles = [
    bucket.companyName,
    bucket.domain,
    bucket.dossier?.company.name || "",
    bucket.profile?.company || "",
    ...bucket.leads.map((lead) => lead.email),
    ...bucket.activities.map((activity) => activity.contactEmail),
  ].map(normalizedKey).filter(Boolean);
  return needles.some((needle) => fields.some((field) => field.includes(needle) || needle.includes(field)));
}

function followUpActivityFromPendingEmail(workspaceId: string, email: PendingEmail, bucket: CustomerBucket): CustomerActivityRecord {
  return {
    id: `follow-up:${email.id}`,
    workspaceId,
    customerId: bucket.account?.id || bucket.id,
    customerName: bucket.companyName,
    kind: "follow_up_due",
    occurredAt: email.scheduledAt,
    createdAt: email.scheduledAt,
    contactName: "",
    contactEmail: email.to,
    subject: email.subject,
    summary: customerVisibleText(`${email.subject}${email.reason ? ` - ${email.reason}` : ""}`),
    status: "due",
    source: "follow-up",
  };
}

function contactsFromBucket(bucket: CustomerBucket): CustomerContactView[] {
  const contacts: CustomerContactView[] = [];
  const seen = new Set<string>();

  for (const contact of bucket.dossier?.contacts || []) {
    const email = cleanText(contact.email);
    const key = email || `${contact.name}:${contact.role}`;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    contacts.push({
      name: cleanText(contact.name, email || "Unknown contact"),
      role: cleanText(contact.role, "Unknown role"),
      email,
      emailStatus: cleanText(contact.verification_status, "unknown"),
      sourceNote: customerVisibleText(contact.source_note, "From customer background check."),
    });
  }

  for (const lead of bucket.leads) {
    const key = lead.email || `${lead.contact}:${lead.position}`;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    contacts.push({
      name: cleanText(lead.contact, lead.email || "Unknown contact"),
      role: cleanText(lead.position, "Unknown role"),
      email: lead.email,
      emailStatus: "not_checked",
      sourceNote: "From customer source record.",
    });
  }

  for (const activity of bucket.activities) {
    if (activity.kind === "lifecycle_status") continue;
    const key = activity.contactEmail || `${activity.contactName}:${activity.customerName}`;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    contacts.push({
      name: cleanText(activity.contactName, activity.contactEmail || "Unknown contact"),
      role: "Email contact",
      email: activity.contactEmail,
      emailStatus: "not_checked",
      sourceNote: "From customer email.",
    });
  }

  if (contacts.length === 0 && bucket.profile?.contact) {
    contacts.push({
      name: bucket.profile.contact,
      role: "Primary contact",
      email: "",
      emailStatus: "unknown",
      sourceNote: "From customer profile.",
    });
  }

  return contacts.slice(0, 8);
}

function statusSlug(status: CustomerStatus): string {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, ".");
}

function statusExplanation(input: {
  status: CustomerStatus;
  reason: string;
  signals: string[];
  updatedAt: string;
  manualOverride?: boolean;
  ruleId: string;
  priority: number;
  enteredWhen: string;
  exitsWhen: string;
}): CustomerStatusExplanation {
  return {
    status: input.status,
    reason: input.reason,
    signals: input.signals,
    updatedAt: input.updatedAt,
    manualOverride: Boolean(input.manualOverride),
    ruleId: input.ruleId,
    priority: input.priority,
    enteredWhen: input.enteredWhen,
    exitsWhen: input.exitsWhen,
  };
}

function hasManualStatusOverride(account: CustomerAccountRecord | null): account is CustomerAccountRecord {
  if (!account?.status || !CUSTOMER_STATUSES.includes(account.status)) return false;
  if (account.statusOverride?.status && CUSTOMER_STATUSES.includes(account.statusOverride.status)) return true;
  if (account.status !== "Prospect") return true;
  return account.sources.some((source) => /manual|operator|override/i.test(`${source.reason} ${source.category} ${source.type}`));
}

function orderActivityKey(activity: CustomerActivityRecord): string {
  const metadata = activity.metadata || {};
  const orderNumber = cleanText(metadata.orderNumber);
  if (orderNumber) return `order:${orderNumber.toLowerCase()}`;
  return [
    activity.customerId,
    activity.contactEmail,
    cleanText(metadata.productType),
    cleanText(metadata.amount),
  ].filter(Boolean).join("|").toLowerCase() || activity.id.toLowerCase();
}

function latestOrderActivities(activities: CustomerActivityRecord[]): CustomerActivityRecord[] {
  const byOrder = new Map<string, CustomerActivityRecord>();
  for (const activity of activities) {
    if (activity.kind !== "order_status") continue;
    const key = orderActivityKey(activity);
    const existing = byOrder.get(key);
    if (!existing || activity.occurredAt.localeCompare(existing.occurredAt) >= 0) {
      byOrder.set(key, activity);
    }
  }
  return Array.from(byOrder.values());
}

function orderActivityHasOpenRisk(activity: CustomerActivityRecord): boolean {
  return /exception|overdue|dispute|quality issue/i.test(`${activity.status} ${activity.summary} ${JSON.stringify(activity.metadata || {})}`);
}

function evaluateCustomerStatus(bucket: CustomerBucket): CustomerStatusExplanation {
  const profileStatus = `${bucket.profile?.status || ""} ${bucket.profile?.stage || ""}`.toLowerCase();
  const updatedAt = latestDate([
    bucket.account?.updatedAt,
    bucket.profile?.last_updated,
    bucket.dossier?.generated_at,
    ...bucket.orders.map((order) => order.date),
    ...bucket.activities.map((activity) => activity.occurredAt),
  ]);
  const signals: string[] = [];

  if (hasManualStatusOverride(bucket.account)) {
    const override = bucket.account.statusOverride;
    const reason = cleanText(override?.reason, `Customer status is manually set to ${bucket.account.status}.`);
    return statusExplanation({
      status: override?.status || bucket.account.status,
      reason,
      signals: [`manual override: ${bucket.account.status}`],
      updatedAt: override?.setAt || updatedAt,
      manualOverride: true,
      ruleId: `manual.override.${statusSlug(bucket.account.status)}`,
      priority: 100,
      enteredWhen: "An operator manually sets this customer status.",
      exitsWhen: "The manual override is changed or removed by an operator.",
    });
  }

  if (/archiv|closed/.test(profileStatus)) {
    return statusExplanation({
      status: "Archived",
      reason: "Customer profile is marked archived or closed.",
      signals: ["profile archived"],
      updatedAt,
      ruleId: "profile.archived",
      priority: 90,
      enteredWhen: "Customer profile contains archived, closed, or equivalent wording.",
      exitsWhen: "Profile is reopened and no stronger lifecycle signal applies.",
    });
  }

  if (/risk|suspicious/.test(profileStatus) || bucket.dossier?.company.status === "risk" || bucket.dossier?.company.status === "suspicious" || bucket.dossier?.red_lines?.length) {
    if (/risk|suspicious/.test(profileStatus)) signals.push("profile risk");
    if (bucket.dossier?.company.status === "risk" || bucket.dossier?.company.status === "suspicious") signals.push("background risk");
    if (bucket.dossier?.red_lines?.length) signals.push("background red lines");
    return statusExplanation({
      status: "Risk",
      reason: `Risk status is based on ${signals.join(", ")}.`,
      signals,
      updatedAt,
      ruleId: "risk.detected",
      priority: 80,
      enteredWhen: "Profile, background check, or risk notes flag a suspicious or risky customer condition.",
      exitsWhen: "Risk signals are resolved or manually overridden.",
    });
  }

  const exceptionActivity = latestOrderActivities(bucket.activities).find(orderActivityHasOpenRisk);
  if (exceptionActivity) {
    return statusExplanation({
      status: "Risk",
      reason: "Risk status is based on order activity exception or overdue payment.",
      signals: ["order activity exception"],
      updatedAt,
      ruleId: "risk.order_activity_exception",
      priority: 74,
      enteredWhen: "A CRM order activity records exception fulfillment, overdue payment, dispute, or quality issue status.",
      exitsWhen: "The order activity is resolved by a newer update or an operator overrides the status.",
    });
  }

  const exceptionOrder = bucket.orders.find((order) =>
    order.lifecycle.stage === "exception" ||
    order.lifecycle.fulfillmentStatus === "exception" ||
    order.lifecycle.paymentStatus === "overdue" ||
    /exception|dispute|overdue|quality issue/i.test(order.status)
  );
  if (exceptionOrder) {
    return statusExplanation({
      status: "Risk",
      reason: `Risk status is based on ${exceptionOrder.productType || "recent order"} exception or overdue payment.`,
      signals: [`${exceptionOrder.type} order exception`],
      updatedAt,
      ruleId: "risk.order_exception",
      priority: 75,
      enteredWhen: "An order has exception fulfillment, overdue payment, dispute, or quality issue status.",
      exitsWhen: "The exception is resolved, payment is recovered, or an operator overrides the status.",
    });
  }

  const activeOrder = bucket.orders.find((order) => order.type === "PI" || order.status === "Confirmed" || order.status === "Issued");
  const inboundEmail = bucket.activities.find((activity) => activity.kind === "email_received");
  if (/active|order|customer/.test(profileStatus)) signals.push("active profile");
  if (activeOrder) signals.push(`${activeOrder.type} order`);
  if (inboundEmail) signals.push("inbound email");
  if (signals.length) {
    return statusExplanation({
      status: "Active Customer",
      reason: activeOrder
        ? `Active Customer because recent ${activeOrder.type} order activity is present.`
        : inboundEmail
          ? "Active Customer because a recent inbound email entered the CRM timeline."
          : "Active Customer because the profile shows active customer engagement.",
      signals,
      updatedAt,
      ruleId: activeOrder ? "active.order" : inboundEmail ? "active.inbound_email" : "active.profile",
      priority: 70,
      enteredWhen: "A confirmed quote, PI/order, inbound email, or active customer profile exists.",
      exitsWhen: "No active order or inbound engagement remains and Dormant, Risk, Archived, or manual rules do not apply.",
    });
  }

  if (/dormant|sleep|inactive/.test(profileStatus)) {
    return statusExplanation({
      status: "Dormant",
      reason: "Customer profile is marked dormant or inactive.",
      signals: ["inactive profile"],
      updatedAt,
      ruleId: "dormant.profile",
      priority: 60,
      enteredWhen: "Customer profile is marked dormant, sleeping, or inactive.",
      exitsWhen: "New qualifying activity appears or an operator changes the status.",
    });
  }

  const last = new Date(updatedAt).getTime();
  if (!Number.isNaN(last) && Date.now() - last > 180 * 24 * 60 * 60 * 1000) {
    return statusExplanation({
      status: "Dormant",
      reason: "No recent customer activity has been recorded for more than 180 days.",
      signals: ["activity older than 180 days"],
      updatedAt,
      ruleId: "dormant.inactivity_180d",
      priority: 50,
      enteredWhen: "Latest customer activity is older than 180 days.",
      exitsWhen: "A new email, quote, PI/order, or manual override appears.",
    });
  }

  return statusExplanation({
    status: "Prospect",
    reason: "Customer has entered the CRM but does not yet have qualifying order or inbound email activity.",
    signals: bucket.leads.length ? ["customer source"] : [],
    updatedAt,
    ruleId: "prospect.default",
    priority: 10,
    enteredWhen: "Customer exists in the CRM before order, risk, dormancy, archive, or manual status signals appear.",
    exitsWhen: "Background risk, active engagement, order activity, dormancy, archive, or manual override applies.",
  });
}

function intelCompleteness(dossier: CompanyIntelDossier | null, status: CompanyIntelStatus): string {
  if (!dossier) {
    if (status === "queued" || status === "running") return "Background check in progress";
    return "Background check pending";
  }
  const notConfigured = dossier.channel_audit?.some((item) => item.status === "not_configured");
  return notConfigured ? "Background check partially complete" : "Background check complete";
}

function intelligenceFromBucket(bucket: CustomerBucket): CustomerIntelligenceView {
  const dossier = bucket.dossier;
  return {
    status: dossier ? "ready" : bucket.intelStatus,
    score: dossier?.lead_score ?? null,
    rating: dossier?.rating || "Unknown",
    completenessLabel: intelCompleteness(dossier, bucket.intelStatus),
    companySummary: businessText(dossier?.sales_entry.opener_business, bucket.profile?.notes || "Company background is not complete yet."),
    productFit: businessText(dossier?.sales_entry.product_match, bucket.profile?.products_quoted?.join(", ") || "Product fit needs review."),
    salesAngle: businessText(dossier?.sales_entry.angle, "Verify customer need and buying role before outreach."),
    riskSummary: customerVisibleText(dossier?.red_lines?.length
      ? dossier.red_lines.join("; ")
      : dossier?.financial_data.confidence === "low"
        ? "Registry or financial data needs follow-up."
        : "No major risk flagged yet."),
    generatedAt: cleanText(dossier?.generated_at),
  };
}

function nextActions(bucket: CustomerBucket): string[] {
  const actions = bucket.dossier?.recommended_next_actions?.filter(Boolean) || [];
  if (actions.length) return actions.slice(0, 5).map((action) => customerVisibleText(action));
  if (bucket.orders.length) return ["Review recent quote or PI context.", "Prepare a focused follow-up.", "Confirm next purchasing timeline."];
  return ["Verify primary contact.", "Complete company background check.", "Prepare first outreach once customer fit is confirmed."];
}

function interactionsFromBucket(bucket: CustomerBucket): CustomerInteractionView[] {
  const interactions: CustomerInteractionView[] = [];
  const statusExplanation = evaluateCustomerStatus(bucket);
  const hasMatchingLifecycleEvidence = bucket.activities.some((activity) =>
    activity.kind === "lifecycle_status" && activity.status === statusExplanation.status
  );
  if (!hasMatchingLifecycleEvidence) {
    interactions.push({
      date: statusExplanation.updatedAt,
      type: "Lifecycle",
      summary: `${statusExplanation.status}: ${statusExplanation.reason}`,
    });
  }
  for (const order of bucket.orders) {
    const product = order.productType || "Order";
    const amount = order.amount || "open amount";
    interactions.push({
      date: order.date,
      type: order.type === "PI" ? "Order" : "Quote",
      summary: `${product} ${amount}`.trim(),
    });
    if (order.type === "PI") {
      interactions.push({
        date: order.date,
        type: "Payment",
        summary: `${product} payment ${order.lifecycle.paymentStatus || "pending"} for ${amount}.`,
      });
      interactions.push({
        date: order.date,
        type: "Shipment",
        summary: `${product} shipment ${order.lifecycle.fulfillmentStatus || "not_started"}.`,
      });
    }
    if (order.lifecycle.stage === "after_sales") {
      interactions.push({
        date: order.date,
        type: "After-sales",
        summary: `${product} after-sales follow-up is active.`,
      });
    }
    if (order.lifecycle.stage === "refund") {
      interactions.push({
        date: order.date,
        type: "Refund",
        summary: `${product} refund follow-up is active.`,
      });
    }
    if (order.lifecycle.stage === "exception" || order.lifecycle.fulfillmentStatus === "exception" || order.lifecycle.paymentStatus === "overdue") {
      interactions.push({
        date: order.date,
        type: "Exception",
        summary: `${product} exception requires review: payment ${order.lifecycle.paymentStatus || "unknown"}, shipment ${order.lifecycle.fulfillmentStatus || "unknown"}.`,
      });
    }
  }
  for (const activity of bucket.activities) {
    if (activity.kind === "order_status") {
      const metadata = activity.metadata || {};
      const stage = cleanText(metadata.lifecycleStage).toLowerCase();
      const paymentStatus = cleanText(metadata.paymentStatus).toLowerCase();
      const fulfillmentStatus = cleanText(metadata.fulfillmentStatus).toLowerCase();
      const summaryText = `${activity.status} ${activity.summary}`.toLowerCase();
      interactions.push({
        date: activity.occurredAt,
        type: stage === "exception" || fulfillmentStatus === "exception" || paymentStatus === "overdue" || /exception|overdue|dispute|quality issue/.test(summaryText)
          ? "Exception"
          : stage === "refund" || paymentStatus === "refunded"
            ? "Refund"
            : stage === "after_sales"
              ? "After-sales"
              : stage === "shipment" || fulfillmentStatus === "shipped" || fulfillmentStatus === "delivered"
                ? "Shipment"
                : "Payment",
        summary: customerVisibleText(activity.summary || activity.subject),
      });
      continue;
    }
    interactions.push({
      date: activity.occurredAt,
      type: activity.kind === "follow_up_due" || activity.kind === "crm_note" ? "Follow-up" : activity.kind === "lifecycle_status" ? "Lifecycle" : "Email",
      summary: customerVisibleText(activity.summary || activity.subject),
    });
  }
  if (bucket.dossier?.generated_at) {
    interactions.push({
      date: bucket.dossier.generated_at.slice(0, 10),
      type: "Intel",
      summary: `Background check ${bucket.dossier.rating} / ${bucket.dossier.lead_score}`,
    });
  }
  for (const lead of bucket.leads) {
    interactions.push({
      date: bucket.profile?.rfq_date || bucket.profile?.last_updated || "",
      type: "Lead",
      summary: customerVisibleText(lead.reason || lead.category || "Lead entered customer pool"),
    });
  }
  return interactions
    .filter((item) => item.summary)
    .map((item) => ({
      ...item,
      summary: businessText(item.summary),
    }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 12);
}

function recentSummary(orders: CustomerOrderView[], interactions: CustomerInteractionView[]): string {
  const order = orders[0];
  if (order) return `${order.date || "Recent"} ${order.type} ${order.amount || ""}`.trim();
  const interaction = interactions.find((item) => item.type === "Email" || item.type === "Follow-up" || item.type === "Quote" || item.type === "Order") || interactions[0];
  if (interaction) return interaction.summary;
  return "No recent activity";
}

function customerIdFromBucket(bucket: CustomerBucket): string {
  if (bucket.account?.id) return bucket.account.id;
  if (bucket.leads[0]) return companyIntelClientSlug(leadToIntelInput(bucket.leads[0]));
  return bucket.id;
}

function intelStatusRank(status: CompanyIntelStatus): number {
  const ranks: Record<CompanyIntelStatus, number> = {
    not_started: 0,
    queued: 1,
    running: 2,
    failed: 3,
    ready: 4,
  };
  return ranks[status] ?? 0;
}

function dedupeLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = [
      lead.companyName,
      lead.email,
      lead.homepage,
    ].filter(Boolean).join("|").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeActivities(activities: CustomerActivityRecord[]): CustomerActivityRecord[] {
  const byId = new Map<string, CustomerActivityRecord>();
  for (const activity of activities) {
    byId.set(activity.id, activity);
  }
  return Array.from(byId.values()).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function mergeBucket(existing: CustomerBucket, incoming: CustomerBucket): CustomerBucket {
  const account = existing.account || incoming.account;
  return {
    id: account?.id || existing.id || incoming.id,
    domain: cleanText(existing.domain, incoming.domain),
    companyName: cleanText(existing.companyName, incoming.companyName),
    country: cleanText(existing.country, incoming.country),
    website: cleanText(existing.website, incoming.website),
    industry: cleanText(existing.industry, incoming.industry),
    leads: dedupeLeads([...existing.leads, ...incoming.leads]),
    account,
    dossier: existing.dossier || incoming.dossier,
    intelStatus: intelStatusRank(existing.intelStatus) >= intelStatusRank(incoming.intelStatus) ? existing.intelStatus : incoming.intelStatus,
    profile: existing.profile || incoming.profile,
    orders: dedupeOrders([...existing.orders, ...incoming.orders]),
    activities: dedupeActivities([...existing.activities, ...incoming.activities]),
  };
}

function mergeBucketsByCustomerId(buckets: CustomerBucket[]): CustomerBucket[] {
  const byCustomerId = new Map<string, CustomerBucket>();
  for (const bucket of buckets) {
    const customerId = customerIdFromBucket(bucket).toLowerCase();
    const existing = byCustomerId.get(customerId);
    byCustomerId.set(customerId, existing ? mergeBucket(existing, bucket) : bucket);
  }
  return Array.from(byCustomerId.values());
}

function bucketToCustomer(bucket: CustomerBucket): CustomerView {
  const intelligence = intelligenceFromBucket(bucket);
  const contacts = contactsFromBucket(bucket);
  const statusExplanation = evaluateCustomerStatus(bucket);
  const interactions = interactionsFromBucket(bucket);
  const country = cleanText(bucket.dossier?.company.country, bucket.profile?.country || bucket.country);
  const website = cleanText(bucket.dossier?.company.website, bucket.website);
  const domain = cleanText(bucket.dossier?.company.domain, bucket.domain || domainFromUrl(website));
  return {
    id: bucket.account?.id || (bucket.leads[0] ? companyIntelClientSlug(leadToIntelInput(bucket.leads[0])) : bucket.id),
    companyName: cleanText(bucket.dossier?.company.name, bucket.profile?.company || bucket.companyName),
    country,
    website,
    domain,
    industry: cleanText(bucket.profile?.industry, bucket.industry),
    status: statusExplanation.status,
    statusExplanation,
    sourceCount: Math.max(bucket.leads.length, bucket.account?.sources.length || 0),
    sourceSummary: `${Math.max(bucket.leads.length, bucket.account?.sources.length || 0)} customer source${Math.max(bucket.leads.length, bucket.account?.sources.length || 0) === 1 ? "" : "s"}`,
    intelligence,
    contacts,
    orders: publicOrders(bucket.orders),
    interactions,
    nextActions: nextActions(bucket),
    recentSummary: recentSummary(bucket.orders, interactions),
    updatedAt: bucket.dossier?.generated_at || bucket.profile?.last_updated || bucket.account?.updatedAt || new Date().toISOString(),
  };
}

function customerMatches(customer: CustomerView, search: string): boolean {
  const normalizedSearch = normalizedKey(search);
  if (!normalizedSearch) return true;
  return [
    customer.companyName,
    customer.country,
    customer.industry,
    customer.website,
    customer.domain,
    ...customer.contacts.flatMap((contact) => [contact.name, contact.role, contact.email]),
  ].some((value) => {
    const lower = value.toLowerCase();
    return lower.includes(search.toLowerCase()) || normalizedKey(value).includes(normalizedSearch);
  });
}

function statsFromCustomers(customers: CustomerView[]): CustomerDirectoryStats {
  const countries = new Set(customers.map((customer) => customer.country).filter(Boolean));
  return {
    total: customers.length,
    prospect: customers.filter((customer) => customer.status === "Prospect").length,
    active: customers.filter((customer) => customer.status === "Active Customer").length,
    dormant: customers.filter((customer) => customer.status === "Dormant").length,
    risk: customers.filter((customer) => customer.status === "Risk").length,
    archived: customers.filter((customer) => customer.status === "Archived").length,
    countries: countries.size,
  };
}

export function buildCustomerDirectory(
  runtime: SalesRuntime,
  workspaceId: string,
  params: CustomerDirectoryParams = {}
): CustomerDirectoryReadModel {
  const workspace = runtime.getWorkspace(workspaceId);
  const leads = runtime.memory.getLeads(workspace.id, { page: 1, pageSize: 1000 }).data || [];
  const accounts = readAccounts(workspace.id);
  const profiles = readClientProfiles(workspace.id);
  const buckets = new Map<string, CustomerBucket>();

  for (const account of accounts) {
    const accountLead = account.sources[0] ? sourceToLead(account.sources[0], account) : {
      companyName: account.companyName,
      country: account.country,
      industry: account.industry,
      contact: "",
      position: "",
      email: "",
      homepage: account.website,
      category: "",
      reason: "",
      confidence: "",
      score: "Cold" as const,
    };
    const intel = readCustomerIntel(workspace.id, accountLead);
    const bucket: CustomerBucket = {
      id: account.id,
      domain: account.domain,
      companyName: account.companyName,
      country: account.country,
      website: account.website,
      industry: account.industry,
      leads: account.sources.map((source) => sourceToLead(source, account)),
      account,
      dossier: intel.dossier,
      intelStatus: intel.dossier ? "ready" : account.intelligence.status,
      profile: null,
      orders: [],
      activities: [],
    };
    buckets.set(`account:${account.id}`, bucket);
  }

  for (const lead of leads) {
    const key = customerKey(lead);
    const domain = leadDomain(lead);
    const intel = readCustomerIntel(workspace.id, lead);
    const accountKey = domain ? `account:${domain}` : "";
    const bucket = (accountKey ? buckets.get(accountKey) : undefined) || buckets.get(key) || {
      id: domain || companyIntelClientSlug(leadToIntelInput(lead)),
      domain,
      companyName: lead.companyName,
      country: lead.country,
      website: normalizeWebsite(lead.homepage),
      industry: lead.industry,
      leads: [],
      account: null,
      dossier: null,
      intelStatus: "not_started" as CompanyIntelStatus,
      profile: null,
      orders: [],
      activities: [],
    };
    bucket.leads.push(lead);
    if (!bucket.dossier && intel.dossier) bucket.dossier = intel.dossier;
    if (bucket.intelStatus === "not_started" || intel.status === "ready") bucket.intelStatus = intel.status;
    buckets.set(bucket.account ? `account:${bucket.account.id}` : key, bucket);
  }

  for (const profile of profiles) {
    const existing = Array.from(buckets.values()).find((bucket) => profileMatchesBucket(profile, bucket));
    if (existing) {
      existing.profile = profile;
      existing.companyName = cleanText(existing.companyName, profile.company || "");
      existing.country = cleanText(existing.country, profile.country || "");
      existing.industry = cleanText(existing.industry, profile.industry || "");
    }
  }

  for (const activity of readCustomerActivitiesForDirectory(workspace.id)) {
    const existing = buckets.get(`account:${activity.customerId}`) || Array.from(buckets.values()).find((bucket) =>
      normalizedKey(bucket.companyName) === normalizedKey(activity.customerName) ||
      bucket.leads.some((lead) => lead.email.toLowerCase() === activity.contactEmail.toLowerCase()) ||
      Boolean(bucket.domain && activity.contactEmail.toLowerCase().endsWith(`@${bucket.domain.toLowerCase()}`))
    );
    if (existing) {
      existing.activities.push(activity);
      continue;
    }
    buckets.set(`account:${activity.customerId}`, {
      id: activity.customerId,
      domain: domainFromEmail(activity.contactEmail),
      companyName: activity.customerName,
      country: "",
      website: activity.contactEmail ? normalizeWebsite(domainFromEmail(activity.contactEmail)) : "",
      industry: "",
      leads: [],
      account: null,
      dossier: null,
      intelStatus: "not_started",
      profile: null,
      orders: [],
      activities: [activity],
    });
  }

  const customerBuckets = mergeBucketsByCustomerId(Array.from(buckets.values()));

  for (const bucket of customerBuckets) {
    const quotationOrders = runtime.memory.getQuotations(workspace.id, { page: 1, pageSize: 500 }).quotations
      .filter((quote) => recordMatchesBucket(quote, bucket))
      .map(orderFromQuotation);
    const piOrders = runtime.listPiRecords(workspace.id).records
      .filter((record) => recordMatchesBucket(record, bucket))
      .map(orderFromPiRecord);
    const activityOrders = bucket.activities
      .map(orderFromActivity)
      .filter((order): order is InternalCustomerOrderView => Boolean(order));
    const profileOrder = bucket.profile ? orderFromProfile(bucket.profile, bucket.id || bucket.domain || bucket.companyName) : null;
    bucket.orders = dedupeOrders([...(profileOrder ? [profileOrder] : []), ...activityOrders, ...piOrders, ...quotationOrders]);
  }

  const pendingFollowUps = runtime.memory.getPendingEmails(workspace.id);
  for (const bucket of customerBuckets) {
    const followUps = pendingFollowUps
      .filter((email) => pendingEmailMatchesBucket(email, bucket))
      .map((email) => followUpActivityFromPendingEmail(workspace.id, email, bucket));
    const existingIds = new Set(bucket.activities.map((activity) => activity.id));
    bucket.activities.push(...followUps.filter((activity) => !existingIds.has(activity.id)));
  }

  const allCustomers = customerBuckets
    .map(bucketToCustomer)
    .sort((a, b) => {
      const scoreDelta = (b.intelligence.score || 0) - (a.intelligence.score || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return a.companyName.localeCompare(b.companyName);
    });

  const status = cleanText(params.status);
  const country = cleanText(params.country);
  const filtered = allCustomers
    .filter((customer) => customerMatches(customer, params.search || ""))
    .filter((customer) => !status || status === "All" || customer.status === status)
    .filter((customer) => !country || country === "All" || customer.country === country);
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  return {
    workspaceId: workspace.id,
    customers: filtered.slice(start, start + pageSize),
    stats: statsFromCustomers(allCustomers),
    countries: Array.from(new Set(allCustomers.map((customer) => customer.country).filter(Boolean))).sort(),
    statuses: CUSTOMER_STATUSES,
    total,
    page,
    pageSize,
    totalPages,
    updatedAt: new Date().toISOString(),
  };
}

export function syncCustomerLifecycleStatuses(
  runtime: SalesRuntime,
  workspaceId: WorkspaceId,
  options: { now?: string } = {}
): CustomerLifecycleSyncResult {
  const workspace = runtime.getWorkspace(workspaceId);
  const now = options.now || new Date().toISOString();
  const directory = buildCustomerDirectory(runtime, workspace.id, {
    page: 1,
    pageSize: 100,
  });
  const previousState = readLifecycleState(workspace.id);
  const nextState: Record<string, StoredCustomerLifecycleState> = { ...previousState };
  const changes: CustomerLifecycleSyncResult["changes"] = [];

  for (const customer of directory.customers) {
    const explanation = customer.statusExplanation;
    const key = lifecycleStateKey(customer.id);
    const previous = previousState[key];

    if (shouldRecordAutomaticLifecycleChange(explanation, previous)) {
      appendAutomaticLifecycleActivity({
        workspaceId: workspace.id,
        customer,
        previous,
        now,
      });
      changes.push({
        customerId: customer.id,
        companyName: customer.companyName,
        status: explanation.status,
        ruleId: explanation.ruleId,
        reason: explanation.reason,
      });
    }

    nextState[key] = {
      customerId: customer.id,
      status: explanation.status,
      ruleId: explanation.ruleId,
      manualOverride: explanation.manualOverride,
      reason: explanation.reason,
      updatedAt: explanation.updatedAt || now,
    };
  }

  writeLifecycleState(workspace.id, nextState);
  if (changes.length) {
    runtime.recordEvent("customer.lifecycle.synced", workspace.id, {
      evaluated: directory.customers.length,
      recorded: changes.length,
      sideEffects: "local-only",
    });
  }

  return {
    workspaceId: workspace.id,
    evaluated: directory.customers.length,
    recorded: changes.length,
    changes,
  };
}

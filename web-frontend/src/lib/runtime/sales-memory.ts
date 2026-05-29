import fs from "fs";
import path from "path";
import type { ApiResponse, PaginatedResponse } from "../api-types";
import {
  getEmailDrafts,
  getEmailStats,
  getPendingEmails,
  getSentEmailsPaginated,
  type EmailDraft,
  type EmailStats,
  type PendingEmail,
  type SentEmail,
} from "../emails";
import { getCountries, getLeads, getLeadStats, invalidateCache, loadLeadsRaw, type Lead, type LeadStats } from "../leads";
import { MOCK_INBOX, MOCK_INBOX_STATS } from "../mock/inbox";
import {
  getQuotationStats,
  getQuotationTypes,
  getQuotations,
  invalidateQuotationCache,
  type Quotation,
  type QuotationListResult,
  type QuotationStats,
} from "../quotations";
import { getAgentById, getAgents, type Agent } from "../agents";
import type { InboundEmail, InboxStats } from "../../types/inbox";
import type {
  AgentStateReadModel,
  AgentStateSummary,
  ApprovalInput,
  ApprovalPatchInput,
  ApprovalRecord,
  ApprovalStatus,
  IntelligenceFeedReadModel,
  IntelligenceFeedType,
  Customer360ReadModel,
  MemorySearchInput,
  MemoryWriteInput,
  WorkspaceId,
} from "./types";
import { getWorkspaceAdapter } from "./workspaces";
import { ensureSsaCompanyDataPath, readJsonFile, ssaCompanyDataPath, ssaDataPath } from "../ssa-data-paths";
import { createMemoryEngine, type MemoryEngine } from "./memory-engine";
import { createRuntimeTaskQueue } from "./task-queue";

type LeadRecord = Lead;

export interface InboxListResult extends ApiResponse<InboundEmail[]> {
  total: number;
  stats: InboxStats;
}

export interface SentEmailPage {
  items: SentEmail[];
  total: number;
  page: number;
  totalPages: number;
}

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  color: string;
}

export interface PipelineFunnel {
  stages: FunnelStage[];
  totalConversionRate: number;
  updatedAt: string;
}

export interface DashboardAgentTask {
  task: string;
  status: "processing" | "pending" | "completed";
  progress: number;
  timestamp?: string;
}

export interface DashboardRecentLead {
  name: string;
  email: string;
  status: string;
  time: string;
  score: number;
}

export interface DashboardOverviewReadModel {
  stats: {
    activeLeads: number;
    todayEmails: number;
    pendingQuotations: number;
    conversionRate: number;
  };
  recentLeads: DashboardRecentLead[];
  agentTasks: DashboardAgentTask[];
}

export interface DashboardTrendSeries {
  label: string;
  unit?: string;
  points: number[];
  labels: string[];
}

export interface DashboardTrendsReadModel {
  series: {
    activeLeads: DashboardTrendSeries;
    todayEmails: DashboardTrendSeries;
    pendingQuotations: DashboardTrendSeries;
    conversionRate: DashboardTrendSeries;
  };
  updatedAt: string;
}

export interface HeroDashboardData {
  sent?: Array<{ company?: string; subject?: string; sent_at?: string }>;
  followUp?: Record<string, { has_reply?: boolean }>;
  replies?: Array<Record<string, unknown>>;
  leads?: Array<{ company?: string; email?: string; tier?: string }>;
}

export interface IntakeMemoryMatch {
  kind: "lead" | "quotation" | "document";
  title: string;
  detail: string;
  confidence: number;
}

type MemoryEventRecorder = (type: string, workspaceId: WorkspaceId, payload: Record<string, unknown>) => unknown;

let heroLeadCache: Array<Record<string, string>> | null = null;
const workspaceLeadCache = new Map<string, LeadRecord[]>();

const DEFAULT_APPROVALS: Array<Omit<ApprovalRecord, "workspaceId" | "project" | "createdAt" | "updatedAt"> & { project?: string }> = [
  {
    id: "amphenol-counter",
    dealId: "amphenol",
    deal_id: "amphenol",
    account: "Amphenol Asia",
    title: "Counter-offer and LME clause",
    triggerType: "starter-pack",
    value: "$847K quarterly PO",
    risk: "Medium margin exposure",
    due: "Now",
    recommendation: "Approve 8% discount at $0.916/m with quarterly LME review.",
    guardrail: "External send is blocked until Wilson approves this draft.",
    status: "pending",
    metadata: { source: "farreach-starter-pack" },
  },
  {
    id: "molex-retention",
    dealId: "molex",
    deal_id: "molex",
    account: "Molex Shanghai",
    title: "Renewal retention strategy",
    triggerType: "starter-pack",
    value: "$4.2M annual renewal",
    risk: "Competitor undercut",
    due: "Today 16:00",
    recommendation: "Ask AI to prepare bundle pricing, then review before sending.",
    guardrail: "No customer-facing message prepared yet.",
    status: "pending",
    metadata: { source: "farreach-starter-pack" },
  },
  {
    id: "te-tier-two",
    dealId: "te-connectivity",
    deal_id: "te-connectivity",
    account: "TE Connectivity",
    title: "Tier-2 quote release",
    triggerType: "starter-pack",
    value: "$2.4M RFQ",
    risk: "Low",
    due: "After copper check",
    recommendation: "Approve quote package if LME stays within +3% band.",
    guardrail: "Quote PDFs can be prepared here, but nothing is sent to customers.",
    status: "pending",
    metadata: { source: "farreach-starter-pack" },
  },
];

const COMPETITOR_JUNK_PATTERNS = [
  /discover\//i,
  /tag\//i,
  /trending/i,
];

const NEWS_JUNK_TITLE_PATTERNS = [
  /market (size|share|forecast|report|analysis|demand|statistics|outlook)/i,
  /\$[\d.]+\s*(billion|bn)/i,
  /\d+(\.\d+)?%\s*cagr/i,
  /market (to (garner|reach)|is expected to)/i,
  /key (players|trends|drivers)/i,
  /segmentation by/i,
  /latest top stories?/i,
  /follow the latest/i,
];

const NEWS_JUNK_SOURCES = [
  "alliedmarketresearch",
  "researchnester",
  "thebusinessresearchcompany",
  "grandviewresearch",
  "mordorintelligence",
  "marketresearchfuture",
  "gii.tw",
  "statista",
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current.trim());
  return result;
}

function categoryToLeadScore(category: string, fallbackTier = ""): "Hot" | "Warm" | "Cold" {
  const value = `${category} ${fallbackTier}`.toLowerCase();
  if (category === "A" || category === "A|B" || value.includes("tier1") || value.includes("hot")) return "Hot";
  if (category === "B" || value.includes("tier2") || value.includes("warm")) return "Warm";
  return "Cold";
}

function rowToLead(row: Record<string, unknown>): LeadRecord {
  const companyName = stringFrom(row.companyName, row.company_name, row.company, row.account, row.name);
  const category = stringFrom(row.category, row.tier, row.score, "unknown");
  const tier = stringFrom(row.tier, row.segment);
  return {
    companyName,
    country: stringFrom(row.country, row.market, "未知"),
    industry: stringFrom(row.industry, row.vertical),
    contact: stringFrom(row.contact, row.contact_name, row.contactName, row.person),
    position: stringFrom(row.position, row.title, row.role),
    email: stringFrom(row.email, row.email_address, row.mail),
    homepage: stringFrom(row.homepage, row.website, row.url),
    category,
    reason: stringFrom(row.reason, row.source, row.notes, row.industry),
    confidence: stringFrom(row.confidence, row.confidence_score, row.verification_status),
    score: row.score === "Hot" || row.score === "Warm" || row.score === "Cold"
      ? row.score
      : categoryToLeadScore(category, tier),
  };
}

function stringFrom(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readCsvRows(filePath: string): Array<Record<string, string>> {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.trim()] = (values[index] || "").trim();
    });
    return row;
  });
}

function readLeadFile(filePath: string): LeadRecord[] {
  try {
    if (filePath.endsWith(".csv")) return readCsvRows(filePath).map(rowToLead);
    if (filePath.endsWith(".json")) {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map(rowToLead);
    }
  } catch {
    return [];
  }
  return [];
}

function loadWorkspaceLeads(workspaceId: string): LeadRecord[] {
  const workspace = getWorkspaceAdapter(workspaceId);
  const leadsPath = workspace.data.leadsPath;
  if (!leadsPath) return [];

  const cacheKey = `${workspace.id}:${leadsPath}`;
  const cached = workspaceLeadCache.get(cacheKey);
  if (cached) return cached;

  const leads: LeadRecord[] = [];
  try {
    if (fs.existsSync(leadsPath) && fs.statSync(leadsPath).isFile()) {
      leads.push(...readLeadFile(leadsPath));
    } else if (fs.existsSync(leadsPath) && fs.statSync(leadsPath).isDirectory()) {
      const files = fs.readdirSync(leadsPath)
        .filter((file) => (file.endsWith(".csv") || file.endsWith(".json")) && !file.includes("-original") && file !== "sample.csv")
        .sort();
      for (const file of files) {
        leads.push(...readLeadFile(path.join(leadsPath, file)));
      }
    }
  } catch {
    // Empty workspace memory is valid.
  }

  const seen = new Set<string>();
  const unique = leads.filter((lead) => {
    const key = [lead.companyName, lead.email].filter(Boolean).join("|").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  workspaceLeadCache.set(cacheKey, unique);
  return unique;
}

function loadHeroLeadRows(): Array<Record<string, string>> {
  if (heroLeadCache) return heroLeadCache;

  const leadsDir = ssaCompanyDataPath("hero-pumps", "leads");
  if (!fs.existsSync(leadsDir)) return [];

  const records: Array<Record<string, string>> = [];
  const csvFiles = fs
    .readdirSync(leadsDir)
    .filter((file) => file.endsWith(".csv") && !file.includes("-original") && file !== "sample.csv");

  for (const fileName of csvFiles) {
    const csvPath = path.join(leadsDir, fileName);
    const lines = fs.readFileSync(csvPath, "utf-8").split("\n").filter((line) => line.trim());
    if (lines.length < 2) continue;

    const headers = parseCsvLine(lines[0]);
    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line);
      if (values.length < 2) continue;

      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header.trim()] = (values[index] || "").trim();
      });
      records.push(record);
    }
  }

  heroLeadCache = records;
  return records;
}

function heroRowsToLeads(rows: Array<Record<string, string>>): LeadRecord[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = row.company || row.email;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      companyName: row.company || "",
      country: row.country || "未知",
      industry: row.industry || "",
      contact: row.contact_name || "",
      position: row.position || "",
      email: row.email || "",
      homepage: row.website || "",
      category: row.tier?.startsWith("Tier1") ? "A" : row.tier?.startsWith("Tier2") ? "B" : "C",
      reason: row.industry || "",
      confidence: row.confidence?.replace("%", "") || "",
      score: row.tier?.includes("Tier1") ? "Hot" : row.tier?.includes("Tier2") ? "Warm" : "Cold",
    }));
}

function filterAndPaginateLeads(
  leads: LeadRecord[],
  params: {
    search?: string;
    score?: string;
    country?: string;
    page?: number;
    pageSize?: number;
  }
): PaginatedResponse<LeadRecord> {
  const search = (params.search || "").toLowerCase();
  const score = params.score;
  const country = params.country;
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  let filtered = leads;

  if (search) {
    filtered = filtered.filter(
      (lead) =>
        lead.companyName.toLowerCase().includes(search) ||
        lead.contact.toLowerCase().includes(search) ||
        lead.email.toLowerCase().includes(search) ||
        lead.industry.toLowerCase().includes(search)
    );
  }

  if (score && score !== "All") {
    filtered = filtered.filter((lead) => lead.score === score);
  }

  if (country && country !== "All") {
    filtered = filtered.filter((lead) => lead.country === country);
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;

  return {
    success: true,
    data: filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

function getHeroLeads(params: {
  search?: string;
  score?: string;
  country?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResponse<LeadRecord> {
  return filterAndPaginateLeads(heroRowsToLeads(loadHeroLeadRows()), params);
}

function getHeroCountries(): ApiResponse<string[]> {
  const countries = Array.from(new Set(loadHeroLeadRows().map((row) => row.country).filter(Boolean))).sort();
  return { success: true, data: countries };
}

function getStatsFromLeads(leads: LeadRecord[]): ApiResponse<LeadStats> {
  const countries = new Set(leads.map((lead) => lead.country).filter(Boolean));
  return {
    success: true,
    data: {
      total: leads.length,
      hot: leads.filter((lead) => lead.score === "Hot").length,
      warm: leads.filter((lead) => lead.score === "Warm").length,
      cold: leads.filter((lead) => lead.score === "Cold").length,
      countries: countries.size,
    },
  };
}

function getHeroLeadStats(): ApiResponse<LeadStats> {
  return getStatsFromLeads(heroRowsToLeads(loadHeroLeadRows()));
}

function emptyInboxStats(): InboxStats {
  return {
    pending_decision: 0,
    sent_today: 0,
    reply_rate_week: 0,
    avg_response_time_hours: 0,
  };
}

function getLocalInboxEmails(workspaceId: string): InboundEmail[] {
  const workspace = getWorkspaceAdapter(workspaceId);
  if (workspace.id === "farreach" || workspace.id === "hero-pumps") return MOCK_INBOX;
  return [];
}

function getLocalInboxStats(workspaceId: string): InboxStats {
  const workspace = getWorkspaceAdapter(workspaceId);
  if (workspace.id === "farreach" || workspace.id === "hero-pumps") return MOCK_INBOX_STATS;
  return emptyInboxStats();
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function approvalStorePath(workspaceId: WorkspaceId): string {
  return ensureSsaCompanyDataPath(workspaceId, "approvals", "approvals.json");
}

function readApprovalStore(workspaceId: WorkspaceId): ApprovalRecord[] {
  return readJsonFile<ApprovalRecord[]>(approvalStorePath(workspaceId), []);
}

function writeApprovalStore(workspaceId: WorkspaceId, records: ApprovalRecord[]): void {
  fs.writeFileSync(approvalStorePath(workspaceId), JSON.stringify(records.slice(0, 1000), null, 2), "utf-8");
}

function sanitizeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, 4000) : fallback;
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 12000) {
    return { truncated: true, preview: serialized.slice(0, 12000) };
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function parseApprovalStatus(value: unknown): ApprovalStatus {
  if (value === "approved" || value === "rejected" || value === "pending") return value;
  return "pending";
}

function defaultApprovals(workspaceId: WorkspaceId): ApprovalRecord[] {
  const workspace = getWorkspaceAdapter(workspaceId);
  if (workspace.id !== "farreach") return [];
  const timestamp = nowIso();
  return DEFAULT_APPROVALS.map((approval) => ({
    ...approval,
    workspaceId: workspace.id,
    project: workspace.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

function mergeApprovals(workspaceId: WorkspaceId): ApprovalRecord[] {
  const workspace = getWorkspaceAdapter(workspaceId);
  const persisted = readApprovalStore(workspace.id);
  const byId = new Map<string, ApprovalRecord>();
  for (const approval of defaultApprovals(workspace.id)) byId.set(approval.id, approval);
  for (const approval of persisted) byId.set(approval.id, approval);
  return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function readRuntimeJobs(): Array<{ workspaceId: string; workflow: string; status: string; createdAt: string }> {
  return createRuntimeTaskQueue().listSummaries(500);
}

function isToday(value: string): boolean {
  return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function agentStateFor(
  name: string,
  role: string,
  jobs: Array<{ status: string; createdAt: string }>,
  approvalGated = 0
): AgentStateSummary {
  return {
    name,
    role,
    tasksCompletedToday: jobs.filter((job) => job.status === "completed" && isToday(job.createdAt)).length,
    tasksFailedToday: jobs.filter((job) => job.status === "failed" && isToday(job.createdAt)).length,
    activeTasks: jobs.filter((job) => job.status === "queued" || job.status === "running").length,
    approvalGated,
  };
}

function getHeroSentLog(): SentEmail[] {
  return safeReadJson<SentEmail[]>(ssaCompanyDataPath("hero-pumps", "mail", "sent-log.json")) || [];
}

function getHeroFollowUpState(): Record<string, {
  email: string;
  company?: string;
  follow_up_stage?: number;
  next_follow_up_at?: string;
  has_reply?: boolean;
  is_due?: boolean;
  template_path?: string;
}> {
  return safeReadJson<Record<string, {
    email: string;
    company?: string;
    follow_up_stage?: number;
    next_follow_up_at?: string;
    has_reply?: boolean;
    is_due?: boolean;
    template_path?: string;
  }>>(ssaCompanyDataPath("hero-pumps", "follow-up-state.json")) || {};
}

function getHeroReplies(): Array<Record<string, unknown>> {
  return safeReadJson<Array<Record<string, unknown>>>(ssaCompanyDataPath("hero-pumps", "tracking", "replies.json")) || [];
}

function getHeroEmailDrafts(): EmailDraft[] {
  const templatesDir = ssaCompanyDataPath("hero-pumps", "mail", "drafts");
  try {
    if (!fs.existsSync(templatesDir)) return [];
    const files = fs.readdirSync(templatesDir)
      .filter((file) => file.endsWith(".md") || file.endsWith(".json"))
      .sort()
      .reverse();

    return files.slice(0, 50).map((file, index) => ({
      id: `hero-draft-${index + 1}`,
      subject: file
        .replace(/\.(json|md)$/, "")
        .replace(/^followup[-_]/, "")
        .replace(/[-_]/g, " "),
      template: file,
    }));
  } catch {
    return [];
  }
}

function getHeroEmailStats(): EmailStats {
  const sent = getHeroSentLog();
  const followUp = getHeroFollowUpState();
  const replies = getHeroReplies();
  const repliedCount = Object.values(followUp).filter((entry) => entry.has_reply).length || replies.length;
  const totalSent = sent.length;
  const replyRate = totalSent > 0 ? Math.min(Math.round((repliedCount / totalSent) * 100), 100) : 0;

  return {
    totalSent,
    totalReceived: repliedCount,
    totalReplied: repliedCount,
    replyRate,
    totalDrafts: getHeroEmailDrafts().length,
  };
}

function getHeroSentEmailsPaginated(page: number, limit: number): SentEmailPage {
  const sorted = [...getHeroSentLog()].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return { items: sorted.slice(start, start + limit), total, page, totalPages };
}

function getHeroPendingEmails(): PendingEmail[] {
  const followUp = getHeroFollowUpState();
  const sentSubjects = new Map(getHeroSentLog().map((entry) => [entry.email.toLowerCase(), entry.subject]));
  const pending: PendingEmail[] = [];

  for (const entry of Object.values(followUp)) {
    if (entry.has_reply || !entry.is_due) continue;

    const lastSubject = sentSubjects.get(entry.email.toLowerCase()) || "";
    const stage = entry.follow_up_stage || 1;

    pending.push({
      id: `hero-pending-${entry.email.split("@")[0]}`,
      to: entry.email,
      subject: `Follow-up #${stage}: ${lastSubject || "Regarding pump supply"}`,
      scheduledAt: entry.next_follow_up_at || new Date().toISOString(),
      reason: `第 ${stage} 次跟进`,
    });
  }

  return pending.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

function calculateConversionRate(stages: FunnelStage[]): number {
  return stages[0]?.count > 0
    ? parseFloat(((stages[stages.length - 1].count / stages[0].count) * 100).toFixed(1))
    : 0;
}

function buildPipelineFunnel(stages: FunnelStage[]): PipelineFunnel {
  return {
    stages,
    totalConversionRate: calculateConversionRate(stages),
    updatedAt: new Date().toISOString(),
  };
}

function isFarreachLeadMemoryEmpty(): boolean {
  try {
    return getLeads({ page: 1, pageSize: 1 }).total === 0;
  } catch {
    return true;
  }
}

function todayLabel(): string {
  return new Date().toISOString().split("T")[0];
}

function scoreRecentLead(lead: Pick<LeadRecord, "confidence" | "score">): number {
  if (lead.confidence === "high" || lead.score === "Hot") return 90;
  if (lead.confidence === "medium" || lead.score === "Warm") return 70;
  return 50;
}

function farreachLeadStatus(lead: Pick<LeadRecord, "category">): string {
  if (lead.category === "A") return "新线索";
  if (lead.category === "B") return "跟进中";
  return "潜在";
}

function getLast14Days(): string[] {
  const labels: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return labels;
}

function generateSparkline(currentValue: number, volatility: number, days = 14): number[] {
  const points: number[] = [];
  let value = Math.max(currentValue * 0.6, currentValue - volatility * 3);
  for (let i = 0; i < days - 1; i++) {
    const delta = (Math.random() - 0.45) * volatility;
    value = Math.max(0, Math.round((value + delta) * 10) / 10);
    points.push(value);
  }
  points.push(currentValue);
  return points;
}

function isJunkCompetitor(item: { title?: unknown; url?: unknown }) {
  const title = String(item.title || "");
  const url = String(item.url || "");
  return COMPETITOR_JUNK_PATTERNS.some((pattern) => pattern.test(title) || pattern.test(url));
}

function isJunkNews(item: { title?: unknown; source?: unknown }) {
  const title = String(item.title || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  return NEWS_JUNK_TITLE_PATTERNS.some((pattern) => pattern.test(title)) ||
    NEWS_JUNK_SOURCES.some((junkSource) => source.includes(junkSource));
}

function interleaveByField(items: Array<Record<string, unknown>>, field: string) {
  const byField: Record<string, typeof items> = {};
  for (const item of items) {
    const key = String(item[field] || "");
    if (!byField[key]) byField[key] = [];
    byField[key].push(item);
  }
  const groups = Object.values(byField);
  if (!groups.length) return items;
  const result: typeof items = [];
  const maxLen = Math.max(...groups.map((group) => group.length));
  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (i < group.length) result.push(group[i]);
    }
  }
  return result;
}

function readIntelligenceFile<T>(workspaceId: string, fileName: string, fallback: T): T {
  return readJsonFile<T>(ssaCompanyDataPath(workspaceId, "intelligence", fileName), fallback);
}

function scoreTextMatch(fields: string[], terms: string[]): number {
  const joined = fields.filter(Boolean).join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (joined.includes(term)) score += term.includes("@") ? 34 : 18;
  }
  return Math.min(96, score);
}

function uniqueMatches(matches: IntakeMemoryMatch[]): IntakeMemoryMatch[] {
  const seen = new Set<string>();
  const unique: IntakeMemoryMatch[] = [];
  for (const match of matches) {
    const key = `${match.kind}|${match.title}|${match.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(match);
  }
  return unique;
}

function includesQuery(fields: string[], query: string): boolean {
  const normalized = query.toLowerCase();
  if (!normalized) return true;
  return fields.some((field) => field.toLowerCase().includes(normalized));
}

function leadStage(lead?: LeadRecord): string {
  if (!lead) return "unknown";
  if (lead.score === "Hot") return "qualified";
  if (lead.score === "Warm") return "nurture";
  return "prospect";
}

function leadScoreValue(lead?: LeadRecord): number {
  if (!lead) return 0;
  if (lead.score === "Hot") return 90;
  if (lead.score === "Warm") return 70;
  return 50;
}

function findQuotationMatches(terms: string[], quotations: Quotation[]): IntakeMemoryMatch[] {
  if (terms.length === 0) return [];
  return quotations
    .map((quote) => {
      const score = scoreTextMatch([quote.id, quote.customer, quote.filePath], terms);
      return { quote, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ quote, score }) => ({
      kind: "quotation" as const,
      title: quote.id,
      detail: `${quote.customer} / ${quote.type} / ${quote.status}`,
      confidence: score,
    }));
}

function scanDocumentMatches(workspaceId: string, terms: string[]): IntakeMemoryMatch[] {
  if (terms.length === 0) return [];
  const roots = [
    ssaCompanyDataPath(workspaceId, "documents"),
    ssaCompanyDataPath(workspaceId, "quotations"),
  ];
  const results: IntakeMemoryMatch[] = [];

  function visit(dir: string) {
    if (results.length >= 5 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (results.length >= 5) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        visit(fullPath);
      } else if (entry.isFile()) {
        const score = scoreTextMatch([entry.name, fullPath], terms);
        if (score > 0) {
          results.push({
            kind: "document",
            title: entry.name,
            detail: fullPath.replace(ssaDataPath(), "~/.ssa/data"),
            confidence: score,
          });
        }
      }
    }
  }

  for (const root of roots) visit(root);
  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

export class SalesMemory {
  constructor(readonly engine: MemoryEngine = createMemoryEngine()) {}

  writeMemory(input: MemoryWriteInput) {
    const workspace = getWorkspaceAdapter(input.workspaceId);
    return this.engine.write({ ...input, workspaceId: workspace.id });
  }

  searchMemory(input: MemorySearchInput) {
    const workspace = getWorkspaceAdapter(input.workspaceId);
    return this.engine.search({ ...input, workspaceId: workspace.id });
  }

  getMemoryTimeline(input: MemorySearchInput) {
    const workspace = getWorkspaceAdapter(input.workspaceId);
    return this.engine.summarizeTimeline({ ...input, workspaceId: workspace.id });
  }

  getCustomerMemoryContext(input: MemorySearchInput) {
    const workspace = getWorkspaceAdapter(input.workspaceId);
    return this.engine.buildCustomerContext({ ...input, workspaceId: workspace.id });
  }

  getLeads(
    workspaceId: string,
    params: {
      search?: string;
      score?: string;
      country?: string;
      page?: number;
      pageSize?: number;
    }
  ): PaginatedResponse<LeadRecord> {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "hero-pumps") return getHeroLeads(params);
    if (workspace.id === "farreach") return getLeads(params);
    return filterAndPaginateLeads(loadWorkspaceLeads(workspace.id), params);
  }

  getLeadCountries(workspaceId: string): ApiResponse<string[]> {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "hero-pumps") return getHeroCountries();
    if (workspace.id === "farreach") return getCountries();
    return { success: true, data: Array.from(new Set(loadWorkspaceLeads(workspace.id).map((lead) => lead.country).filter(Boolean))).sort() };
  }

  getLeadStats(workspaceId: string): ApiResponse<LeadStats> {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "hero-pumps") return getHeroLeadStats();
    if (workspace.id === "farreach") return getLeadStats();
    return getStatsFromLeads(loadWorkspaceLeads(workspace.id));
  }

  getInbox(
    workspaceId: string,
    params: {
      status?: "all" | string;
      limit?: number;
    } = {}
  ): InboxListResult {
    const status = params.status || "pending_decision";
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const emails = getLocalInboxEmails(workspaceId);
    const filtered = status === "all" ? emails : emails.filter((email) => email.status === status);

    return {
      success: true,
      data: filtered.slice(0, limit),
      total: filtered.length,
      stats: getLocalInboxStats(workspaceId),
    };
  }

  getInboxEmail(workspaceId: string, emailId: string): ApiResponse<InboundEmail> {
    const email = getLocalInboxEmails(workspaceId).find((item) => item.id === emailId);
    if (!email) return { success: false, error: "Email not found" };
    return { success: true, data: email };
  }

  getEmailStats(workspaceId: string): EmailStats {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "hero-pumps") return getHeroEmailStats();
    if (workspace.id === "farreach") return getEmailStats();
    return { totalSent: 0, totalReceived: 0, totalReplied: 0, replyRate: 0, totalDrafts: 0 };
  }

  getSentEmails(workspaceId: string, page: number, limit: number): SentEmailPage {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "hero-pumps") return getHeroSentEmailsPaginated(page, limit);
    if (workspace.id === "farreach") return getSentEmailsPaginated(page, limit);
    return { items: [], total: 0, page, totalPages: 0 };
  }

  getEmailDrafts(workspaceId: string): EmailDraft[] {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "hero-pumps") return getHeroEmailDrafts();
    if (workspace.id === "farreach") return getEmailDrafts();
    return [];
  }

  getPendingEmails(workspaceId: string): PendingEmail[] {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "hero-pumps") return getHeroPendingEmails();
    if (workspace.id === "farreach") return getPendingEmails();
    return [];
  }

  getAgents(workspaceId: string): Agent[] {
    const workspace = getWorkspaceAdapter(workspaceId);
    return getAgents(workspace.id);
  }

  getAgentById(workspaceId: string, id: string): Agent | null {
    const workspace = getWorkspaceAdapter(workspaceId);
    return getAgentById(id, workspace.id);
  }

  listApprovals(workspaceId: string, id?: string | null): ApprovalRecord[] {
    const approvals = mergeApprovals(workspaceId);
    if (!id) return approvals;
    return approvals.filter((approval) => approval.id === id);
  }

  upsertApproval(input: ApprovalInput, recorder?: MemoryEventRecorder): ApprovalRecord {
    const workspace = getWorkspaceAdapter(input.workspaceId);
    const id = sanitizeText(input.id).trim();
    if (!id) throw new Error("Approval id is required");

    const timestamp = nowIso();
    const current = readApprovalStore(workspace.id);
    const existing = mergeApprovals(workspace.id).find((approval) => approval.id === id);
    const dealId = sanitizeText(input.dealId, sanitizeText(input.deal_id, existing?.dealId || ""));
    const approval: ApprovalRecord = {
      id,
      workspaceId: workspace.id,
      project: workspace.id,
      dealId,
      deal_id: dealId,
      account: sanitizeText(input.account, existing?.account || ""),
      title: sanitizeText(input.title, existing?.title || ""),
      triggerType: sanitizeText(input.triggerType, existing?.triggerType || "manual"),
      value: sanitizeText(input.value, existing?.value || ""),
      risk: sanitizeText(input.risk, existing?.risk || ""),
      due: sanitizeText(input.due, existing?.due || ""),
      recommendation: sanitizeText(input.recommendation, existing?.recommendation || ""),
      guardrail: sanitizeText(input.guardrail, existing?.guardrail || "No external side effect is allowed without approval."),
      status: parseApprovalStatus(input.status ?? existing?.status),
      metadata: { ...(existing?.metadata || {}), ...sanitizeMetadata(input.metadata) },
      decisionBy: existing?.decisionBy,
      decisionNote: existing?.decisionNote,
      decidedAt: existing?.decidedAt,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    writeApprovalStore(workspace.id, [approval, ...current.filter((item) => item.id !== id)]);
    recorder?.("approval.upserted", workspace.id, {
      approvalId: approval.id,
      dealId: approval.dealId,
      status: approval.status,
      triggerType: approval.triggerType,
    });
    return approval;
  }

  updateApproval(workspaceId: string, input: ApprovalPatchInput, recorder?: MemoryEventRecorder): ApprovalRecord {
    const workspace = getWorkspaceAdapter(workspaceId);
    const id = sanitizeText(input.id).trim();
    if (!id) throw new Error("Approval id is required");

    const existing = mergeApprovals(workspace.id).find((approval) => approval.id === id);
    if (!existing) throw new Error(`Approval "${id}" not found`);

    const status = parseApprovalStatus(input.status ?? existing.status);
    const timestamp = nowIso();
    const approval: ApprovalRecord = {
      ...existing,
      status,
      decisionBy: sanitizeText(input.decisionBy, existing.decisionBy || ""),
      decisionNote: sanitizeText(input.decisionNote, existing.decisionNote || ""),
      metadata: { ...existing.metadata, ...sanitizeMetadata(input.metadata) },
      decidedAt: status === "pending" ? existing.decidedAt : timestamp,
      updatedAt: timestamp,
    };

    const current = readApprovalStore(workspace.id);
    writeApprovalStore(workspace.id, [approval, ...current.filter((item) => item.id !== id)]);
    recorder?.("approval.updated", workspace.id, {
      approvalId: approval.id,
      dealId: approval.dealId,
      status: approval.status,
      decisionBy: approval.decisionBy,
      sideEffects: "blocked",
    });
    return approval;
  }

  getAgentState(workspaceId: string, limit = 20): AgentStateReadModel {
    const workspace = getWorkspaceAdapter(workspaceId);
    const jobs = readRuntimeJobs().filter((job) => job.workspaceId === workspace.id).slice(0, limit);
    const approvals = this.listApprovals(workspace.id);
    const pendingApprovals = approvals.filter((approval) => approval.status === "pending").length;
    const jobsFor = (workflow: string) => jobs.filter((job) => job.workflow === workflow);

    return {
      agents: [
        agentStateFor("Inbox Agent", "Email triage and drafts", jobsFor("email.reply"), pendingApprovals),
        agentStateFor("Docs Agent", "Quotations and trade documents", jobsFor("quotation.prepare")),
        agentStateFor("Follow-up Agent", "Follow-up planning", jobsFor("follow_up.plan")),
        agentStateFor("Runtime Agent", "Local workflow orchestration", jobs),
      ].slice(0, Math.max(1, limit)),
      updatedAt: nowIso(),
    };
  }

  getIntelligenceFeed(workspaceId: string, feed: IntelligenceFeedType): IntelligenceFeedReadModel {
    const workspace = getWorkspaceAdapter(workspaceId);

    if (feed === "alerts") {
      const data = readIntelligenceFile<Record<string, unknown>>(workspace.id, "alerts.json", {});
      return { success: true, alerts: [], ...data };
    }

    if (feed === "competitors") {
      const data = readIntelligenceFile<{ competitors?: Array<Record<string, unknown>>; updatedAt?: string }>(
        workspace.id,
        "competitors.json",
        {}
      );
      const allCompetitors = data.competitors || [];
      const filtered = allCompetitors.filter((item) => !isJunkCompetitor(item));
      return {
        success: true,
        competitors: interleaveByField(filtered, "company"),
        updatedAt: data.updatedAt || null,
        _totalRaw: allCompetitors.length,
        _filtered: filtered.length,
      };
    }

    if (feed === "insights") {
      const data = readIntelligenceFile<{ insights?: unknown[]; generatedAt?: string }>(workspace.id, "insights.json", {});
      return {
        success: true,
        insights: data.insights || [],
        cached: true,
        generatedAt: data.generatedAt || null,
      };
    }

    if (feed === "news") {
      const data = readIntelligenceFile<{ news?: Array<Record<string, unknown>>; updatedAt?: string }>(
        workspace.id,
        "news.json",
        {}
      );
      const allNews = data.news || [];
      const filtered = allNews.filter((item) => !isJunkNews(item));
      return {
        success: true,
        news: interleaveByField(filtered, "tag"),
        updatedAt: data.updatedAt || null,
        _totalRaw: allNews.length,
        _filtered: filtered.length,
      };
    }

    const data = readIntelligenceFile<Record<string, unknown>>(workspace.id, "trends.json", {});
    return { success: true, trends: [], ...data };
  }

  getQuotations(
    workspaceId: string,
    params?: {
      search?: string;
      type?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    }
  ): QuotationListResult {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "farreach") return getQuotations(params);

    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize || 20));
    return { quotations: [], total: 0, page, pageSize, totalPages: 0 };
  }

  getQuotationStats(workspaceId: string): QuotationStats {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "farreach") return getQuotationStats();
    return { total: 0, byType: {}, byStatus: {}, totalAmount: "—" };
  }

  getQuotationTypes(workspaceId: string): string[] {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "farreach") return getQuotationTypes();
    return [];
  }

  invalidateQuotations(workspaceId?: string): void {
    const workspace = getWorkspaceAdapter(workspaceId);
    if (workspace.id === "farreach") invalidateQuotationCache();
  }

  getDashboardOverview(
    workspaceId: string,
    params: {
      heroData?: HeroDashboardData;
      agentTasks?: DashboardAgentTask[];
    } = {}
  ): DashboardOverviewReadModel {
    const workspace = getWorkspaceAdapter(workspaceId);

    if (workspace.id === "hero-pumps") {
      const sent = params.heroData?.sent ?? getHeroSentLog();
      const followUp = params.heroData?.followUp ?? getHeroFollowUpState();
      const replies = params.heroData?.replies ?? getHeroReplies();
      const localLeads = this.getLeads(workspace.id, { page: 1, pageSize: 100 }).data || [];
      const leads = params.heroData?.leads ?? localLeads.map((lead) => ({
        company: lead.companyName,
        email: lead.email,
        tier: lead.score === "Hot" ? "Tier1 Buyer" : lead.score === "Warm" ? "Tier2 Partner" : "Tier3 Lead",
      }));
      const repliedCount = Object.values(followUp).filter((entry) => entry.has_reply).length || replies.length;
      const totalSent = sent.length;
      const conversionRate = totalSent > 0 ? parseFloat(((repliedCount / totalSent) * 100).toFixed(1)) : 0;

      return {
        stats: {
          activeLeads: leads.length,
          todayEmails: totalSent,
          pendingQuotations: 0,
          conversionRate,
        },
        recentLeads: leads.slice(0, 5).map((lead) => {
          const tier = (lead.tier || "").toString();
          return {
            name: lead.company || "",
            email: lead.email || "",
            status: tier.startsWith("Tier1") ? "重点" : tier.startsWith("Tier2") ? "潜力" : "普通",
            time: todayLabel(),
            score: tier.startsWith("Tier1") ? 90 : tier.startsWith("Tier2") ? 70 : 50,
          };
        }),
        agentTasks: params.agentTasks || [],
      };
    }

    const leadStats = this.getLeadStats(workspace.id).data || { total: 0, hot: 0, warm: 0, cold: 0, countries: 0 };
    const leads = this.getLeads(workspace.id, { page: 1, pageSize: 5 }).data || [];
    const emailStats = this.getEmailStats(workspace.id);
    const quotations = this.getQuotations(workspace.id);
    const totalSent = emailStats.totalSent || 1;

    return {
      stats: {
        activeLeads: leadStats.total,
        todayEmails: emailStats.totalSent || 0,
        pendingQuotations: quotations.quotations.filter((quote) => quote.status === "Draft").length,
        conversionRate: totalSent > 0 ? parseFloat(((leadStats.hot / totalSent) * 100).toFixed(1)) : 0,
      },
      recentLeads: leads.map((lead) => ({
        name: lead.companyName || "",
        email: lead.email || "",
        status: farreachLeadStatus(lead),
        time: todayLabel(),
        score: scoreRecentLead(lead),
      })),
      agentTasks: params.agentTasks || [],
    };
  }

  getDashboardTrends(workspaceId: string): DashboardTrendsReadModel {
    const workspace = getWorkspaceAdapter(workspaceId);
    const labels = getLast14Days();
    const leadStats = this.getLeadStats(workspace.id).data || { total: 0, hot: 0, warm: 0, cold: 0, countries: 0 };
    const emailStats = this.getEmailStats(workspace.id);
    const quotations = this.getQuotations(workspace.id);
    const farreachEmpty = workspace.id === "farreach" && isFarreachLeadMemoryEmpty() && (emailStats.totalSent || 0) === 0;

    const currentLeads = farreachEmpty ? 47 : leadStats.total;
    const currentEmails = workspace.id === "hero-pumps"
      ? (emailStats.totalSent || 0)
      : farreachEmpty
        ? 12
        : 0;
    const currentQuotations = workspace.id === "hero-pumps"
      ? 0
      : quotations.quotations.filter((quote) => quote.status === "Draft").length;
    const hotLeads = farreachEmpty ? 4 : leadStats.hot;
    const totalSent = farreachEmpty ? 141 : (emailStats.totalSent || 1);
    const currentConversion = farreachEmpty
      ? 8.5
      : totalSent > 0
        ? parseFloat(((hotLeads / totalSent) * 100).toFixed(1))
        : 0;

    return {
      series: {
        activeLeads: {
          label: "活跃线索",
          unit: "条",
          points: generateSparkline(currentLeads, Math.max(currentLeads * 0.08, 2)),
          labels,
        },
        todayEmails: {
          label: "今日邮件",
          unit: "封",
          points: generateSparkline(currentEmails, Math.max(currentEmails * 0.15, 1)),
          labels,
        },
        pendingQuotations: {
          label: "待处理报价",
          unit: "份",
          points: generateSparkline(currentQuotations, 1.5),
          labels,
        },
        conversionRate: {
          label: "转化率",
          unit: "%",
          points: generateSparkline(currentConversion, Math.max(currentConversion * 0.1, 0.5)),
          labels,
        },
      },
      updatedAt: new Date().toISOString(),
    };
  }

  findIntakeMatches(workspaceId: string, terms: string[]): IntakeMemoryMatch[] {
    const workspace = getWorkspaceAdapter(workspaceId);
    const leadMatches = this.findLeadMatches(workspace.id, terms);
    const quotationMatches = findQuotationMatches(terms, this.getQuotations(workspace.id, { page: 1, pageSize: 100 }).quotations);

    return uniqueMatches([
      ...leadMatches,
      ...quotationMatches,
      ...scanDocumentMatches(workspace.id, terms),
    ])
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);
  }

  getCustomer360(workspaceId: string, query: string): Customer360ReadModel {
    const workspace = getWorkspaceAdapter(workspaceId);
    const normalized = query.trim();
    const leads = this.getLeads(workspace.id, { search: normalized, page: 1, pageSize: 10 }).data || [];
    const lead = leads[0];
    const emailQuery = lead?.email || normalized;
    const inbox = (this.getInbox(workspace.id, { status: "all", limit: 50 }).data || [])
      .filter((email) => includesQuery([
        email.from_email || "",
        email.from_name || "",
        email.subject || "",
        email.body_text || "",
      ], emailQuery || normalized))
      .slice(0, 10);
    const sentEmails = this.getSentEmails(workspace.id, 1, 50).items
      .filter((email) => includesQuery([
        email.email || "",
        email.subject || "",
        "company" in email ? String((email as Record<string, unknown>).company || "") : "",
      ], emailQuery || normalized))
      .slice(0, 10);
    const quotations = this.getQuotations(workspace.id, { search: lead?.companyName || normalized, page: 1, pageSize: 10 }).quotations;
    const approvals = this.listApprovals(workspace.id)
      .filter((approval) => includesQuery([
        approval.account,
        approval.dealId,
        approval.title,
        approval.recommendation,
      ], lead?.companyName || normalized))
      .slice(0, 10);
    const recentSubjects = [
      ...inbox.map((email) => email.subject || ""),
      ...sentEmails.map((email) => email.subject || ""),
      ...quotations.map((quote) => `${quote.type} ${quote.id}`),
    ].filter(Boolean).slice(0, 8);
    const openRisks = approvals
      .filter((approval) => approval.status === "pending")
      .map((approval) => `${approval.title}: ${approval.risk}`)
      .slice(0, 5);

    const memory = this.getCustomerMemoryContext({
      workspaceId: workspace.id,
      query: [lead?.companyName, lead?.email, normalized].filter(Boolean).join(" "),
      customerId: lead?.email || normalized,
      customerName: lead?.companyName || normalized,
      limit: 8,
    });
    const memoryRisks = memory.timeline.openRisks;
    const memoryNextStep = memory.timeline.recommendedNextSteps[0];

    return {
      workspaceId: workspace.id,
      query: normalized,
      customer: {
        name: lead?.companyName || normalized || "Unknown customer",
        email: lead?.email || (normalized.includes("@") ? normalized : undefined),
        country: lead?.country,
        industry: lead?.industry,
        stage: leadStage(lead),
        score: leadScoreValue(lead),
      },
      leads: leads.map((item) => ({ ...item })),
      inbox: inbox.map((item) => ({ ...item })),
      sentEmails: sentEmails.map((item) => ({ ...item })),
      quotations: quotations.map((item) => ({ ...item })),
      approvals,
      negotiation: {
        openRisks: Array.from(new Set([...openRisks, ...memoryRisks])).slice(0, 8),
        recentSubjects,
        recommendedNextStep: memoryNextStep || (openRisks.length > 0
          ? "Review pending approvals before preparing any customer-facing response."
          : quotations.length > 0
            ? "Review recent quote context, then draft the next follow-up behind the send gate."
            : "Confirm customer requirements and preserve new context in local memory before external action."),
      },
      memory,
      updatedAt: new Date().toISOString(),
    };
  }

  private findLeadMatches(workspaceId: string, terms: string[]): IntakeMemoryMatch[] {
    if (terms.length === 0) return [];
    const workspace = getWorkspaceAdapter(workspaceId);
    const leads: Array<{
      companyName: string;
      contact: string;
      email: string;
      homepage: string;
      country: string;
    }> = workspace.id === "farreach"
      ? loadLeadsRaw().map((lead) => ({
        companyName: lead.company_name || "",
        contact: lead.contact || "",
        email: lead.email || "",
        homepage: lead.homepage || "",
        country: lead.country || "",
      }))
      : this.getLeads(workspace.id, { page: 1, pageSize: 100 }).data || [];

    return leads
      .map((lead) => {
        const score = scoreTextMatch([
          lead.companyName || "",
          lead.contact || "",
          lead.email || "",
          lead.homepage || "",
          lead.country || "",
        ], terms);
        return { lead, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ lead, score }) => ({
        kind: "lead" as const,
        title: lead.companyName || lead.email || "Lead match",
        detail: [lead.contact, lead.email, lead.country].filter(Boolean).join(" / ") || "Existing lead record",
        confidence: score,
      }));
  }

  getPipelineFunnel(workspaceId: string): PipelineFunnel {
    const workspace = getWorkspaceAdapter(workspaceId);

    if (workspace.id === "hero-pumps") {
      const leadStats = this.getLeadStats(workspace.id).data || { total: 0, hot: 0, warm: 0, cold: 0, countries: 0 };
      const sent = getHeroSentLog();
      const followUp = getHeroFollowUpState();
      const replies = getHeroReplies();
      const totalContacts = Object.keys(followUp).length || sent.length;
      const contactedCount = Object.values(followUp).filter((entry) => (entry.follow_up_stage || 0) >= 2).length || Math.min(sent.length, totalContacts);
      const repliedCount = replies.length || Object.values(followUp).filter((entry) => entry.has_reply).length;

      return buildPipelineFunnel([
        { stage: "discovery", label: "发现线索", count: leadStats.total, color: "from-blue-500 to-blue-400" },
        { stage: "qualified", label: "合格线索", count: totalContacts, color: "from-violet-500 to-violet-400" },
        { stage: "contacted", label: "已触达", count: contactedCount, color: "from-cyan-500 to-cyan-400" },
        { stage: "engaged", label: "深度沟通", count: repliedCount, color: "from-emerald-500 to-emerald-400" },
        { stage: "quoted", label: "已报价", count: 0, color: "from-amber-500 to-amber-400" },
      ]);
    }

    if (workspace.id === "farreach") {
      const leads = getLeads({ page: 1, pageSize: 10000 }).data || [];
      const quotations = this.getQuotations(workspace.id);
      const empty = isFarreachLeadMemoryEmpty();
      const totalLeads = empty ? 47 : leads.length;
      const qualifiedLeads = empty ? 32 : leads.filter((lead) => lead.category === "A" || lead.category === "A|B" || lead.category === "B").length;
      const contactedLeads = empty ? 21 : leads.filter((lead) => lead.confidence && lead.confidence !== "unknown").length;
      const hotLeads = empty ? 8 : leads.filter((lead) => lead.category === "A" || lead.category === "A|B").length;

      return buildPipelineFunnel([
        { stage: "discovery", label: "发现线索", count: totalLeads, color: "from-blue-500 to-blue-400" },
        { stage: "qualified", label: "合格线索", count: qualifiedLeads, color: "from-violet-500 to-violet-400" },
        { stage: "contacted", label: "已触达", count: contactedLeads, color: "from-cyan-500 to-cyan-400" },
        { stage: "engaged", label: "深度沟通", count: hotLeads, color: "from-emerald-500 to-emerald-400" },
        { stage: "quoted", label: "已报价", count: quotations.quotations?.length || 0, color: "from-amber-500 to-amber-400" },
      ]);
    }

    return buildPipelineFunnel([
      { stage: "discovery", label: "发现线索", count: 0, color: "from-blue-500 to-blue-400" },
      { stage: "qualified", label: "合格线索", count: 0, color: "from-violet-500 to-violet-400" },
      { stage: "contacted", label: "已触达", count: 0, color: "from-cyan-500 to-cyan-400" },
      { stage: "engaged", label: "深度沟通", count: 0, color: "from-emerald-500 to-emerald-400" },
      { stage: "quoted", label: "已报价", count: 0, color: "from-amber-500 to-amber-400" },
    ]);
  }

  invalidate(): void {
    heroLeadCache = null;
    workspaceLeadCache.clear();
    invalidateCache();
    invalidateQuotationCache();
  }
}

export function createSalesMemory(): SalesMemory {
  return new SalesMemory();
}

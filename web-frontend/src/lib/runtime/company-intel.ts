import fs from "fs";
import path from "path";
import type { Lead } from "../leads";
import { ensureDir, ensureSsaCompanyDataPath, readJsonFile, ssaCompanyDataPath, sanitizeSsaPathSegment } from "../ssa-data-paths";
import type { MemoryWriteInput, RuntimeJob, RuntimeWorkflowType, WorkspaceAdapter, WorkspaceId } from "./types";

export type CompanyIntelStatus = "not_started" | "queued" | "running" | "ready" | "failed";
export type CompanyIntelRating = "Hot" | "Warm" | "Cold";

export interface CompanyIntelLeadInput {
  companyName?: string;
  country?: string;
  industry?: string;
  contact?: string;
  position?: string;
  email?: string;
  homepage?: string;
  category?: string;
  reason?: string;
  confidence?: string;
  score?: CompanyIntelRating;
}

export interface CompanyIntelDossier {
  company: {
    name: string;
    country: string;
    website: string;
    domain: string;
    status: "active" | "unknown" | "risk" | "dead_or_inactive" | "suspicious";
    confidence: "high" | "medium" | "low";
  };
  red_lines: string[];
  financial_data: {
    revenue: string | null;
    currency: string | null;
    employees: number | null;
    source: string;
    confidence: "high" | "medium" | "low";
  };
  recent_developments: Array<{
    date: string;
    event: string;
    source_url: string;
  }>;
  product_portfolio: {
    main_products: string[];
    brands: string[];
    oem_or_private_label: string;
    price_positioning: string;
  };
  sales_entry: {
    product_match: string;
    angle: string;
    opener_business: string;
    opener_product: string;
    evidence: string[];
  };
  contacts: Array<{
    name: string;
    role: string;
    email: string;
    verification_status: "verified" | "invalid" | "catch_all" | "unknown" | "not_checked";
    source_note: string;
  }>;
  email_candidates: Array<{
    email: string;
    status: "verified" | "invalid" | "catch_all" | "unknown" | "not_checked";
    source_note: string;
  }>;
  lead_score: number;
  rating: CompanyIntelRating;
  recommended_next_actions: string[];
  source_list: Array<{
    label: string;
    url: string;
    note: string;
  }>;
  generated_at: string;
  skill: "company-intel";
  workflow: RuntimeWorkflowType;
}

export interface CompanyIntelReadModel {
  success: true;
  status: CompanyIntelStatus;
  workspaceId: string;
  clientSlug: string;
  leadKey: string;
  dossier: CompanyIntelDossier | null;
  markdown: string;
  paths: {
    directory: string;
    json: string;
    markdown: string;
  };
  job?: {
    id: string;
    status: RuntimeJob["status"];
    updatedAt: string;
    error?: string;
  };
}

export interface CompanyIntelQueueResult extends CompanyIntelReadModel {
  queued: boolean;
  jobId?: string;
}

export interface CompanyIntelRuntimeHost {
  getWorkspace(id?: WorkspaceId | null): WorkspaceAdapter;
  workflows: {
    enqueue(workspaceId: WorkspaceId, workflow: RuntimeWorkflowType, input: Record<string, unknown>): RuntimeJob;
    listJobs(limit?: number): RuntimeJob[];
  };
  recordEvent(type: string, workspaceId: WorkspaceId, payload: Record<string, unknown>): unknown;
  writeMemory(input: MemoryWriteInput): unknown;
}

function compact(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function leadName(lead: CompanyIntelLeadInput): string {
  return compact(lead.companyName) || domainFromLead(lead) || compact(lead.email) || "unknown-company";
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

function domainFromLead(lead: CompanyIntelLeadInput): string {
  const homepage = compact(lead.homepage);
  if (homepage) return domainFromUrl(homepage);
  const email = compact(lead.email);
  const domain = email.includes("@") ? email.split("@").pop() || "" : "";
  return domain.replace(/^www\./i, "");
}

function confidenceLevel(lead: CompanyIntelLeadInput): "high" | "medium" | "low" {
  const raw = compact(lead.confidence).toLowerCase();
  const numeric = Number(raw.replace("%", ""));
  if (raw === "high" || numeric >= 85) return "high";
  if (raw === "medium" || numeric >= 60 || lead.score === "Hot" || lead.score === "Warm") return "medium";
  return "low";
}

function leadScore(lead: CompanyIntelLeadInput): number {
  const raw = Number(compact(lead.confidence).replace("%", ""));
  const base = Number.isFinite(raw) && raw > 0
    ? Math.min(95, Math.max(20, Math.round(raw)))
    : lead.score === "Hot"
      ? 82
      : lead.score === "Warm"
        ? 64
        : 42;
  const websiteBoost = compact(lead.homepage) ? 4 : 0;
  const contactBoost = compact(lead.email) || compact(lead.contact) ? 4 : 0;
  return Math.min(100, base + websiteBoost + contactBoost);
}

function ratingFromScore(score: number): CompanyIntelRating {
  if (score >= 75) return "Hot";
  if (score >= 50) return "Warm";
  return "Cold";
}

function productPortfolioFromLead(lead: CompanyIntelLeadInput): string[] {
  const industry = compact(lead.industry);
  const reason = compact(lead.reason);
  const parts = [industry, reason]
    .flatMap((item) => item.split(/[;,/|]/))
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).slice(0, 6);
}

export function companyIntelLeadKey(lead: CompanyIntelLeadInput): string {
  return [
    leadName(lead),
    domainFromLead(lead),
    compact(lead.email),
  ].filter(Boolean).join("|").toLowerCase();
}

export function companyIntelClientSlug(lead: CompanyIntelLeadInput): string {
  const domain = domainFromLead(lead);
  const name = domain || leadName(lead);
  return sanitizeSsaPathSegment(
    name
      .toLowerCase()
      .replace(/\.[a-z]{2,}$/i, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, ""),
    "unknown-company"
  );
}

export function companyIntelPaths(workspaceId: WorkspaceId, lead: CompanyIntelLeadInput) {
  const clientSlug = companyIntelClientSlug(lead);
  const directory = ssaCompanyDataPath(workspaceId, "intelligence", "clients", clientSlug);
  return {
    clientSlug,
    directory,
    json: path.join(directory, "client-intel.json"),
    markdown: path.join(directory, "client-intel.md"),
  };
}

export function buildCompanyIntelDossier(
  workspace: Pick<WorkspaceAdapter, "id" | "brandName" | "industry">,
  lead: CompanyIntelLeadInput,
  now = new Date()
): CompanyIntelDossier {
  const score = leadScore(lead);
  const rating = ratingFromScore(score);
  const domain = domainFromLead(lead);
  const website = normalizeWebsite(compact(lead.homepage) || (domain ? `https://${domain}` : ""));
  const companyName = leadName(lead);
  const portfolio = productPortfolioFromLead(lead);
  const contactName = compact(lead.contact);
  const contactEmail = compact(lead.email);
  const position = compact(lead.position);
  const category = compact(lead.category);
  const reason = compact(lead.reason);
  const evidence = [
    website ? `线索提供官网或域名：${website}` : "",
    reason ? `入池判断依据：${reason}` : "",
    category ? `线索分层：${category}` : "",
    compact(lead.confidence) ? `原始把握度：${compact(lead.confidence)}` : "",
  ].filter(Boolean);

  return {
    company: {
      name: companyName,
      country: compact(lead.country) || "unknown",
      website,
      domain,
      status: website || domain ? "active" : "unknown",
      confidence: confidenceLevel(lead),
    },
    red_lines: [],
    financial_data: {
      revenue: null,
      currency: null,
      employees: null,
      source: "未接入公开注册/财务数据源；等待 company-intel 深度搜索补齐。",
      confidence: "low",
    },
    recent_developments: [
      {
        date: "N/A",
        event: "未找到公开近况；等待 company-intel 深度搜索补齐。",
        source_url: "",
      },
    ],
    product_portfolio: {
      main_products: portfolio,
      brands: [],
      oem_or_private_label: "unknown",
      price_positioning: "unknown",
    },
    sales_entry: {
      product_match: portfolio.length
        ? `${workspace.brandName} / ${workspace.industry} -> ${portfolio.slice(0, 3).join(", ")}`
        : `${workspace.brandName} / ${workspace.industry} -> 待确认客户产品线`,
      angle: reason || "先确认客户产品线、采购角色和当前供应痛点，再决定是否进入开发信。",
      opener_business: `${companyName} 已进入 ${workspace.brandName} 线索池，建议先核实公司业务、采购角色和官网信息。`,
      opener_product: portfolio.length
        ? `可从 ${portfolio[0]} 相关需求切入，确认是否有采购、替代供应商或 OEM 机会。`
        : "产品切入点待深度背调补齐。",
      evidence,
    },
    contacts: contactEmail || contactName
      ? [
        {
          name: contactName || contactEmail,
          role: position || "unknown",
          email: contactEmail,
          verification_status: contactEmail ? "not_checked" : "unknown",
          source_note: "来自入池线索，尚未经过 company-intel 邮箱验证。",
        },
      ]
      : [],
    email_candidates: contactEmail
      ? [
        {
          email: contactEmail,
          status: "not_checked",
          source_note: "来自入池线索。",
        },
      ]
      : [],
    lead_score: score,
    rating,
    recommended_next_actions: [
      "运行 company-intel 深度搜索，补齐官网、注册/财务、近况和来源 URL。",
      "核实联系人角色和邮箱状态，再决定是否进入自动外联或人工复核。",
      rating === "Hot" ? "优先准备开发信切入点。" : "先完成背调后再进入跟进队列。",
    ],
    source_list: [
      website
        ? { label: "Lead website", url: website, note: "来自入池线索字段。" }
        : { label: "Lead import", url: "", note: "入池线索未提供官网。" },
    ],
    generated_at: now.toISOString(),
    skill: "company-intel",
    workflow: "company_intel.run",
  };
}

export function renderCompanyIntelMarkdown(dossier: CompanyIntelDossier): string {
  const sources = dossier.source_list.length
    ? dossier.source_list.map((source) => `- ${source.label}: ${source.url || "N/A"}${source.note ? ` (${source.note})` : ""}`).join("\n")
    : "- N/A";
  const contacts = dossier.contacts.length
    ? dossier.contacts.map((contact) => `- ${contact.name || contact.email || "N/A"} | ${contact.role || "unknown"} | ${contact.email || "N/A"} | ${contact.verification_status}`).join("\n")
    : "- 暂无确认联系人";
  const actions = dossier.recommended_next_actions.map((action) => `- ${action}`).join("\n");
  const evidence = dossier.sales_entry.evidence.length
    ? dossier.sales_entry.evidence.map((item) => `- ${item}`).join("\n")
    : "- 暂无来源证据";

  return [
    `# ${dossier.company.name} 客户背调`,
    "",
    "## Basic Company Information",
    `- Country: ${dossier.company.country || "unknown"}`,
    `- Website: ${dossier.company.website || "N/A"}`,
    `- Domain: ${dossier.company.domain || "N/A"}`,
    `- Status: ${dossier.company.status}`,
    `- Confidence: ${dossier.company.confidence}`,
    "",
    "## Financial And Registry Findings",
    `- Revenue: ${dossier.financial_data.revenue || "N/A"}`,
    `- Employees: ${dossier.financial_data.employees ?? "N/A"}`,
    `- Source: ${dossier.financial_data.source}`,
    "",
    "## Recent Developments",
    ...dossier.recent_developments.map((item) => `- ${item.date}: ${item.event}${item.source_url ? ` (${item.source_url})` : ""}`),
    "",
    "## Product Portfolio",
    dossier.product_portfolio.main_products.length
      ? dossier.product_portfolio.main_products.map((item) => `- ${item}`).join("\n")
      : "- 待确认",
    "",
    "## Product Fit And Sales Angle",
    `- Product match: ${dossier.sales_entry.product_match}`,
    `- Angle: ${dossier.sales_entry.angle}`,
    `- Business opener: ${dossier.sales_entry.opener_business}`,
    `- Product opener: ${dossier.sales_entry.opener_product}`,
    "",
    "## Evidence",
    evidence,
    "",
    "## Verified Contacts",
    contacts,
    "",
    "## Score Table",
    `- Lead score: ${dossier.lead_score}`,
    `- Rating: ${dossier.rating}`,
    "",
    "## Recommended Next Actions",
    actions,
    "",
    "## Source List",
    sources,
    "",
  ].join("\n");
}

function findCompanyIntelJob(jobs: RuntimeJob[], workspaceId: WorkspaceId, leadKey: string): RuntimeJob | null {
  return jobs.find((job) =>
    job.workspaceId === workspaceId &&
    job.workflow === "company_intel.run" &&
    String(job.input?.leadKey || "") === leadKey &&
    (job.status === "queued" || job.status === "running" || job.status === "failed")
  ) || null;
}

export function readCompanyIntel(
  host: Pick<CompanyIntelRuntimeHost, "getWorkspace" | "workflows">,
  workspaceId: WorkspaceId,
  lead: CompanyIntelLeadInput
): CompanyIntelReadModel {
  const workspace = host.getWorkspace(workspaceId);
  const paths = companyIntelPaths(workspace.id, lead);
  const leadKey = companyIntelLeadKey(lead);
  const dossier = readJsonFile<CompanyIntelDossier | null>(paths.json, null);
  const markdown = fs.existsSync(paths.markdown) ? fs.readFileSync(paths.markdown, "utf-8") : "";
  const job = findCompanyIntelJob(host.workflows.listJobs(500), workspace.id, leadKey);
  const status: CompanyIntelStatus = dossier
    ? "ready"
    : job?.status === "running"
      ? "running"
      : job?.status === "failed"
        ? "failed"
        : job?.status === "queued"
          ? "queued"
          : "not_started";

  return {
    success: true,
    status,
    workspaceId: workspace.id,
    clientSlug: paths.clientSlug,
    leadKey,
    dossier,
    markdown,
    paths: {
      directory: paths.directory,
      json: paths.json,
      markdown: paths.markdown,
    },
    job: job
      ? {
        id: job.id,
        status: job.status,
        updatedAt: job.updatedAt,
        error: job.error,
      }
      : undefined,
  };
}

export function writeCompanyIntelDossier(
  host: Pick<CompanyIntelRuntimeHost, "getWorkspace" | "recordEvent" | "writeMemory">,
  workspaceId: WorkspaceId,
  lead: CompanyIntelLeadInput,
  options: { jobId?: string; note?: string } = {}
): CompanyIntelReadModel {
  const workspace = host.getWorkspace(workspaceId);
  const paths = companyIntelPaths(workspace.id, lead);
  ensureDir(paths.directory);
  const dossier = buildCompanyIntelDossier(workspace, lead);
  const markdown = renderCompanyIntelMarkdown(dossier);

  fs.writeFileSync(paths.json, JSON.stringify(dossier, null, 2), "utf-8");
  fs.writeFileSync(paths.markdown, markdown, "utf-8");

  host.writeMemory({
    workspaceId: workspace.id,
    kind: "fact",
    customerId: paths.clientSlug,
    customerName: dossier.company.name,
    title: `Company intel: ${dossier.company.name}`,
    body: `${dossier.company.name} rated ${dossier.rating} (${dossier.lead_score}). ${dossier.sales_entry.angle}`,
    tags: ["company-intel", "customer-background", dossier.rating.toLowerCase()],
    source: {
      type: "lead",
      path: paths.json,
    },
    confidence: dossier.company.confidence === "high" ? 0.85 : dossier.company.confidence === "medium" ? 0.65 : 0.45,
    metadata: {
      skill: "company-intel",
      clientSlug: paths.clientSlug,
      leadKey: companyIntelLeadKey(lead),
      markdownPath: paths.markdown,
      jobId: options.jobId || null,
      note: options.note || "Generated from lead-pool input; deep source search can enrich this dossier later.",
    },
    idempotencyKey: `${workspace.id}:company-intel:${paths.clientSlug}`,
  });

  host.recordEvent("company_intel.completed", workspace.id, {
    clientSlug: paths.clientSlug,
    companyName: dossier.company.name,
    rating: dossier.rating,
    leadScore: dossier.lead_score,
    jsonPath: paths.json,
    markdownPath: paths.markdown,
    jobId: options.jobId || null,
    sideEffects: "local-only",
  });

  return {
    success: true,
    status: "ready",
    workspaceId: workspace.id,
    clientSlug: paths.clientSlug,
    leadKey: companyIntelLeadKey(lead),
    dossier,
    markdown,
    paths: {
      directory: paths.directory,
      json: paths.json,
      markdown: paths.markdown,
    },
  };
}

export function queueCompanyIntel(
  host: CompanyIntelRuntimeHost,
  workspaceId: WorkspaceId,
  lead: CompanyIntelLeadInput,
  options: { force?: boolean; source?: string } = {}
): CompanyIntelQueueResult {
  const workspace = host.getWorkspace(workspaceId);
  const paths = companyIntelPaths(workspace.id, lead);
  const leadKey = companyIntelLeadKey(lead);
  const existing = readCompanyIntel(host, workspace.id, lead);
  if (!options.force && existing.status !== "not_started" && existing.status !== "failed") {
    return {
      ...existing,
      queued: false,
      jobId: existing.job?.id,
    };
  }

  const job = host.workflows.enqueue(workspace.id, "company_intel.run", {
    lead,
    leadKey,
    clientSlug: paths.clientSlug,
    source: options.source || "lead-pool",
    skill: "company-intel",
    outputDirectory: paths.directory,
  });

  ensureDir(paths.directory);
  const queuedPath = ensureSsaCompanyDataPath(workspace.id, "intelligence", "clients", paths.clientSlug, "queued.json");
  fs.writeFileSync(queuedPath, JSON.stringify({
    status: "queued",
    skill: "company-intel",
    jobId: job.id,
    leadKey,
    lead,
    queuedAt: new Date().toISOString(),
  }, null, 2), "utf-8");

  host.recordEvent("company_intel.queued", workspace.id, {
    jobId: job.id,
    clientSlug: paths.clientSlug,
    companyName: leadName(lead),
    leadKey,
    source: options.source || "lead-pool",
    sideEffects: "local-only",
  });

  return {
    ...readCompanyIntel(host, workspace.id, lead),
    queued: true,
    jobId: job.id,
  };
}

export function queueCompanyIntelForLeads(
  host: CompanyIntelRuntimeHost,
  workspaceId: WorkspaceId,
  leads: CompanyIntelLeadInput[],
  options: { force?: boolean; source?: string } = {}
): { queued: number; skipped: number; jobs: string[] } {
  let queued = 0;
  let skipped = 0;
  const jobs: string[] = [];

  for (const lead of leads) {
    if (!leadName(lead) || leadName(lead) === "unknown-company") {
      skipped += 1;
      continue;
    }
    const result = queueCompanyIntel(host, workspaceId, lead, options);
    if (result.queued && result.jobId) {
      queued += 1;
      jobs.push(result.jobId);
    } else {
      skipped += 1;
    }
  }

  return { queued, skipped, jobs };
}

export function leadToCompanyIntelInput(lead: Lead): CompanyIntelLeadInput {
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { useProject } from "@/lib/project";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  EmptyState,
  InputField,
  SelectField,
  StatCell,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import PageCommandPanel from "@/components/ui/PageCommandPanel";

interface Lead {
  companyName: string;
  country: string;
  industry: string;
  contact: string;
  position: string;
  email: string;
  homepage: string;
  category: string;
  reason: string;
  confidence: string;
  score: "Hot" | "Warm" | "Cold";
}

interface LeadStats {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  countries: number | Record<string, number>;
}

type ScoreFilter = "All" | "Hot" | "Warm" | "Cold";
type CompanyIntelStatus = "not_started" | "queued" | "running" | "ready" | "failed";

interface CompanyIntelDossier {
  company: {
    name: string;
    country: string;
    website: string;
    domain: string;
    status: string;
    confidence: string;
  };
  financial_data: {
    revenue: string | null;
    employees: number | null;
    source: string;
    confidence: string;
  };
  recent_developments: Array<{ date: string; event: string; source_url: string }>;
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
    verification_status: string;
    source_note: string;
  }>;
  email_candidates: Array<{
    email: string;
    status: string;
    source_note: string;
  }>;
  lead_score: number;
  rating: Lead["score"];
  recommended_next_actions: string[];
  source_list: Array<{ label: string; url: string; note: string }>;
  generated_at: string;
}

interface CompanyIntelReadModel {
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
    status: "queued" | "running" | "completed" | "failed";
    updatedAt: string;
    error?: string;
  };
}

const PAGE_SIZE = 20;

function scoreTone(score: Lead["score"]): BattleTone {
  if (score === "Hot") return "red";
  if (score === "Warm") return "amber";
  return "neutral";
}

function countryCount(value: LeadStats["countries"]) {
  return typeof value === "number" ? value : Object.keys(value || {}).length;
}

function formatConfidence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "-";
  return trimmed.endsWith("%") ? trimmed : `${trimmed}%`;
}

function leadKey(lead: Lead) {
  return [lead.companyName, lead.homepage, lead.email].filter(Boolean).join("|").toLowerCase();
}

function leadIntelPayload(lead: Lead) {
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

function intelStatusTone(status: CompanyIntelStatus): BattleTone {
  if (status === "ready") return "emerald";
  if (status === "running" || status === "queued") return "blue";
  if (status === "failed") return "red";
  return "neutral";
}

function intelStatusLabel(status: CompanyIntelStatus, language: "en" | "zh") {
  const zh: Record<CompanyIntelStatus, string> = {
    not_started: "未开始",
    queued: "已排队",
    running: "背调中",
    ready: "已完成",
    failed: "失败",
  };
  const en: Record<CompanyIntelStatus, string> = {
    not_started: "Not started",
    queued: "Queued",
    running: "Researching",
    ready: "Ready",
    failed: "Failed",
  };
  return language === "zh" ? zh[status] : en[status];
}

function shortDate(value: string) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function DetailLine({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xs text-slate-200">{value || "-"}</p>
    </div>
  );
}

function IntelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-800 px-4 py-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default function LeadsPage() {
  const { apiUrl, project } = useProject();
  const language = useBattleLanguage();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats>({ total: 0, hot: 0, warm: 0, cold: 0, countries: 0 });
  const [countries, setCountries] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [score, setScore] = useState<ScoreFilter>("All");
  const [country, setCountry] = useState("All");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadKey, setSelectedLeadKey] = useState("");
  const [intel, setIntel] = useState<CompanyIntelReadModel | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: "combined",
        search,
        score,
        country,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(apiUrl(`/api/leads?${params.toString()}`));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load leads");

      const payload = json.data || {};
      const list = payload.leads || {};
      setLeads(list.data || []);
      setTotalPages(list.totalPages || 1);
      setStats(payload.stats?.data || { total: 0, hot: 0, warm: 0, cold: 0, countries: 0 });
      setCountries(payload.countries?.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, country, page, score, search]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedLead = leads.find((lead) => leadKey(lead) === selectedLeadKey) || leads[0] || null;

  useEffect(() => {
    if (leads.length === 0) {
      setSelectedLeadKey("");
      setIntel(null);
      return;
    }
    if (!selectedLeadKey || !leads.some((lead) => leadKey(lead) === selectedLeadKey)) {
      setSelectedLeadKey(leadKey(leads[0]));
    }
  }, [leads, selectedLeadKey]);

  const loadIntel = useCallback(async (lead: Lead) => {
    setIntelLoading(true);
    setIntelError(null);
    try {
      const params = new URLSearchParams({
        action: "company-intel",
        ...leadIntelPayload(lead),
      });
      const res = await fetch(apiUrl(`/api/leads?${params.toString()}`));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load company intel");
      setIntel(json);
    } catch (err) {
      setIntelError(err instanceof Error ? err.message : "Failed to load company intel");
      setIntel(null);
    } finally {
      setIntelLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (!selectedLead) return;
    loadIntel(selectedLead);
  }, [loadIntel, selectedLead]);

  useEffect(() => {
    if (!selectedLead || !intel || (intel.status !== "queued" && intel.status !== "running")) return;
    const timer = window.setInterval(() => {
      loadIntel(selectedLead);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [intel, loadIntel, selectedLead]);

  const queueIntel = useCallback(async (force = false) => {
    if (!selectedLead) return;
    setIntelLoading(true);
    setIntelError(null);
    try {
      const res = await fetch(apiUrl("/api/leads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "queue-company-intel",
          lead: leadIntelPayload(selectedLead),
          force,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to queue company intel");
      setIntel(json);
    } catch (err) {
      setIntelError(err instanceof Error ? err.message : "Failed to queue company intel");
    } finally {
      setIntelLoading(false);
    }
  }, [apiUrl, selectedLead]);

  const visibleLeadSummary = leads.slice(0, 12).map((lead) => ({
    company: lead.companyName,
    country: lead.country,
    contact: lead.contact,
    email: lead.email,
    score: lead.score,
    confidence: lead.confidence,
    signal: lead.reason || lead.category,
  }));
  const commandContext = {
    filters: { search, score, country, page, pageSize: PAGE_SIZE },
    stats: {
      total: stats.total,
      hot: stats.hot,
      warm: stats.warm,
      cold: stats.cold,
      countries: countryCount(stats.countries),
    },
    visibleCount: leads.length,
    totalPages,
    visibleLeads: visibleLeadSummary,
    selectedLead: selectedLead ? leadIntelPayload(selectedLead) : null,
    companyIntel: intel
      ? {
        status: intel.status,
        clientSlug: intel.clientSlug,
        rating: intel.dossier?.rating,
        leadScore: intel.dossier?.lead_score,
        job: intel.job,
      }
      : null,
    dataState: error ? "error" : loading ? "loading" : "ready",
    error,
  };
  const commandSummary = [
    language === "zh" ? "线索清单" : "Lead List",
    `${language === "zh" ? "筛选" : "Filter"} ${score} / ${country}`,
    `${language === "zh" ? "当前显示" : "Visible"} ${leads.length}`,
    `${language === "zh" ? "高优先级" : "High Priority"} ${stats.hot}`,
    `${language === "zh" ? "搜索" : "Search"} ${search || (language === "zh" ? "无" : "none")}`,
  ].join(" / ");

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Leads Radar"
        zhTitle="线索雷达"
        meta={`${project.name.toUpperCase()} / LEAD LIST / PAGE ${page}`}
        zhMeta={`${project.name.toUpperCase()} / 线索列表 / 第 ${page} 页`}
        active="/leads"
      >
        <BattleBadge tone={loading ? "blue" : "emerald"} pulse={loading}>
          {loading ? <BattleText en="SYNC" zh="同步" /> : <BattleText en="LIVE" zh="实时" />}
        </BattleBadge>
        <CommandButton onClick={() => load()} variant="ghost"><BattleText en="Refresh" zh="刷新" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "全部线索" : "Total Leads"} value={stats.total} tone="emerald" />
          <StatCell label={language === "zh" ? "高优先级" : "High Priority"} value={stats.hot} tone="red" />
          <StatCell label={language === "zh" ? "待回复" : "Awaiting Reply"} value={stats.warm} tone="amber" />
          <StatCell label={language === "zh" ? "国家/地区" : "Countries"} value={countryCount(stats.countries)} tone="blue" />
        </div>

        <BattlePanel
          title={language === "zh" ? "线索池 / 客户背调" : "Lead Pool / Customer Intel"}
          meta={language === "zh" ? `${leads.length} 条可见 / 每页 ${PAGE_SIZE} 条` : `${leads.length} visible / ${PAGE_SIZE} per page`}
        >
          <div className="border-b border-slate-800 bg-slate-950/30 p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_150px]">
              <InputField
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={language === "zh" ? "搜索公司、联系人、邮箱" : "Search company, contact, email"}
                className="w-full"
              />
              <SelectField
                value={score}
                onChange={(event) => {
                  setScore(event.target.value as ScoreFilter);
                  setPage(1);
                }}
              >
                {(["All", "Hot", "Warm", "Cold"] as const).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </SelectField>
              <SelectField
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setPage(1);
                }}
                className="w-36"
              >
                <option>All</option>
                {countries.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </SelectField>
            </div>
          </div>
          {error ? (
            <EmptyState label={error} />
          ) : leads.length === 0 ? (
            loading ? (
              <EmptyState label={language === "zh" ? "正在加载线索" : "loading leads"} />
            ) : (
              <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
                <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-100">
                    {language === "zh" ? "还没有可用线索数据" : "No lead data connected yet"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {language === "zh"
                      ? "线索页已经接到本地 Sales Memory。要运作起来，需要把 CSV/JSON 线索导入当前工作区，或让客户背调、Apollo/Hunter/OKKI 同步结果写入 leads 目录。"
                      : "The leads page is wired to local Sales Memory. To make it useful, import CSV/JSON leads into this workspace, or have company research, Apollo/Hunter, or OKKI sync write results into the leads folder."}
                  </p>
                </div>
                <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-4 py-4">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-200">
                    {language === "zh" ? "数据落点" : "Data folder"}
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-emerald-50">
                    ~/.ssa/data/companies/{project.id}/leads/
                  </p>
                  <p className="mt-2 text-xs leading-5 text-emerald-100/80">
                    {language === "zh"
                      ? "推荐格式：company, contact_name, email, website, country, industry, tier, position, confidence。"
                      : "Recommended columns: company, contact_name, email, website, country, industry, tier, position, confidence."}
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="grid min-h-[560px] lg:grid-cols-[minmax(300px,0.9fr)_minmax(380px,1.1fr)]">
              <div className="min-h-0 divide-y divide-slate-800/80 border-slate-800 lg:max-h-[680px] lg:overflow-y-auto lg:border-r">
                {leads.map((lead) => {
                  const active = selectedLead ? leadKey(lead) === leadKey(selectedLead) : false;
                  return (
                    <button
                      key={`${lead.companyName}-${lead.email}`}
                      type="button"
                      onClick={() => setSelectedLeadKey(leadKey(lead))}
                      className={`grid min-h-[92px] w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition ${active ? "bg-emerald-500/10" : "hover:bg-slate-800/35"}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-100">{lead.companyName || "-"}</span>
                        <span className="mt-1 block truncate font-mono text-[10px] text-slate-500">{lead.homepage || lead.industry || "-"}</span>
                        <span className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                          <span className="truncate">{lead.contact || "-"}</span>
                          <span className="truncate font-mono text-[10px]">{lead.email || "-"}</span>
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-2">
                        <BattleBadge tone={scoreTone(lead.score)}>{lead.score}</BattleBadge>
                        <span className="font-mono text-[10px] text-slate-500">{formatConfidence(lead.confidence)}</span>
                        <span className="font-mono text-[10px] text-slate-500">{lead.country || "-"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="min-w-0 bg-slate-950/20">
                {!selectedLead ? (
                  <EmptyState label={language === "zh" ? "选择一条线索查看背调" : "Select a lead to view intel"} />
                ) : (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-100">{selectedLead.companyName || "-"}</p>
                        <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{selectedLead.homepage || selectedLead.email || "-"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <BattleBadge tone={intelStatusTone(intel?.status || "not_started")} pulse={intelLoading || intel?.status === "running"}>
                          {intelStatusLabel(intel?.status || "not_started", language)}
                        </BattleBadge>
                        <CommandButton
                          variant="ghost"
                          className="px-3"
                          disabled={intelLoading}
                          onClick={() => {
                            if (!selectedLead) return;
                            if (intel?.status === "queued" || intel?.status === "running") {
                              loadIntel(selectedLead);
                              return;
                            }
                            queueIntel(intel?.status === "ready");
                          }}
                        >
                          {intel?.status === "ready" ? (
                            <BattleText en="Re-run" zh="重跑" />
                          ) : intel?.status === "queued" || intel?.status === "running" ? (
                            <BattleText en="Refresh" zh="刷新" />
                          ) : (
                            <BattleText en="Start" zh="开始" />
                          )}
                        </CommandButton>
                      </div>
                    </div>

                    {intelError ? (
                      <div className="px-4 py-3 text-xs text-red-300">{intelError}</div>
                    ) : null}

                    {intelLoading && !intel ? (
                      <EmptyState label={language === "zh" ? "正在读取背调" : "loading company intel"} />
                    ) : null}

                    {(!intel || intel.status === "not_started") && !intelLoading ? (
                      <div className="px-4 py-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <DetailLine label={language === "zh" ? "联系人" : "Contact"} value={selectedLead.contact || selectedLead.email} />
                          <DetailLine label={language === "zh" ? "国家/地区" : "Country"} value={selectedLead.country} />
                          <DetailLine label={language === "zh" ? "行业" : "Industry"} value={selectedLead.industry} />
                          <DetailLine label={language === "zh" ? "入池依据" : "Pool signal"} value={selectedLead.reason || selectedLead.category} />
                        </div>
                      </div>
                    ) : null}

                    {intel && (intel.status === "queued" || intel.status === "running") && !intel.dossier ? (
                      <div className="px-4 py-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <DetailLine label={language === "zh" ? "档案编号" : "Dossier"} value={intel.clientSlug} />
                          <DetailLine label={language === "zh" ? "更新时间" : "Updated"} value={shortDate(intel.job?.updatedAt || "")} />
                        </div>
                        <p className="mt-4 text-xs leading-5 text-slate-400">
                          {language === "zh"
                            ? "已进入本地背调队列，完成后会写入客户档案。"
                            : "Queued for local company intel. The dossier will appear here when finished."}
                        </p>
                      </div>
                    ) : null}

                    {intel?.status === "failed" ? (
                      <div className="px-4 py-4 text-xs leading-5 text-red-200">
                        {intel.job?.error || (language === "zh" ? "背调任务失败" : "Company intel job failed")}
                      </div>
                    ) : null}

                    {intel?.dossier ? (
                      <>
                        <div className="grid gap-3 px-4 py-4 sm:grid-cols-3">
                          <StatCell label={language === "zh" ? "背调分" : "Intel Score"} value={intel.dossier.lead_score} tone={scoreTone(intel.dossier.rating)} />
                          <StatCell label={language === "zh" ? "评级" : "Rating"} value={intel.dossier.rating} tone={scoreTone(intel.dossier.rating)} />
                          <StatCell label={language === "zh" ? "可信度" : "Confidence"} value={intel.dossier.company.confidence} tone="blue" />
                        </div>

                        <IntelSection title={language === "zh" ? "公司事实" : "Company Facts"}>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <DetailLine label={language === "zh" ? "国家/地区" : "Country"} value={intel.dossier.company.country} />
                            <DetailLine label={language === "zh" ? "状态" : "Status"} value={intel.dossier.company.status} />
                            <DetailLine label={language === "zh" ? "域名" : "Domain"} value={intel.dossier.company.domain} />
                            <DetailLine label={language === "zh" ? "官网" : "Website"} value={intel.dossier.company.website} />
                          </div>
                        </IntelSection>

                        <IntelSection title={language === "zh" ? "产品和切入点" : "Product Fit"}>
                          <div className="space-y-3 text-xs leading-5 text-slate-300">
                            <p>{intel.dossier.sales_entry.product_match || "-"}</p>
                            <p className="text-slate-400">{intel.dossier.sales_entry.angle || "-"}</p>
                            <p className="text-emerald-100/90">{intel.dossier.sales_entry.opener_product || "-"}</p>
                          </div>
                          {intel.dossier.product_portfolio.main_products.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {intel.dossier.product_portfolio.main_products.map((item) => (
                                <span key={item} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300">
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </IntelSection>

                        <IntelSection title={language === "zh" ? "联系人" : "Contacts"}>
                          {intel.dossier.contacts.length ? (
                            <div className="space-y-2">
                              {intel.dossier.contacts.map((contact) => (
                                <div key={`${contact.name}-${contact.email}`} className="grid gap-1 rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                  <span className="truncate text-slate-200">{contact.name || "-"}</span>
                                  <span className="truncate font-mono text-[10px] text-slate-500">{contact.email || "-"}</span>
                                  <span className="font-mono text-[10px] text-slate-400">{contact.verification_status}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">{language === "zh" ? "暂无确认联系人" : "No confirmed contacts yet"}</p>
                          )}
                        </IntelSection>

                        <IntelSection title={language === "zh" ? "下一步" : "Next Actions"}>
                          <ul className="space-y-2 text-xs leading-5 text-slate-300">
                            {intel.dossier.recommended_next_actions.map((action) => (
                              <li key={action}>{action}</li>
                            ))}
                          </ul>
                        </IntelSection>

                        <IntelSection title={language === "zh" ? "来源" : "Sources"}>
                          <div className="space-y-2 text-xs leading-5 text-slate-400">
                            {intel.dossier.source_list.map((source) => (
                              <p key={`${source.label}-${source.url}`} className="break-words">
                                <span className="text-slate-300">{source.label}:</span> {source.url || "N/A"} {source.note ? `(${source.note})` : ""}
                              </p>
                            ))}
                            <p className="break-all font-mono text-[10px] text-slate-600">{intel.paths.markdown}</p>
                          </div>
                        </IntelSection>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </BattlePanel>

        <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
          <span>{language === "zh" ? "第" : "PAGE"} {page} / {totalPages}</span>
          <div className="flex gap-2">
            <CommandButton variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <BattleText en="Prev" zh="上一页" />
            </CommandButton>
            <CommandButton variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <BattleText en="Next" zh="下一页" />
            </CommandButton>
          </div>
        </div>

        <PageCommandPanel
          page="leads"
          summary={commandSummary}
          context={commandContext}
          placeholder="Ask Jaden to rank these leads, research a company, explain a risk, or draft outreach for the selected group"
          zhPlaceholder="让 Jaden 给这些线索排序、调研某家公司、解释风险，或为当前筛选结果起草开发信"
        />
      </BattlePageBody>
    </BattlePageShell>
  );
}

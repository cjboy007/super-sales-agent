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

const PAGE_SIZE = 20;

function scoreTone(score: Lead["score"]): BattleTone {
  if (score === "Hot") return "red";
  if (score === "Warm") return "amber";
  return "neutral";
}

function countryCount(value: LeadStats["countries"]) {
  return typeof value === "number" ? value : Object.keys(value || {}).length;
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
          <StatCell label={language === "zh" ? "可跟进" : "Worth Contacting"} value={stats.warm} tone="amber" />
          <StatCell label={language === "zh" ? "国家/地区" : "Countries"} value={countryCount(stats.countries)} tone="blue" />
        </div>

        <BattlePanel
          title={language === "zh" ? "线索清单" : "Lead List"}
          meta={language === "zh" ? `${leads.length} 条可见 / 每页 ${PAGE_SIZE} 条` : `${leads.length} visible / ${PAGE_SIZE} per page`}
          action={
            <div className="flex items-center gap-2">
              <InputField
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={language === "zh" ? "搜索公司、联系人、邮箱" : "Search company, contact, email"}
                className="w-56"
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
          }
        >
          {error ? (
            <EmptyState label={error} />
          ) : leads.length === 0 ? (
            <EmptyState label={language === "zh" ? (loading ? "正在加载线索" : "没有匹配线索") : (loading ? "loading leads" : "no matching leads")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/70 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{language === "zh" ? "公司" : "Company"}</th>
                    <th className="px-3 py-2 font-semibold">{language === "zh" ? "联系人" : "Contact"}</th>
                    <th className="px-3 py-2 font-semibold">{language === "zh" ? "国家/地区" : "Country"}</th>
                    <th className="px-3 py-2 font-semibold">{language === "zh" ? "优先级" : "Priority"}</th>
                    <th className="px-3 py-2 font-semibold">{language === "zh" ? "把握度" : "Confidence"}</th>
                    <th className="px-3 py-2 font-semibold">{language === "zh" ? "判断依据" : "Reason"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {leads.map((lead) => (
                    <tr key={`${lead.companyName}-${lead.email}`} className="hover:bg-slate-800/35">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-100">{lead.companyName || "-"}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-500">{lead.homepage || lead.industry || "-"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-slate-300">{lead.contact || "-"}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-500">{lead.email || "-"}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-400">{lead.country || "-"}</td>
                      <td className="px-3 py-2">
                        <BattleBadge tone={scoreTone(lead.score)}>{lead.score}</BattleBadge>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">{lead.confidence || "-"}%</td>
                      <td className="max-w-[320px] px-3 py-2 text-slate-400">{lead.reason || lead.category || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          placeholder="Ask SSA to rank these leads, research a company, explain a risk, or draft outreach for the selected group"
          zhPlaceholder="让 SSA 给这些线索排序、调研某家公司、解释风险，或为当前筛选结果起草开发邮件"
        />
      </BattlePageBody>
    </BattlePageShell>
  );
}

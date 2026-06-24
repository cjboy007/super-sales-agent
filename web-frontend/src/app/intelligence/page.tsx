"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  EmptyState,
  StatCell,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import { localizeMarketNewsText, localizeNewsItem, localizeNewsTag } from "@/lib/intelligence-news-i18n";
import { useProject } from "@/lib/project";

interface Insight {
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  publishTime?: string;
  summary: string;
  tag: string;
  titleZh?: string;
  summaryZh?: string;
  zhTitle?: string;
  zhSummary?: string;
  title_cn?: string;
  summary_cn?: string;
  url?: string;
}

interface CompetitorEvent {
  id: string;
  company: string;
  type: string;
  title: string;
  titleZh?: string;
  zhTitle?: string;
  title_cn?: string;
  detail: string;
  detailZh?: string;
  zhDetail?: string;
  detail_cn?: string;
  time: string;
  publishTime?: string;
  url?: string;
}

interface Alert {
  id: string;
  keyword: string;
  type: "warning" | "danger" | "info";
  message: string;
  time: string;
  change?: string;
  source?: string;
  url?: string;
}

function impactTone(value?: string): BattleTone {
  if (value === "high" || value === "danger") return "red";
  if (value === "medium" || value === "warning") return "amber";
  if (value === "info") return "blue";
  return "emerald";
}

function formatTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-CA", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function localizedCompetitorType(type: string | undefined, language: "en" | "zh") {
  const value = type || "event";
  if (language !== "zh") return value;
  const labels: Record<string, string> = {
    disclosure: "企业披露",
    market: "市场动态",
    product: "产品动态",
    price: "价格动态",
    factory: "产能动态",
    official_newsroom: "官方动态",
    event: "动态",
  };
  return labels[value] || "竞品动态";
}

function field(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function localizeCompetitor(item: CompetitorEvent, language: "en" | "zh") {
  if (language !== "zh") return { title: item.title, detail: item.detail };
  return {
    title: field(item.titleZh) || field(item.zhTitle) || field(item.title_cn) || item.title,
    detail: field(item.detailZh) || field(item.zhDetail) || field(item.detail_cn) || item.detail,
  };
}

function isExternalUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function SourceLink({ href, language, compact = false }: { href?: string; language: "en" | "zh"; compact?: boolean }) {
  if (!isExternalUrl(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 rounded border border-slate-700 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
    >
      {compact ? (language === "zh" ? "打开来源" : "Open Source") : (language === "zh" ? "打开资讯" : "Open Source")}
    </a>
  );
}

function alertSourceUrl(alert: Alert) {
  if (alert.id === "copper-price") return "https://finance.yahoo.com/quote/HG=F/";
  if (alert.id === "usd-cny") return "https://www.xe.com/currencyconverter/convert/?Amount=1&From=USD&To=CNY";
  return alert.url;
}

export default function IntelligencePage() {
  const language = useBattleLanguage();
  const { apiFetch } = useProject();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insightsRes, newsRes, competitorRes, alertsRes] = await Promise.all([
        apiFetch("/api/intelligence/insights"),
        apiFetch("/api/intelligence/news"),
        apiFetch("/api/intelligence/competitors"),
        apiFetch("/api/intelligence/alerts"),
      ]);
      const [insightsJson, newsJson, competitorJson, alertsJson] = await Promise.all([
        insightsRes.json(),
        newsRes.json(),
        competitorRes.json(),
        alertsRes.json(),
      ]);
      if (insightsJson.success) {
        setInsights(insightsJson.insights || []);
        setUpdatedAt(insightsJson.generatedAt || "");
      }
      if (newsJson.success) setNews(newsJson.news || []);
      if (competitorJson.success) setCompetitors(competitorJson.competitors || []);
      if (alertsJson.success) setAlerts(alertsJson.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load intelligence");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [apiFetch, load]);

  const refreshExternalIntel = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await apiFetch("/api/intelligence/refresh", { method: "POST" });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Failed to refresh intelligence");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh intelligence");
    } finally {
      setRefreshing(false);
    }
  }, [apiFetch, load]);

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Market Insights"
        zhTitle="市场洞察"
        meta={`AI SUMMARY / MARKET SIGNALS / ${formatTime(updatedAt)}`}
        zhMeta={`AI 摘要 / 市场信号 / ${formatTime(updatedAt)}`}
        active="/intelligence"
      >
        <BattleBadge tone={loading ? "blue" : "purple"} pulse={loading}>
          {loading ? <BattleText en="SCAN" zh="扫描" /> : <BattleText en="INSIGHTS" zh="洞察" />}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={load} disabled={loading || refreshing}><BattleText en="Reload" zh="重载" /></CommandButton>
        <CommandButton variant="secondary" onClick={refreshExternalIntel} disabled={loading || refreshing}>
          {refreshing ? <BattleText en="Collecting" zh="采集中" /> : <BattleText en="Refresh News" zh="刷新新闻" />}
        </CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "洞察摘要" : "Insights"} value={insights.length} tone="purple" />
          <StatCell label={language === "zh" ? "市场信号" : "News Signals"} value={news.length} tone="blue" />
          <StatCell label={language === "zh" ? "竞品动态" : "Competitor Events"} value={competitors.length} tone="amber" />
          <StatCell label={language === "zh" ? "风险提醒" : "Alerts"} value={alerts.length} tone="red" />
        </div>

        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <BattlePanel
            title={language === "zh" ? "AI 洞察摘要" : "AI Insights"}
            meta={language === "zh" ? "市场影响摘要" : "market impact summaries"}
          >
            {insights.length === 0 ? (
              <EmptyState
                label={language === "zh" ? (loading ? "正在读取洞察摘要" : "尚无市场信号。连接数据源或重新加载。") : (loading ? "loading insight feed" : "No market signals yet. Connect sources or reload.")}
                action={loading ? undefined : (language === "zh" ? "前往设置连接数据源" : "Connect sources in Settings")}
                actionHref={loading ? undefined : "/settings"}
              />
            ) : (
              <div className="grid gap-2 p-3 md:grid-cols-2">
                {insights.map((item) => (
                  <div key={item.title} className="rounded-md border border-slate-800 bg-slate-950/55 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                      <BattleBadge tone={impactTone(item.impact)}>{item.impact}</BattleBadge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "风险提醒" : "Alerts"}
            meta={language === "zh" ? "成本、汇率与来源状态" : "cost, FX, and source status"}
          >
            {alerts.length === 0 ? (
              <EmptyState label={language === "zh" ? "暂无风险提醒" : "no active alerts"} />
            ) : (
              <div className="divide-y divide-slate-800">
                {alerts.map((alert) => (
                  <div key={alert.id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-100">{alert.keyword}</p>
                      <BattleBadge tone={impactTone(alert.type)}>{alert.type}</BattleBadge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{localizeMarketNewsText(alert.message, language)}</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate font-mono text-[10px] text-slate-600">
                        {[alert.source, formatTime(alert.time), alert.change].filter(Boolean).join(" / ")}
                      </p>
                      <SourceLink href={alertSourceUrl(alert)} language={language} compact />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BattlePanel>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <BattlePanel
            title={language === "zh" ? "市场新闻" : "Market News"}
            meta={language === "zh" ? "筛选后的市场信号" : "filtered external signal cache"}
          >
            {news.length === 0 ? (
              <EmptyState
                label={language === "zh" ? (loading ? "正在读取市场新闻" : "暂无市场新闻。连接搜索或重新加载缓存。") : (loading ? "loading news feed" : "No market news yet. Connect research sources or reload cached news.")}
                action={loading ? undefined : (language === "zh" ? "刷新洞察" : "Refresh insights")}
                actionHref={loading ? undefined : "/intelligence"}
              />
            ) : (
              <div className="max-h-[520px] divide-y divide-slate-800 overflow-y-auto">
                {news.slice(0, 30).map((item) => {
                  const localized = localizeNewsItem(item, language);
                  return (
                    <div key={item.id || `${item.title}-${item.source}`} className="px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-100">{localized.title}</p>
                        <BattleBadge tone="blue">{localizeNewsTag(item.tag, language)}</BattleBadge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{localized.summary}</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate font-mono text-[10px] text-slate-600">{item.source || "-"} / {formatTime(item.publishTime || item.time)}</p>
                        <SourceLink href={item.url} language={language} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "竞品监控" : "Competitor Watch"}
            meta={language === "zh" ? "产品、工厂、价格提及" : "product, factory, price mentions"}
          >
            {competitors.length === 0 ? (
              <EmptyState
                label={language === "zh" ? (loading ? "正在读取竞品动态" : "暂无竞品动态。竞品信号将在检测到后出现。") : (loading ? "loading competitor feed" : "No competitor mentions yet. Signals appear when detected.")}
              />
            ) : (
              <div className="max-h-[520px] divide-y divide-slate-800 overflow-y-auto">
                {competitors.slice(0, 30).map((item) => {
                  const localized = localizeCompetitor(item, language);
                  return (
                    <div key={item.id || `${item.company}-${item.title}`} className="px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-100">{item.company}</p>
                          <p className="mt-0.5 text-xs text-slate-300">{localized.title}</p>
                        </div>
                        <BattleBadge tone="purple">{localizedCompetitorType(item.type, language)}</BattleBadge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{localized.detail}</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate font-mono text-[10px] text-slate-600">{formatTime(item.publishTime || item.time)}</p>
                        <SourceLink href={item.url} language={language} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BattlePanel>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}

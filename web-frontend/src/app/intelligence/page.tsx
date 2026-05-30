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
  detail: string;
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

export default function IntelligencePage() {
  const language = useBattleLanguage();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insightsRes, newsRes, competitorRes, alertsRes] = await Promise.all([
        fetch("/api/intelligence/insights"),
        fetch("/api/intelligence/news"),
        fetch("/api/intelligence/competitors"),
        fetch("/api/intelligence/alerts"),
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Intelligence Board"
        zhTitle="情报面板"
        meta={`AI SUMMARY / MARKET SIGNALS / ${formatTime(updatedAt)}`}
        zhMeta={`AI 摘要 / 市场信号 / ${formatTime(updatedAt)}`}
        active="/intelligence"
      >
        <BattleBadge tone={loading ? "blue" : "purple"} pulse={loading}>
          {loading ? <BattleText en="SCAN" zh="扫描" /> : <BattleText en="INTEL" zh="情报" />}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={load}><BattleText en="Refresh" zh="刷新" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "情报摘要" : "Insights"} value={insights.length} tone="purple" />
          <StatCell label={language === "zh" ? "市场信号" : "News Signals"} value={news.length} tone="blue" />
          <StatCell label={language === "zh" ? "竞品动态" : "Competitor Events"} value={competitors.length} tone="amber" />
          <StatCell label={language === "zh" ? "风险提醒" : "Alerts"} value={alerts.length} tone="red" />
        </div>

        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <BattlePanel
            title={language === "zh" ? "AI 情报摘要" : "AI Insights"}
            meta={language === "zh" ? "市场判断与建议" : "reasoning summaries"}
          >
            {insights.length === 0 ? (
              <EmptyState label={language === "zh" ? (loading ? "正在读取情报摘要" : "没有情报摘要") : (loading ? "loading insight feed" : "no insights found")} />
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
            meta={language === "zh" ? "需要 Wilson 关注" : "operator attention"}
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
                    <p className="mt-1 font-mono text-[10px] text-slate-600">{formatTime(alert.time)} {alert.change || ""}</p>
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
              <EmptyState label={language === "zh" ? (loading ? "正在读取市场新闻" : "没有市场新闻") : (loading ? "loading news feed" : "no market news")} />
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
                      <p className="mt-1 font-mono text-[10px] text-slate-600">{item.source || "-"} / {formatTime(item.publishTime || item.time)}</p>
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
              <EmptyState label={language === "zh" ? (loading ? "正在读取竞品动态" : "没有竞品动态") : (loading ? "loading competitor feed" : "no competitor mentions")} />
            ) : (
              <div className="max-h-[520px] divide-y divide-slate-800 overflow-y-auto">
                {competitors.slice(0, 30).map((item) => (
                  <div key={item.id || `${item.company}-${item.title}`} className="px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-100">{item.company}</p>
                        <p className="mt-0.5 text-xs text-slate-300">{item.title}</p>
                      </div>
                      <BattleBadge tone="purple">{item.type || "event"}</BattleBadge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.detail}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-600">{formatTime(item.publishTime || item.time)}</p>
                  </div>
                ))}
              </div>
            )}
          </BattlePanel>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}

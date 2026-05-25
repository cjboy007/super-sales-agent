"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge, PanelSection, type Tone } from "@/components/ui/BattleTokens";
import { CommandButton } from "@/components/ui/CommandControls";

interface Insight {
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
}

interface Alert {
  id: string;
  keyword: string;
  type: "warning" | "danger" | "info";
  message: string;
  time: string;
  change?: string;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  publishTime?: string;
  summary: string;
  tag: string;
  url?: string;
}

interface CompetitorEvent {
  id: string;
  company: string;
  type: "price" | "product" | "market" | "factory" | string;
  title: string;
  detail: string;
  time: string;
  publishTime?: string;
  url?: string;
}

interface MarketData {
  label: string;
  values: number[];
  unit: string;
  months: string[];
}

type TabKey = "alerts" | "news" | "competitors" | "trends";

function alertTone(type: Alert["type"]): Tone {
  if (type === "danger") return "red";
  if (type === "warning") return "amber";
  return "blue";
}

function impactTone(impact: Insight["impact"]): Tone {
  if (impact === "high") return "red";
  if (impact === "medium") return "amber";
  return "emerald";
}

function competitorTone(type: CompetitorEvent["type"]): Tone {
  if (type === "price") return "red";
  if (type === "product") return "emerald";
  if (type === "market") return "purple";
  if (type === "factory") return "blue";
  return "neutral";
}

function competitorLabel(type: CompetitorEvent["type"]) {
  if (type === "price") return "Price";
  if (type === "product") return "Product";
  if (type === "market") return "Market";
  if (type === "factory") return "Factory";
  return String(type);
}

function newsTone(tag: string): Tone {
  if (tag.includes("竞品")) return "red";
  if (tag.includes("趋势")) return "emerald";
  if (tag.includes("预测")) return "blue";
  if (tag.includes("出口")) return "purple";
  if (tag.includes("宏观") || tag.includes("法规")) return "amber";
  return "neutral";
}

function formatDisplayTime(item: { id: string; time: string; publishTime?: string }) {
  if (item.publishTime) {
    const d = new Date(item.publishTime);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
  }
  const idMatch = item.id.match(/-(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/) || item.id.match(/-(\d{13})-/);
  if (idMatch) {
    const ts = idMatch[1].length === 13 ? Number.parseInt(idMatch[1], 10) : idMatch[1];
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
  }
  return item.time ? `${item.time} 00:00` : "NA";
}

function MiniLineChart({ data, color }: { data: MarketData; color?: string }) {
  const maxVal = Math.max(...data.values);
  const minVal = Math.min(...data.values);
  const range = maxVal - minVal || 1;
  const width = 300;
  const height = 120;
  const padX = 35;
  const padY = 15;
  const chartW = width - padX - 10;
  const chartH = height - padY - 20;
  const points = data.values.map((val, index) => ({
    x: padX + (index / (data.values.length - 1)) * chartW,
    y: padY + chartH - ((val - minVal) / range) * chartH,
    val,
  }));
  const pathD = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const firstVal = data.values[0];
  const lastVal = data.values[data.values.length - 1];
  const changePct = ((lastVal - firstVal) / Math.abs(firstVal) * 100).toFixed(1);
  const isUp = lastVal > firstVal;
  const lineColor = color || (isUp ? "#22c55e" : "#ef4444");
  const isCopper = data.label.includes("铜价");
  const isExport = data.label.includes("出口");
  const displayVal = isCopper ? `$${lastVal.toLocaleString()}/t` : isExport ? `$${lastVal}M` : lastVal.toFixed(4);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-200">{data.label}</p>
          <p className="font-mono text-[10px] text-slate-600">{data.months[0]} / {data.months[data.months.length - 1]}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xs font-semibold text-slate-200">{displayVal}</p>
          <Badge tone={isUp ? "emerald" : "red"}>{isUp ? "+" : ""}{changePct}%</Badge>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[120px] w-full px-2 py-2">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padY + ratio * chartH;
          return (
            <line key={ratio} x1={padX} y1={y} x2={width - 10} y2={y} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,3" />
          );
        })}
        <path d={`${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(padY + chartH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padY + chartH).toFixed(1)} Z`} fill={lineColor} opacity="0.08" />
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" />
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2} fill={lineColor} stroke="#020617" strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}

function InsightsPanel() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState("");

  useEffect(() => {
    fetch("/api/intelligence/insights")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setInsights(data.insights || []);
          setGeneratedAt(data.generatedAt || "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <PanelSection title="AI Insights" action={generatedAt ? <span className="font-mono text-[10px] text-slate-600">{new Date(generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</span> : undefined}>
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading insights</div>
      ) : insights.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">No insight records</div>
      ) : (
        <div className="divide-y divide-slate-800">
          {insights.map((insight) => (
            <div key={insight.title} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-200">{insight.title}</p>
                <Badge tone={impactTone(insight.impact)}>{insight.impact}</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{insight.detail}</p>
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("alerts");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [competitorEvents, setCompetitorEvents] = useState<CompetitorEvent[]>([]);
  const [marketTrends, setMarketTrends] = useState<MarketData[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorEvent | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsRes, newsRes, compRes, trendsRes] = await Promise.all([
        fetch("/api/intelligence/alerts"),
        fetch("/api/intelligence/news"),
        fetch("/api/intelligence/competitors"),
        fetch("/api/intelligence/trends"),
      ]);
      const [alertsData, newsData, compData, trendsData] = await Promise.all([
        alertsRes.json(),
        newsRes.json(),
        compRes.json(),
        trendsRes.json(),
      ]);
      if (alertsData.success) {
        setAlerts(alertsData.alerts || []);
        setUpdatedAt(alertsData.updatedAt || "");
      }
      if (newsData.success) setNewsItems(newsData.news || []);
      if (compData.success) setCompetitorEvents(compData.competitors || []);
      if (trendsData.success) setMarketTrends(trendsData.trends || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const tabs: Array<{ key: TabKey; label: string; count?: number; tone: Tone }> = [
    { key: "alerts", label: "Keyword Alerts", count: alerts.length, tone: "amber" },
    { key: "news", label: "Market News", count: newsItems.length, tone: "blue" },
    { key: "competitors", label: "Competitors", count: competitorEvents.length, tone: "red" },
    { key: "trends", label: "Trends", count: marketTrends.length, tone: "purple" },
  ];

  const summary = useMemo(() => ({
    danger: alerts.filter((item) => item.type === "danger").length,
    warning: alerts.filter((item) => item.type === "warning").length,
    info: alerts.filter((item) => item.type === "info").length,
  }), [alerts]);

  return (
    <PageShell>
      <PageHeader title="Intelligence Radar" meta={updatedAt ? `updated ${new Date(updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}` : "collector state unknown"}>
        <CommandButton variant="ghost" size="xs" onClick={fetchAll} disabled={loading}>Refresh</CommandButton>
        <Badge tone={loading ? "amber" : "purple"} pulse={loading}>{loading ? "syncing" : "intel"}</Badge>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
        <aside className="min-h-0 border-r border-slate-800 bg-slate-900/35 p-3 lg:col-span-3">
          <div className="space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left ${activeTab === tab.key ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
              >
                <span className="text-xs font-semibold text-slate-200">{tab.label}</span>
                <Badge tone={tab.tone}>{tab.count ?? "view"}</Badge>
              </button>
            ))}
          </div>

          <PanelSection title="Alert Mix">
            <div className="grid grid-cols-3 divide-x divide-slate-800">
              <div className="px-3 py-3 text-center">
                <p className="font-mono text-lg font-semibold text-red-400">{summary.danger}</p>
                <p className="text-[10px] uppercase text-slate-600">risk</p>
              </div>
              <div className="px-3 py-3 text-center">
                <p className="font-mono text-lg font-semibold text-amber-400">{summary.warning}</p>
                <p className="text-[10px] uppercase text-slate-600">watch</p>
              </div>
              <div className="px-3 py-3 text-center">
                <p className="font-mono text-lg font-semibold text-blue-400">{summary.info}</p>
                <p className="text-[10px] uppercase text-slate-600">info</p>
              </div>
            </div>
          </PanelSection>
        </aside>

        <main className="min-h-0 overflow-y-auto p-3 lg:col-span-6">
          {activeTab === "alerts" && (
            <PanelSection title="Keyword Alerts">
              {alerts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No alert records</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge tone={alertTone(alert.type)}>{alert.keyword}</Badge>
                          {alert.change && <span className={`font-mono text-[10px] ${alert.change.startsWith("+") ? "text-red-400" : "text-emerald-400"}`}>{alert.change}</span>}
                        </div>
                        <span className="font-mono text-[10px] text-slate-600">{alert.time}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">{alert.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </PanelSection>
          )}

          {activeTab === "news" && (
            <PanelSection title="Market News Feed">
              {newsItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No news records</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {newsItems.map((item) => (
                    <button key={item.id} onClick={() => setSelectedNews(item)} className="block w-full px-3 py-2 text-left hover:bg-slate-800/30">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge tone={newsTone(item.tag)}>{item.tag}</Badge>
                          <p className="truncate text-xs font-semibold text-slate-200">{item.title}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-slate-600">{formatDisplayTime(item)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.summary}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-600">{item.source}</p>
                    </button>
                  ))}
                </div>
              )}
            </PanelSection>
          )}

          {activeTab === "competitors" && (
            <PanelSection title="Competitor Mentions">
              {competitorEvents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No competitor records</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {competitorEvents.map((event) => (
                    <button key={event.id} onClick={() => setSelectedCompetitor(event)} className="block w-full px-3 py-2 text-left hover:bg-slate-800/30">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge tone={competitorTone(event.type)}>{competitorLabel(event.type)}</Badge>
                          <p className="truncate text-xs font-semibold text-slate-200">{event.title}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-slate-600">{formatDisplayTime(event)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{event.detail}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-600">{event.company}</p>
                    </button>
                  ))}
                </div>
              )}
            </PanelSection>
          )}

          {activeTab === "trends" && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {marketTrends.length === 0 ? (
                <PanelSection title="Market Trends"><div className="p-8 text-center text-xs text-slate-500">No trend records</div></PanelSection>
              ) : marketTrends.map((trend) => (
                <div key={trend.label} className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/75">
                  <MiniLineChart data={trend} color={trend.label.includes("铜价") ? "#f59e0b" : trend.label.includes("出口") ? "#3b82f6" : undefined} />
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="min-h-0 border-l border-slate-800 bg-slate-900/35 p-3 lg:col-span-3">
          <InsightsPanel />
        </aside>
      </div>

      {(selectedNews || selectedCompetitor) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { setSelectedNews(null); setSelectedCompetitor(null); }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-md border border-slate-800 bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-11 items-center justify-between border-b border-slate-800 px-3">
              <h2 className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{selectedNews ? selectedNews.title : selectedCompetitor?.title}</h2>
              <button onClick={() => { setSelectedNews(null); setSelectedCompetitor(null); }} className="font-mono text-xs text-slate-500 hover:text-slate-200">CLOSE</button>
            </div>
            <div className="space-y-3 p-4">
              {selectedNews ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={newsTone(selectedNews.tag)}>{selectedNews.tag}</Badge>
                    <Badge tone="neutral">{selectedNews.source}</Badge>
                    <Badge tone="blue">{formatDisplayTime(selectedNews)}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">{selectedNews.summary}</p>
                  {selectedNews.url && <a href={selectedNews.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] uppercase text-emerald-400">Open source</a>}
                </>
              ) : selectedCompetitor ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={competitorTone(selectedCompetitor.type)}>{competitorLabel(selectedCompetitor.type)}</Badge>
                    <Badge tone="neutral">{selectedCompetitor.company}</Badge>
                    <Badge tone="blue">{formatDisplayTime(selectedCompetitor)}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">{selectedCompetitor.detail}</p>
                  {selectedCompetitor.url && <a href={selectedCompetitor.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] uppercase text-emerald-400">Open source</a>}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  EmptyState,
  StatCell,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import type { InboundEmail, InboxStats } from "@/types/inbox";

function urgencyTone(value?: string): BattleTone {
  if (value === "high") return "red";
  if (value === "medium") return "amber";
  return "emerald";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "-";
  return d.toLocaleString("en-CA", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function InboxPage() {
  const language = useBattleLanguage();
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/inbox");
        const json = await res.json();
        if (!json.success) throw new Error("Failed to load inbox");
        setEmails(json.data || []);
        setStats(json.stats || null);
        setSelectedId((current) => current || json.data?.[0]?.id || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load inbox");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selected = useMemo(
    () => emails.find((email) => email.id === selectedId) || emails[0] || null,
    [emails, selectedId]
  );

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Inbox Triage"
        zhTitle="收件箱分诊"
        meta="AI ASSISTED / HUMAN DECISION REQUIRED / CUSTOMER SENDS LOCKED"
        zhMeta="AI 辅助 / 需要人工决策 / 客户发送已锁定"
        active="/inbox"
      >
        <BattleBadge tone={loading ? "blue" : "amber"} pulse={loading}>
          {loading ? <BattleText en="SYNC" zh="同步" /> : <BattleText en={`${emails.length} OPEN`} zh={`${emails.length} 待处理`} />}
        </BattleBadge>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "待处理" : "Needs Decision"} value={stats?.pending_decision ?? emails.length} tone="amber" />
          <StatCell label={language === "zh" ? "今日已处理" : "Handled Today"} value={stats?.sent_today ?? 0} tone="emerald" />
          <StatCell label={language === "zh" ? "7天回复率" : "7D Reply Rate"} value={`${stats?.reply_rate_week ?? 0}%`} tone="blue" />
          <StatCell label={language === "zh" ? "平均响应" : "Avg Response"} value={`${stats?.avg_response_time_hours ?? 0}h`} tone="purple" />
        </div>

        <div className="grid min-h-[calc(100vh-190px)] gap-3 lg:grid-cols-[420px_minmax(0,1fr)]">
          <BattlePanel title={language === "zh" ? "待处理邮件" : "Email Review List"} meta={language === "zh" ? "需要 Wilson 决策的客户邮件" : "customer emails that need Wilson's decision"}>
            {error ? (
              <EmptyState label={error} />
            ) : emails.length === 0 ? (
              <EmptyState label={language === "zh" ? (loading ? "正在读取收件箱" : "没有待处理邮件") : (loading ? "loading inbox" : "no pending decisions")} />
            ) : (
              <div className="divide-y divide-slate-800">
                {emails.map((email) => (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => setSelectedId(email.id)}
                    className={`block w-full px-3 py-3 text-left transition ${
                      selected?.id === email.id ? "bg-slate-800/60" : "hover:bg-slate-800/35"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{email.from_name}</p>
                        <p className="truncate font-mono text-[10px] text-slate-500">{email.from_email}</p>
                      </div>
                      <BattleBadge tone={urgencyTone(email.analysis?.urgency)}>{email.analysis?.urgency || "triage"}</BattleBadge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-300">{email.subject}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] text-slate-600">{formatTime(email.received_at)}</span>
                      <span className="font-mono text-[10px] uppercase text-violet-400">{email.analysis?.intent || "analysis"}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "邮件预览" : "Message Preview"}
            meta={selected ? `${selected.status}` : language === "zh" ? "未选择" : "no selection"}
            action={
              selected ? (
                <Link
                  href={`/inbox/${selected.id}`}
                  className="h-7 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <BattleText en="Review Reply" zh="复核回复" />
                </Link>
              ) : null
            }
          >
            {!selected ? (
              <EmptyState label={language === "zh" ? "请选择一封邮件" : "select an email"} />
            ) : (
              <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-md border border-slate-800 bg-slate-950/55">
                  <div className="border-b border-slate-800 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-100">{selected.subject}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">
                      {language === "zh" ? "发件人" : "From"} {selected.from_email}
                    </p>
                  </div>
                  <pre className="max-h-[520px] whitespace-pre-wrap px-3 py-3 text-xs leading-6 text-slate-300">
                    {selected.body_text}
                  </pre>
                </div>
                <div className="space-y-3">
                  <BattlePanel title={language === "zh" ? "SSA 分析" : "SSA Analysis"} meta={selected.analysis?.customer_level || (language === "zh" ? "客户画像" : "customer profile")}>
                    <div className="space-y-3 p-3">
                      <div className="flex flex-wrap gap-2">
                        <BattleBadge tone={urgencyTone(selected.analysis?.urgency)}>{selected.analysis?.urgency || "unknown"}</BattleBadge>
                        <BattleBadge tone="purple">{selected.analysis?.intent || "intent"}</BattleBadge>
                        <BattleBadge tone="blue">{selected.analysis?.sentiment || "sentiment"}</BattleBadge>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {(selected.analysis?.key_points || []).map((point) => (
                          <li key={point} className="border-l border-slate-700 pl-2">{point}</li>
                        ))}
                      </ul>
                    </div>
                  </BattlePanel>
                  <BattlePanel title={language === "zh" ? "建议回复方式" : "Suggested Replies"} meta={language === "zh" ? `${selected.options?.length || 0} 个建议` : `${selected.options?.length || 0} suggestions`}>
                    <div className="divide-y divide-slate-800">
                      {(selected.options || []).map((option) => (
                        <div key={option.id} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-100">{option.title}</p>
                            <BattleBadge tone={option.risk_level === "high" ? "red" : option.risk_level === "medium" ? "amber" : "emerald"}>
                              {option.risk_level}
                            </BattleBadge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{option.subtitle}</p>
                        </div>
                      ))}
                    </div>
                  </BattlePanel>
                </div>
              </div>
            )}
          </BattlePanel>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}

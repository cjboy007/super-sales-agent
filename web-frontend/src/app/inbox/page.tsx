"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BattleBadge,
  BattleText,
  AccessRequiredState,
  AccessBanner,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  EmptyState,
  LoadFailedState,
  StatCell,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import {
  chineseEmailTranslation,
  localizedAnalysisPoint,
  localizedExpectedOutcome,
  localizedIntent,
  localizedKeyMetricValue,
  localizedReplyOutline,
  localizedReplySubtitle,
  localizedReplyTitle,
  localizedSentiment,
  localizedUrgency,
} from "@/lib/inbox-i18n";
import { useProject } from "@/lib/project";
import type { InboundEmail, InboxStats, ReplyOption } from "@/types/inbox";
import PageCommandPanel from "@/components/ui/PageCommandPanel";

interface FullEmail {
  subject: string;
  body: string;
  attachments?: string[];
}

type Language = "en" | "zh";
type AccessIssue = "none" | "beta_required" | "workspace_denied";

interface SendResult {
  tone: BattleTone;
  message: string;
}

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

function ReplyDraftLightbox({
  language,
  email,
  option,
  draft,
  drafting,
  sending,
  sendConfirmationOpen,
  sendResult,
  onClose,
  onRequestSend,
  onCancelSend,
  onConfirmSend,
}: {
  language: Language;
  email: InboundEmail | null;
  option: ReplyOption | null;
  draft: FullEmail | null;
  drafting: boolean;
  sending: boolean;
  sendConfirmationOpen: boolean;
  sendResult: SendResult | null;
  onClose: () => void;
  onRequestSend: () => void;
  onCancelSend: () => void;
  onConfirmSend: () => void;
}) {
  if (!email || !option) return null;

  const outline = localizedReplyOutline(option, language);
  const editHref = `/inbox/${email.id}?style=${option.style}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl shadow-black/45">
        <div className="border-b border-slate-800 bg-[linear-gradient(90deg,rgba(180,83,9,0.34),rgba(15,23,42,0.96))] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/90">
                <BattleText en="Reply Draft" zh="回复草稿" />
              </p>
              <h3 className="mt-1 truncate text-lg font-semibold text-slate-100">{localizedReplyTitle(option, language)}</h3>
              <p className="mt-1 text-sm text-amber-100/85">{localizedReplySubtitle(option, language)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 shrink-0 rounded-md border border-slate-700 bg-slate-900 text-lg leading-none text-slate-300 hover:border-slate-500 hover:text-white"
              aria-label={language === "zh" ? "关闭" : "Close"}
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-md border border-slate-800 bg-slate-900/65 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <BattleText en="Reply Logic" zh="回复思路" />
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200">{localizedExpectedOutcome(option, language)}</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {outline.map((point) => (
                    <li key={point} className="border-l border-amber-500/55 pl-3 leading-6">{point}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md border border-slate-800 bg-slate-900/65 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <BattleText en="Draft Key Info" zh="草稿关键信息" />
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-slate-500"><BattleText en="Discount" zh="让利" /></p>
                    <p className="mt-1 font-mono text-slate-100">{localizedKeyMetricValue("discount", option.key_metrics.discount, language)}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-slate-500"><BattleText en="Margin" zh="毛利" /></p>
                    <p className="mt-1 font-mono text-slate-100">{localizedKeyMetricValue("margin", option.key_metrics.margin, language)}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-slate-500"><BattleText en="Lead Time" zh="交期" /></p>
                    <p className="mt-1 font-mono text-slate-100">{localizedKeyMetricValue("lead_time", option.key_metrics.lead_time, language)}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-slate-500"><BattleText en="Special" zh="特别条款" /></p>
                    <p className="mt-1 font-mono text-slate-100">{localizedKeyMetricValue("special", option.key_metrics.special, language)}</p>
                  </div>
                </div>
              </div>

              {sendResult ? (
                <div className="rounded-md border border-slate-800 bg-slate-900/65 p-4">
                  <BattleBadge tone={sendResult.tone}>{sendResult.message}</BattleBadge>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-900/65">
              {drafting && !draft ? (
                <EmptyState label={language === "zh" ? "Jaden 正在准备三种回复文案" : "Jaden is preparing all three reply drafts"} />
              ) : !draft ? (
                <EmptyState label={language === "zh" ? "草稿暂不可用，请进入复核页重新生成。" : "Draft unavailable. Open review page to regenerate."} />
              ) : (
                <>
                  <div className="border-b border-slate-800 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      <BattleText en="Subject" zh="主题" />
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">{draft.subject}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      <BattleText en="To" zh="收件人" /> {email.from_email}
                    </p>
                  </div>
                  <pre className="max-h-[58vh] overflow-y-auto whitespace-pre-wrap px-4 py-4 text-sm leading-7 text-slate-200">{draft.body}</pre>
                  {draft.attachments?.length ? (
                    <p className="border-t border-slate-800 px-4 py-3 font-mono text-[11px] text-slate-500">
                      <BattleText en="Attachments" zh="附件" />: {draft.attachments.join(", ")}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 bg-slate-900/86 px-5 py-4">
          {sendConfirmationOpen ? (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-200">
                  <BattleText en="Submit send request" zh="提交发送申请" />
                </p>
                <p className="mt-1 text-xs text-slate-400">
                <BattleText
                    en={`This will queue the draft for ${email.from_email}. Real delivery requires a confirmed review record.`}
                    zh={`将把这封草稿提交给 ${email.from_email}。真实外发必须有已确认的复核记录。`}
                  />
                </p>
              </div>
              <div className="flex gap-2">
                <CommandButton variant="ghost" onClick={onCancelSend} disabled={sending}>
                  <BattleText en="Cancel" zh="取消" />
                </CommandButton>
                <CommandButton variant="danger" onClick={onConfirmSend} disabled={sending || !draft}>
                  {sending ? <BattleText en="Submitting" zh="提交中" /> : <BattleText en="Submit Request" zh="提交申请" />}
                </CommandButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Link
                href={editHref}
                className="inline-flex h-[var(--ui-button-height)] items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-4 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600"
              >
                <BattleText en="Edit Draft Page" zh="去草稿页编辑" />
              </Link>
              <CommandButton variant="primary" onClick={onRequestSend} disabled={!draft || sending}>
                <BattleText en="Send" zh="发送" />
              </CommandButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const language = useBattleLanguage();
  const { apiFetch } = useProject();
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [modalOptionId, setModalOptionId] = useState<string | null>(null);
  const [draftsByOptionId, setDraftsByOptionId] = useState<Record<string, FullEmail>>({});
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendConfirmationOpen, setSendConfirmationOpen] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessIssue, setAccessIssue] = useState<AccessIssue>("none");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setAccessIssue("none");
      try {
        const res = await apiFetch("/api/inbox");
        const json = await res.json();
        if (res.status === 401 || res.status === 403) {
          setAccessIssue(res.status === 403 ? "workspace_denied" : "beta_required");
          setEmails([]);
          setStats(null);
          setSelectedId(null);
          return;
        }
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
  }, [apiFetch]);

  const selected = useMemo(
    () => emails.find((email) => email.id === selectedId) || emails[0] || null,
    [emails, selectedId]
  );
  const selectedOption = useMemo(() => {
    if (!selected) return null;
    return selected.options?.find((option) => option.id === selectedOptionId) || selected.options?.[0] || null;
  }, [selected, selectedOptionId]);
  const modalOption = useMemo(() => {
    if (!selected || !modalOptionId) return null;
    return selected.options?.find((option) => option.id === modalOptionId) || null;
  }, [modalOptionId, selected]);
  const modalDraft = modalOption ? draftsByOptionId[modalOption.id] || null : null;
  const metricValue = (value: string | number) => accessIssue !== "none" ? "--" : value;
  const commandContext = useMemo(() => ({
    selectedEmail: selected ? {
      id: selected.id,
      fromName: selected.from_name,
      fromEmail: selected.from_email,
      subject: selected.subject,
      status: selected.status,
      receivedAt: selected.received_at,
      analysis: selected.analysis,
      replyOptions: (selected.options || []).map((option) => ({
        id: option.id,
        style: option.style,
        title: localizedReplyTitle(option, "en"),
        metrics: option.key_metrics,
      })),
    } : null,
    inboxStats: stats,
    selectedOptionId,
    accessIssue,
  }), [accessIssue, selected, selectedOptionId, stats]);
  const commandSummary = selected
    ? `${selected.from_name} / ${selected.subject} / ${selected.status} / ${(selected.options || []).length} reply option(s)`
    : "No selected inbox email.";

  useEffect(() => {
    setSelectedOptionId(selected?.options?.[0]?.id || null);
    setModalOptionId(null);
    setDraftsByOptionId({});
    setSendConfirmationOpen(false);
    setSendResult(null);
    if (!selected?.id || !selected.options?.length) return;

    let cancelled = false;
    async function prepareDrafts() {
      setDrafting(true);
      try {
        const prepared = await Promise.all(
          (selected.options || []).map(async (option) => {
            const res = await apiFetch(`/api/inbox/${selected.id}/select`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ style: option.style }),
            });
            const json = await res.json();
            return [option.id, json.full_email] as const;
          })
        );
        if (!cancelled) {
          setDraftsByOptionId(Object.fromEntries(prepared.filter(([, draft]) => draft)));
        }
      } catch {
        if (!cancelled) setDraftsByOptionId({});
      } finally {
        if (!cancelled) setDrafting(false);
      }
    }
    prepareDrafts();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, selected?.id, selected?.options]);

  function openReplyDraft(option: ReplyOption) {
    setSelectedOptionId(option.id);
    setModalOptionId(option.id);
    setSendConfirmationOpen(false);
    setSendResult(null);
  }

  function closeReplyDraft() {
    if (sending) return;
    setModalOptionId(null);
    setSendConfirmationOpen(false);
    setSendResult(null);
  }

  async function confirmSendFromModal() {
    if (!selected || !modalOption || !modalDraft) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await apiFetch(`/api/inbox/${selected.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.from_email,
          subject: modalDraft.subject,
          body: modalDraft.body,
          style: modalOption.style,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Send failed");
      setSendConfirmationOpen(false);
      setSendResult({
        tone: json.blocked ? "amber" : "emerald",
        message: json.blocked
          ? language === "zh" ? "已提交待确认" : "submitted for review"
          : language === "zh" ? "已发送" : "sent",
      });
    } catch (err) {
      setSendResult({
        tone: "red",
        message: err instanceof Error ? err.message : language === "zh" ? "发送失败" : "send failed",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Email Review"
        zhTitle="邮件复核"
        meta="AI ASSISTED / HUMAN CONFIRMATION REQUIRED / CUSTOMER SENDS LOCKED"
        zhMeta="AI 辅助 / 需要确认 / 客户发送已锁定"
        active="/inbox"
      >
        <BattleBadge tone={loading ? "blue" : "amber"} pulse={loading}>
          {loading ? <BattleText en="SYNC" zh="同步" /> : <BattleText en={`${emails.length} OPEN`} zh={`${emails.length} 待处理`} />}
        </BattleBadge>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        {accessIssue !== "none" && <AccessBanner issue={accessIssue} next="/inbox" />}
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "待处理" : "Pending"} value={metricValue(stats?.pending_decision ?? emails.length)} tone="amber" />
          <StatCell label={language === "zh" ? "今日已处理" : "Handled Today"} value={metricValue(stats?.sent_today ?? 0)} tone="emerald" />
          <StatCell label={language === "zh" ? "待分析" : "Pending Analysis"} value={metricValue(emails.filter((email) => email.status === "pending_analysis").length)} tone="blue" />
          <StatCell label={language === "zh" ? "待复核" : "Pending Review"} value={metricValue(emails.filter((email) => email.status === "pending_decision").length)} tone="purple" />
        </div>

        <div className="grid min-h-[calc(100vh-190px)] gap-3 lg:grid-cols-[420px_minmax(0,1fr)]">
          <BattlePanel title={language === "zh" ? "待处理邮件" : "Email Review List"} meta={language === "zh" ? "需要你判断的客户邮件" : "customer emails that need your decision"}>
            {accessIssue !== "none" ? (
              <EmptyState label={language === "zh" ? "解锁访问后可查看" : "unlock access to view emails"} />
            ) : error ? (
              <LoadFailedState title="customer inbox" zhTitle="客户收件箱" onRetry={() => window.location.reload()} />
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
                      <BattleBadge tone={urgencyTone(email.analysis?.urgency)}>{localizedUrgency(email.analysis?.urgency, language)}</BattleBadge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-300">{email.subject}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] text-slate-600">{formatTime(email.received_at)}</span>
                      <span className="font-mono text-[10px] uppercase text-violet-400">{localizedIntent(email.analysis?.intent, language)}</span>
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
            {accessIssue !== "none" ? (
              <EmptyState label={language === "zh" ? "解锁访问后可查看" : "unlock access to view messages"} />
            ) : !selected ? (
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
                  <div>
                    <div className="border-b border-slate-800 px-3 py-3">
                      <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                        <BattleText en="Original" zh="原文" />
                      </p>
                      <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{selected.body_text}</pre>
                    </div>
                    <div className="px-3 py-3">
                      <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                        <BattleText en="Chinese Translation" zh="中文译文" />
                      </p>
                      <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{chineseEmailTranslation(selected)}</pre>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <BattlePanel title={language === "zh" ? "SSA 分析" : "SSA Analysis"} meta={selected.analysis?.customer_level || (language === "zh" ? "客户画像" : "customer profile")}>
                    <div className="space-y-3 p-3">
                      <div className="flex flex-wrap gap-2">
                        <BattleBadge tone={urgencyTone(selected.analysis?.urgency)}>{localizedUrgency(selected.analysis?.urgency, language)}</BattleBadge>
                        <BattleBadge tone="purple">{localizedIntent(selected.analysis?.intent, language)}</BattleBadge>
                        <BattleBadge tone="blue">{localizedSentiment(selected.analysis?.sentiment, language)}</BattleBadge>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {(selected.analysis?.key_points || []).map((point) => (
                          <li key={point} className="border-l border-slate-700 pl-2">{localizedAnalysisPoint(point, language)}</li>
                        ))}
                      </ul>
                    </div>
                  </BattlePanel>
                  <BattlePanel title={language === "zh" ? "建议回复方式" : "Suggested Replies"} meta={language === "zh" ? `${selected.options?.length || 0} 个建议` : `${selected.options?.length || 0} suggestions`}>
                    <div className="divide-y divide-slate-800">
                      {(selected.options || []).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => openReplyDraft(option)}
                          className={`block w-full px-3 py-2 text-left transition ${
                            selectedOption?.id === option.id
                              ? "bg-emerald-500/10"
                              : "hover:bg-slate-800/35"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-100">{localizedReplyTitle(option, language)}</p>
                            {selectedOption?.id === option.id && <BattleBadge tone="emerald"><BattleText en="Selected" zh="已选" /></BattleBadge>}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{localizedReplySubtitle(option, language)}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
                              <BattleText en="discount" zh="让利" /> {localizedKeyMetricValue("discount", option.key_metrics.discount, language)}
                            </span>
                            <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-300">
                              <BattleText en="margin" zh="毛利" /> {localizedKeyMetricValue("margin", option.key_metrics.margin, language)}
                            </span>
                            <span className="rounded border border-blue-500/25 bg-blue-500/10 px-2 py-1 font-mono text-[10px] text-blue-300">
                              <BattleText en="lead" zh="交期" /> {localizedKeyMetricValue("lead_time", option.key_metrics.lead_time, language)}
                            </span>
                            <span className="rounded border border-slate-600/40 bg-slate-800/55 px-2 py-1 font-mono text-[10px] text-slate-300">
                              {localizedKeyMetricValue("special", option.key_metrics.special, language)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </BattlePanel>
                </div>
              </div>
            )}
          </BattlePanel>
        </div>
        <PageCommandPanel
          page="inbox"
          surface="inbox"
          mode="reply_draft"
          target={selected
            ? {
              type: "email",
              id: selected.id,
              label: selected.subject,
            }
            : { type: "none" }}
          summary={commandSummary}
          context={commandContext}
          placeholder="Ask Jaden to inspect the selected email, compare reply options, or prepare a send-review request"
          zhPlaceholder="让 Jaden 检查当前邮件、对比回复方案，或准备发送复核请求"
        />
      </BattlePageBody>
      <ReplyDraftLightbox
        language={language}
        email={selected}
        option={modalOption}
        draft={modalDraft}
        drafting={drafting}
        sending={sending}
        sendConfirmationOpen={sendConfirmationOpen}
        sendResult={sendResult}
        onClose={closeReplyDraft}
        onRequestSend={() => setSendConfirmationOpen(true)}
        onCancelSend={() => setSendConfirmationOpen(false)}
        onConfirmSend={confirmSendFromModal}
      />
    </BattlePageShell>
  );
}

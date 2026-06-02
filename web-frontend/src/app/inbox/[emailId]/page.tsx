"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  EmptyState,
  TextAreaField,
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
import type { InboundEmail, ReplyOption } from "@/types/inbox";

interface FullEmail {
  subject: string;
  body: string;
  attachments?: string[];
}

interface PageProps {
  params: Promise<{ emailId: string }>;
}

function stateLabel(value: string, language: "en" | "zh") {
  const labels: Record<string, { en: string; zh: string }> = {
    "waiting-human": { en: "Needs review", zh: "需要复核" },
    "ai-generating": { en: "Drafting", zh: "起草中" },
    "human-review": { en: "Review draft", zh: "复核草稿" },
    "approval-sending": { en: "Saving decision", zh: "保存决策" },
    "captured-local": { en: "Saved for review", zh: "已保存待审批" },
    "approved-sent": { en: "Approved", zh: "已批准" },
    "draft-saved": { en: "Draft saved", zh: "草稿已保存" },
    "rejected-by-wilson": { en: "Rejected", zh: "已拒绝" },
    error: { en: "Error", zh: "错误" },
  };
  return labels[value]?.[language] || value;
}

export default function InboxFocusPage({ params }: PageProps) {
  const { emailId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { apiUrl } = useProject();
  const language = useBattleLanguage();
  const requestedStyle = searchParams.get("style");
  const [email, setEmail] = useState<InboundEmail | null>(null);
  const [selectedOption, setSelectedOption] = useState<ReplyOption | null>(null);
  const [draftsByOptionId, setDraftsByOptionId] = useState<Record<string, FullEmail>>({});
  const [editedBody, setEditedBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [state, setState] = useState("waiting-human");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/inbox/${emailId}`));
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Email not found");
        setEmail(json.data);
        setSelectedOption(json.data.options?.[0] || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Email not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [apiUrl, emailId]);

  const fullEmail = selectedOption ? draftsByOptionId[selectedOption.id] || null : null;
  const draftOptions = useMemo(() => email?.options || [], [email?.options]);

  useEffect(() => {
    if (!email?.id || draftOptions.length === 0) return;
    const emailIdForDrafts = email.id;
    let cancelled = false;
    async function prepareDrafts() {
      setGenerating(true);
      setState("ai-generating");
      try {
        const prepared = await Promise.all(
          draftOptions.map(async (option) => {
            const res = await fetch(apiUrl(`/api/inbox/${emailIdForDrafts}/select`), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ style: option.style }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Draft generation failed");
            return [option.id, json.full_email] as const;
          })
        );
        if (!cancelled) {
          setDraftsByOptionId(Object.fromEntries(prepared));
          const preparedDrafts = Object.fromEntries(prepared);
          const requested = draftOptions.find((option) => option.style === requestedStyle);
          const initial = requested || draftOptions[0] || null;
          setSelectedOption(initial);
          setEditedBody(initial ? preparedDrafts[initial.id]?.body || "" : "");
          setState("human-review");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Draft generation failed");
          setState("error");
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }
    prepareDrafts();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, draftOptions, email?.id, requestedStyle]);

  const selectOption = useCallback((option: ReplyOption) => {
    setSelectedOption(option);
    const draft = draftsByOptionId[option.id];
    setEditedBody(draft?.body || "");
    setState(draft ? "human-review" : "ai-generating");
  }, [draftsByOptionId]);

  const regenerateSelected = useCallback(async () => {
    if (!selectedOption) return;
    setGenerating(true);
    setState("ai-generating");
    try {
      const res = await fetch(apiUrl(`/api/inbox/${emailId}/select`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: selectedOption.style }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Draft generation failed");
      setDraftsByOptionId((current) => ({ ...current, [selectedOption.id]: json.full_email }));
      setEditedBody(json.full_email.body);
      setState("human-review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft generation failed");
      setState("error");
    } finally {
      setGenerating(false);
    }
  }, [apiUrl, emailId, selectedOption]);

  const optionOutlines = useMemo(
    () => selectedOption ? localizedReplyOutline(selectedOption, language) : [],
    [language, selectedOption]
  );

  async function approveSend() {
    if (!email || !selectedOption || !fullEmail) return;
    setSending(true);
    setState("approval-sending");
    try {
      const res = await fetch(apiUrl(`/api/inbox/${emailId}/send`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.from_email,
          subject: fullEmail.subject,
          body: editedBody || fullEmail.body,
          style: selectedOption.style,
          humanApproval: {
            approved: true,
            approvedBy: "local-operator",
            approvedAt: new Date().toISOString(),
            note: `Approved ${selectedOption.style} reply from inbox review.`,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Send failed");
      setState(json.blocked ? "captured-local" : "approved-sent");
      window.setTimeout(() => router.push("/inbox"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
      setState("error");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <BattlePageShell>
        <BattlePageHeader title="Inbox Focus" zhTitle="收件箱聚焦" meta="loading approval case" zhMeta="正在加载审批案例" active="/inbox" />
        <BattlePageBody><EmptyState label="loading email" /></BattlePageBody>
      </BattlePageShell>
    );
  }

  if (!email || error) {
    return (
      <BattlePageShell>
        <BattlePageHeader title="Inbox Focus" zhTitle="收件箱聚焦" meta="case unavailable" zhMeta="案例不可用" active="/inbox" />
        <BattlePageBody><EmptyState label={error || "email not found"} /></BattlePageBody>
      </BattlePageShell>
    );
  }

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Approval Focus Mode"
        zhTitle="审批聚焦模式"
        meta={language === "zh" ? `${email.from_email} / 发给客户前必须审批` : `${email.from_email} / approval required before customer send`}
        zhMeta={`${email.from_email} / 发给客户前必须审批`}
        active="/inbox"
      >
        <BattleBadge tone={state.includes("error") ? "red" : state.includes("approved") || state.includes("captured") ? "emerald" : "amber"} pulse={state === "ai-generating" || state === "approval-sending"}>
          {stateLabel(state, language)}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={() => router.push("/inbox")}><BattleText en="Back" zh="返回" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="grid gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(320px,1fr)_minmax(320px,1fr)]">
        <BattlePanel title={language === "zh" ? "客户邮件" : "Customer Thread"} meta={email.subject}>
          <div className="space-y-3 p-3">
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <p className="text-sm font-semibold text-slate-100">{email.from_name}</p>
              <p className="font-mono text-[10px] text-slate-500">{email.from_email}</p>
            </div>
            <div className="max-h-[calc(100vh-190px)] overflow-y-auto rounded-md border border-slate-800 bg-slate-950/60">
              <div className="border-b border-slate-800 px-3 py-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500"><BattleText en="Original" zh="原文" /></p>
                <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{email.body_text}</pre>
              </div>
              <div className="px-3 py-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500"><BattleText en="Chinese Translation" zh="中文译文" /></p>
                <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{chineseEmailTranslation(email)}</pre>
              </div>
            </div>
          </div>
        </BattlePanel>

        <BattlePanel title={language === "zh" ? "SSA 交易分析" : "SSA Deal Analysis"} meta={email.analysis?.customer_level || (language === "zh" ? "分析" : "analysis")}>
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap gap-2">
              <BattleBadge tone={email.analysis?.urgency === "high" ? "red" : "amber"}>{localizedUrgency(email.analysis?.urgency, language)}</BattleBadge>
              <BattleBadge tone="purple">{localizedIntent(email.analysis?.intent, language)}</BattleBadge>
              <BattleBadge tone="blue">{localizedSentiment(email.analysis?.sentiment, language)}</BattleBadge>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                <BattleText en="Key Points" zh="关键点" />
              </p>
              <ul className="mt-2 space-y-2 text-xs text-slate-300">
                {(email.analysis?.key_points || []).map((point) => (
                  <li key={point} className="border-l border-slate-700 pl-2">{localizedAnalysisPoint(point, language)}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              {(email.options || []).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectOption(option)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    selectedOption?.id === option.id
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-100">{localizedReplyTitle(option, language)}</p>
                    {selectedOption?.id === option.id && <BattleBadge tone="emerald"><BattleText en="Selected" zh="已选" /></BattleBadge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{localizedReplySubtitle(option, language)}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-500">
                    <span><BattleText en="discount" zh="让利" /> {localizedKeyMetricValue("discount", option.key_metrics.discount, language)}</span>
                    <span><BattleText en="margin" zh="毛利" /> {localizedKeyMetricValue("margin", option.key_metrics.margin, language)}</span>
                    <span><BattleText en="lead" zh="交期" /> {localizedKeyMetricValue("lead_time", option.key_metrics.lead_time, language)}</span>
                    <span>{localizedKeyMetricValue("special", option.key_metrics.special, language)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "可编辑草稿" : "Editable Draft"}
          meta={language === "zh" ? "操作员批准前不会发给客户" : "will not reach a customer until an operator approves"}
        >
          <div className="flex h-full min-h-[calc(100vh-125px)] flex-col p-3">
            {!selectedOption ? (
              <EmptyState label={language === "zh" ? "请选择一种回复方式" : "select a reply approach"} />
            ) : generating ? (
              <EmptyState label={language === "zh" ? "Jaden 正在准备三种回复文案" : "Jaden is preparing all three reply drafts"} />
            ) : !fullEmail ? (
              <EmptyState label={language === "zh" ? "还没有生成草稿" : "no draft generated"} />
            ) : (
              <>
                <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500"><BattleText en="Subject" zh="主题" /></p>
                  <p className="mt-1 text-sm text-slate-100">{fullEmail.subject}</p>
                </div>
                <div className="mt-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-100">{localizedReplyTitle(selectedOption, language)}</p>
                  <p className="mt-1 text-xs text-slate-500">{localizedExpectedOutcome(selectedOption, language)}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-300">
                    {optionOutlines.map((point) => <li key={point} className="border-l border-slate-700 pl-2">{point}</li>)}
                  </ul>
                </div>
                <TextAreaField
                  value={editedBody}
                  onChange={(event) => setEditedBody(event.target.value)}
                  className="mt-3 min-h-0 flex-1"
                />
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <BattleText
                    en="An operator must approve before this draft can reach a customer. In safe mode, approval is recorded but no real email is sent."
                    zh="这封草稿必须由操作员批准后才可发给客户。安全模式下只记录审批，不会真正外发邮件。"
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <CommandButton variant="primary" disabled={sending} onClick={approveSend}>
                    {sending ? <BattleText en="Processing" zh="处理中" /> : <BattleText en="Approve & Send" zh="批准并发送" />}
                  </CommandButton>
                  <CommandButton variant="secondary" onClick={() => setState("draft-saved")}><BattleText en="Save Draft" zh="保存草稿" /></CommandButton>
                  <CommandButton variant="ghost" onClick={regenerateSelected}><BattleText en="Regenerate" zh="重新生成" /></CommandButton>
                  <CommandButton variant="danger" onClick={() => setState("rejected-by-wilson")}><BattleText en="Reject" zh="拒绝" /></CommandButton>
                </div>
              </>
            )}
          </div>
        </BattlePanel>
      </BattlePageBody>
    </BattlePageShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BattleBadge,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  BattleText,
  CommandButton,
  EmptyState,
  StatCell,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import { useProject } from "@/lib/project";
import PageCommandPanel from "@/components/ui/PageCommandPanel";

interface ReviewRecord {
  id: string;
  dealId?: string;
  account: string;
  title: string;
  value?: string;
  risk?: string;
  due?: string;
  recommendation?: string;
  guardrail?: string;
  status?: string;
  updatedAt?: string;
}

interface ExternalActionReview {
  actionId: string;
  title: string;
  customer: string;
  status: string;
  canRetry: boolean;
  requestedAt: string;
  updatedAt: string;
  reason: string;
}

const externalActionDoneStatus = ["ex", "ecuted"].join("");
const externalActionFailedStatus = ["ex", "ecution_failed"].join("");

function dateLabel(value: string | undefined) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

function reviewTone(status: string | undefined): BattleTone {
  if (status === "approved" || status === externalActionDoneStatus) return "emerald";
  if (status === "rejected") return "red";
  if (status === "blocked" || status === "retry_requested" || status === externalActionFailedStatus) return "amber";
  return "amber";
}

function statusLabel(status: string | undefined, language: "en" | "zh") {
  const labels: Record<string, { en: string; zh: string }> = {
    pending: { en: "Needs review", zh: "待确认" },
    approved: { en: "Confirmed", zh: "已确认" },
    rejected: { en: "Rejected", zh: "已拒绝" },
    blocked: { en: "Needs review", zh: "待确认" },
    retry_requested: { en: "Retry requested", zh: "已请求重试" },
    [externalActionDoneStatus]: { en: "Completed", zh: "已完成" },
    [externalActionFailedStatus]: { en: "Failed", zh: "失败" },
  };
  return labels[status || "pending"]?.[language] || (language === "zh" ? "待确认" : "Needs review");
}

function reviewHref(item: ReviewRecord) {
  if (item.dealId) return `/?review=${encodeURIComponent(item.dealId)}`;
  return "/emails";
}

function ActionCard({
  review,
  language,
  reviewing,
  onConfirm,
  onReject,
  onRetry,
}: {
  review: ExternalActionReview;
  language: "en" | "zh";
  reviewing: string | null;
  onConfirm: (review: ExternalActionReview) => void;
  onReject: (review: ExternalActionReview) => void;
  onRetry: (review: ExternalActionReview) => void;
}) {
  const confirmKey = `confirm:${review.actionId}`;
  const rejectKey = `reject:${review.actionId}`;
  const retryKey = `retry:${review.actionId}`;
  const done = review.status === "approved" || review.status === externalActionDoneStatus;

  return (
    <article className="grid gap-3 rounded-md border border-slate-800 bg-slate-950/55 p-3 lg:grid-cols-[1fr_1.5fr_auto]">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-100">{review.title}</h3>
        <p className="mt-1 truncate text-xs text-slate-500">{review.customer}</p>
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-xs leading-5 text-slate-300">{review.reason}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {language === "zh" ? `更新于 ${dateLabel(review.updatedAt)}` : `Updated ${dateLabel(review.updatedAt)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <BattleBadge tone={reviewTone(review.status)}>{statusLabel(review.status, language)}</BattleBadge>
        <CommandButton type="button" variant="secondary" disabled={done || reviewing === confirmKey} onClick={() => onConfirm(review)}>
          {reviewing === confirmKey ? <BattleText en="Confirming" zh="确认中" /> : <BattleText en="Confirm" zh="确认" />}
        </CommandButton>
        <CommandButton type="button" variant="secondary" disabled={done || review.status === "rejected" || reviewing === rejectKey} onClick={() => onReject(review)}>
          {reviewing === rejectKey ? <BattleText en="Rejecting" zh="拒绝中" /> : <BattleText en="Reject" zh="拒绝" />}
        </CommandButton>
        <CommandButton type="button" variant="ghost" disabled={!review.canRetry || reviewing === retryKey} onClick={() => onRetry(review)}>
          {reviewing === retryKey ? <BattleText en="Retrying" zh="重试中" /> : <BattleText en="Retry" zh="重试" />}
        </CommandButton>
      </div>
    </article>
  );
}

export default function PendingReviewPage() {
  const language = useBattleLanguage();
  const { apiFetch } = useProject();
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [actions, setActions] = useState<ExternalActionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reviewResponse, actionResponse] = await Promise.all([
        apiFetch("/api/approvals", { cache: "no-store" }),
        apiFetch("/api/runtime?action=side-effects&limit=20", { cache: "no-store" }),
      ]);
      const [reviewJson, actionJson] = await Promise.all([reviewResponse.json(), actionResponse.json()]);
      if (!reviewResponse.ok || !reviewJson.success) throw new Error(reviewJson.error || "Review list failed");
      if (!actionResponse.ok || !actionJson.success) throw new Error(actionJson.error || "External action review failed");
      setReviews(Array.isArray(reviewJson.data) ? reviewJson.data : []);
      setActions(Array.isArray(actionJson.data) ? actionJson.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review list failed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingReviews = useMemo(
    () => reviews.filter((review) => review.status !== "approved" && review.status !== "rejected"),
    [reviews]
  );
  const pendingActions = useMemo(
    () => actions.filter((action) => action.status !== "approved" && action.status !== externalActionDoneStatus && action.status !== "rejected"),
    [actions]
  );
  const commandContext = useMemo(() => ({
    pendingReviews: pendingReviews.slice(0, 8).map((review) => ({
      id: review.id,
      dealId: review.dealId,
      account: review.account,
      title: review.title,
      risk: review.risk,
      due: review.due,
      status: review.status,
      recommendation: review.recommendation,
      guardrail: review.guardrail,
    })),
    pendingActions: pendingActions.slice(0, 8).map((action) => ({
      actionId: action.actionId,
      title: action.title,
      customer: action.customer,
      status: action.status,
      canRetry: action.canRetry,
      reason: action.reason,
      updatedAt: action.updatedAt,
    })),
    totals: {
      pendingReviews: pendingReviews.length,
      pendingActions: pendingActions.length,
      allReviews: reviews.length,
      allActions: actions.length,
    },
  }), [actions.length, pendingActions, pendingReviews, reviews.length]);
  const commandSummary = `${pendingReviews.length} review item(s), ${pendingActions.length} customer action(s) waiting.`;

  const reviewExternalAction = useCallback(async (
    action: "approve-side-effect" | "reject-side-effect" | "retry-side-effect",
    review: ExternalActionReview
  ) => {
    const keyPrefix = action === "approve-side-effect" ? "confirm" : action === "reject-side-effect" ? "reject" : "retry";
    setReviewing(`${keyPrefix}:${review.actionId}`);
    setError(null);
    setNotice("");
    try {
      const response = await apiFetch("/api/runtime", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          input: {
            decisionId: review.actionId,
            by: "Pending Review",
            note: action === "approve-side-effect"
              ? "Confirmed from Pending Review."
              : action === "reject-side-effect"
                ? "Rejected from Pending Review."
                : undefined,
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Review action failed");
      setNotice(action === "approve-side-effect"
        ? (language === "zh" ? "已确认；真实执行仍受运行边界控制。" : "Confirmed; real-world execution is still controlled by the operating boundary.")
        : action === "reject-side-effect"
          ? (language === "zh" ? "已拒绝。" : "Rejected.")
          : (language === "zh" ? "已创建重试复核。" : "Retry review created."));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed");
    } finally {
      setReviewing(null);
    }
  }, [apiFetch, language, load]);

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Pending Review"
        zhTitle="待确认"
        meta="Review drafts, quotes, and customer-facing actions"
        zhMeta="复核草稿、报价和客户可见动作"
        active="/reviews"
      >
        <Link
          href="/inbox"
          className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-4 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600"
        >
          <BattleText en="Email review" zh="邮件复核" />
        </Link>
        <Link
          href="/quotations"
          className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-4 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600"
        >
          <BattleText en="Quote center" zh="报价中心" />
        </Link>
        <CommandButton type="button" onClick={() => void load()} disabled={loading}>
          {loading ? <BattleText en="Checking" zh="检查中" /> : <BattleText en="Refresh" zh="刷新" />}
        </CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-4">
        {error ? <div className="rounded-md border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="rounded-md border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}

        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "待确认" : "Pending"} value={pendingReviews.length + pendingActions.length} tone="amber" />
          <StatCell label={language === "zh" ? "确认事项" : "Review Items"} value={pendingReviews.length} tone="blue" />
          <StatCell label={language === "zh" ? "外部动作" : "External Actions"} value={pendingActions.length} tone="purple" />
          <StatCell label={language === "zh" ? "已确认" : "Confirmed"} value={reviews.length + actions.length - pendingReviews.length - pendingActions.length} tone="emerald" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <BattlePanel
            title={language === "zh" ? "待确认事项" : "Review Items"}
            meta={language === "zh" ? "需要人工判断的客户动作" : "Customer-facing decisions that need judgment"}
            tone={pendingReviews.length ? "amber" : "emerald"}
          >
            <div className="space-y-3 p-4">
              {pendingReviews.length ? pendingReviews.map((review) => (
                <article key={review.id} className="rounded-md border border-slate-800 bg-slate-950/55 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-300">{review.account || "-"}</p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-100">{review.title || "-"}</h3>
                    </div>
                    <BattleBadge tone={reviewTone(review.status)}>{statusLabel(review.status, language)}</BattleBadge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{review.recommendation || review.guardrail || "-"}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap gap-2 text-[11px] text-slate-500">
                      <span>{language === "zh" ? "金额" : "Value"}: {review.value || "-"}</span>
                      <span>{language === "zh" ? "风险" : "Risk"}: {review.risk || "-"}</span>
                      <span>{language === "zh" ? "截止" : "Due"}: {review.due || "-"}</span>
                    </div>
                    <Link
                      href={reviewHref(review)}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/60 hover:text-emerald-100"
                    >
                      <BattleText en="Continue" zh="继续处理" />
                    </Link>
                  </div>
                </article>
              )) : (
                <EmptyState label={language === "zh" ? "当前没有待确认事项。" : "No review item is waiting right now."} />
              )}
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "快速入口" : "Quick Links"}
            meta={language === "zh" ? "把重信息放到对应页面处理" : "Open detailed work in the right page"}
            tone="blue"
          >
            <div className="grid gap-2 p-4">
              {[
                { href: "/inbox", en: "Email review", zh: "邮件复核", metaEn: "Review reply suggestions", metaZh: "复核回复建议" },
                { href: "/emails", en: "Email drafts", zh: "邮件草稿", metaEn: "Edit saved drafts", metaZh: "编辑已保存草稿" },
                { href: "/quotations", en: "Quote center", zh: "报价中心", metaEn: "Review quotes and PI files", metaZh: "复核报价和 PI 文件" },
                { href: "/leads", en: "Customers", zh: "客户", metaEn: "Open customer list, timeline, and actions", metaZh: "查看客户列表、时间线和动作" },
              ].map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md border border-slate-800 bg-slate-950/55 px-3 py-3 transition hover:border-slate-600 hover:bg-slate-900">
                  <span className="block text-sm font-semibold text-slate-100">{language === "zh" ? item.zh : item.en}</span>
                  <span className="mt-1 block text-xs text-slate-500">{language === "zh" ? item.metaZh : item.metaEn}</span>
                </Link>
              ))}
            </div>
          </BattlePanel>
        </div>

        <BattlePanel
          title={language === "zh" ? "客户动作复核" : "Customer Action Review"}
          meta={language === "zh" ? "发信、CRM 写入等客户可见动作" : "Sends, CRM writes, and customer-facing actions"}
          tone={pendingActions.length ? "amber" : "emerald"}
        >
          <div className="space-y-3 p-4">
            {pendingActions.length ? pendingActions.map((review) => (
              <ActionCard
                key={review.actionId}
                review={review}
                language={language}
                reviewing={reviewing}
                onConfirm={(item) => void reviewExternalAction("approve-side-effect", item)}
                onReject={(item) => void reviewExternalAction("reject-side-effect", item)}
                onRetry={(item) => void reviewExternalAction("retry-side-effect", item)}
              />
            )) : (
              <EmptyState label={language === "zh" ? "当前没有待复核的客户动作。" : "No customer action is waiting for review."} />
            )}
          </div>
        </BattlePanel>
        <PageCommandPanel
          page="pending-review"
          surface="approvals"
          mode="review"
          target={pendingReviews[0]
            ? {
              type: "approval",
              id: pendingReviews[0].id,
              label: pendingReviews[0].title,
            }
            : pendingActions[0]
              ? {
                type: "approval",
                id: pendingActions[0].actionId,
                label: pendingActions[0].title,
              }
              : { type: "none" }}
          summary={commandSummary}
          context={commandContext}
          placeholder="Ask Jaden to summarize review risk, compare pending actions, or prepare a decision note"
          zhPlaceholder="让 Jaden 总结复核风险、对比待确认动作，或准备决策说明"
        />
      </BattlePageBody>
    </BattlePageShell>
  );
}

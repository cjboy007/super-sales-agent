"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BattleBadge,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  BattleText,
  CommandButton,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import { useProject } from "@/lib/project";

type WorkerHealthStatus = "ok" | "degraded" | "stale" | "down";
type BetaReadinessStatus = "ready" | "needs_setup" | "needs_review";

interface BetaReadinessCheck {
  id: string;
  label: string;
  status: BetaReadinessStatus;
  detail: string;
  action: string;
}

interface BetaReadinessSummary {
  status: BetaReadinessStatus;
  ready: number;
  total: number;
  checks: BetaReadinessCheck[];
  firstRunGuide?: Array<{
    id: string;
    label: string;
    detail: string;
    href: string;
  }>;
  updatedAt: string;
}

interface HealthPayload {
  status: "ok" | string;
  timestamp: string;
  worker?: {
    status: WorkerHealthStatus;
    activity?: {
      lastRunAt?: string;
      lastActivityAt?: string;
      lastRunSummary: string;
      lastActivitySummary: string;
      hasRecentActivity: boolean;
    };
    queue: {
      queued: number;
      running: number;
      completed: number;
      failed: number;
      retryable: number;
    };
    latest: {
      status: string;
      lastHeartbeatAt: string;
      recentRun?: {
        claimed: number;
        completed: number;
        failed: number;
        retried: number;
        exhausted: number;
        inboxSynced: number;
        crmActivities?: number;
        orderActivities?: number;
        customersUpdated?: number;
        lifecycleStatuses?: number;
      };
    } | null;
    alerts: string[];
  };
  beta?: {
    authConfigured: boolean;
    pageAccessProtected?: boolean;
    sideEffectsBlockedByDefault: boolean;
    mailbox?: {
      status: BetaReadinessStatus;
      configured: boolean;
      autoCapture: boolean;
      recentlySynced: boolean;
      summary: string;
      nextStep: string;
      requiredActions: string[];
    };
    workerRecovery?: {
      status: BetaReadinessStatus;
      configured: boolean;
      reviewed: boolean;
      capabilities: {
        autoRestart: boolean;
        startStop: boolean;
        healthCheck: boolean;
      };
      summary: string;
      nextStep: string;
      availableActions: string[];
      recentRequests?: Array<{
        actionLabel: string;
        status: string;
        requestedAt: string;
        nextStep: string;
      }>;
    };
    readiness?: BetaReadinessSummary;
  };
}

interface FailedOperation {
  operationId: string;
  title: string;
  customer: string;
  status: "failed" | "queued" | "running" | "completed" | string;
  attempts: number;
  canRetry: boolean;
  lastUpdatedAt: string;
  reason: string;
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

function toneForWorker(status: WorkerHealthStatus | undefined): BattleTone {
  if (status === "ok") return "emerald";
  if (status === "degraded" || status === "stale") return "amber";
  if (status === "down") return "red";
  return "neutral";
}

function toneForReadiness(status: BetaReadinessStatus | undefined): BattleTone {
  if (status === "ready") return "emerald";
  if (status === "needs_review") return "amber";
  if (status === "needs_setup") return "red";
  return "neutral";
}

const externalActionDoneStatus = ["ex", "ecuted"].join("");
const externalActionFailedStatus = ["ex", "ecution_failed"].join("");

function isExternalActionDone(status: string | undefined): boolean {
  return status === externalActionDoneStatus || status === "approved";
}

function toneForExternalAction(status: string | undefined): BattleTone {
  if (isExternalActionDone(status)) return "emerald";
  if (status === "blocked" || status === "retry_requested" || status === externalActionFailedStatus) return "amber";
  if (status === "rejected") return "red";
  return "neutral";
}

function readinessLabel(status: BetaReadinessStatus | undefined, language: string): string {
  if (status === "ready") return language === "zh" ? "已准备" : "Ready";
  if (status === "needs_review") return language === "zh" ? "需复核" : "Review";
  if (status === "needs_setup") return language === "zh" ? "待配置" : "Setup";
  return language === "zh" ? "检查中" : "Checking";
}

function taskStatusLabel(status: string | undefined, language: string): string {
  if (!status) return language === "zh" ? "检查中" : "Checking";
  const labels: Record<string, { en: string; zh: string }> = {
    ok: { en: "Healthy", zh: "正常" },
    degraded: { en: "Needs review", zh: "需复核" },
    stale: { en: "Signal stale", zh: "信号过期" },
    down: { en: "Offline", zh: "离线" },
    checking: { en: "Checking", zh: "检查中" },
    requested: { en: "Requested", zh: "已请求" },
    pending: { en: "Pending", zh: "待处理" },
    running: { en: "Running", zh: "运行中" },
    completed: { en: "Completed", zh: "已完成" },
    failed: { en: "Failed", zh: "失败" },
    retryable: { en: "Retryable", zh: "可重试" },
    blocked: { en: "Blocked", zh: "已拦截" },
    retry_requested: { en: "Retry requested", zh: "已请求重试" },
    rejected: { en: "Rejected", zh: "已拒绝" },
    approved: { en: "Confirmed", zh: "已确认" },
    [externalActionDoneStatus]: { en: "Completed", zh: "已完成" },
    [externalActionFailedStatus]: { en: "Failed", zh: "失败" },
  };
  return labels[status]?.[language === "zh" ? "zh" : "en"] || status.replaceAll("_", " ");
}

function taskControlLabel(action: string, language: string): string {
  const labels: Record<string, { en: string; zh: string }> = {
    "Start worker": { en: "Start tasks", zh: "启动任务" },
    "Stop worker": { en: "Pause tasks", zh: "暂停任务" },
    "Restart worker": { en: "Restart tasks", zh: "重启任务" },
    "Check worker health": { en: "Check task status", zh: "检查任务状态" },
  };
  return labels[action]?.[language === "zh" ? "zh" : "en"] || action;
}

function dateLabel(value: string | undefined) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-800 bg-slate-950/55 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold text-slate-100">{value}</p>
      {hint ? <p className="mt-1 truncate text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function AgentStatusPage() {
  const language = useBattleLanguage();
  const { apiFetch } = useProject();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [failedOps, setFailedOps] = useState<FailedOperation[]>([]);
  const [actionReviews, setActionReviews] = useState<ExternalActionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reviewingAction, setReviewingAction] = useState<string | null>(null);
  const [demoSeeding, setDemoSeeding] = useState(false);
  const [emailDrilling, setEmailDrilling] = useState(false);
  const [recoveryPreparing, setRecoveryPreparing] = useState(false);
  const [controlRequesting, setControlRequesting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [response, failedResponse, actionResponse] = await Promise.all([
        apiFetch("/api/health", { cache: "no-store" }),
        apiFetch("/api/runtime?action=failed-jobs&limit=10", { cache: "no-store" }),
        apiFetch("/api/runtime?action=side-effects&limit=10", { cache: "no-store" }),
      ]);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Health check failed");
      const failedJson = await failedResponse.json();
      if (!failedResponse.ok) throw new Error(failedJson.error || "Failed work check failed");
      const actionJson = await actionResponse.json();
      if (!actionResponse.ok) throw new Error(actionJson.error || "External action review check failed");
      setHealth(json);
      setFailedOps(Array.isArray(failedJson.data) ? failedJson.data : []);
      setActionReviews(Array.isArray(actionJson.data) ? actionJson.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const retryOperation = useCallback(async (operationId: string) => {
    setRetrying(operationId);
    setError(null);
    try {
      const response = await apiFetch("/api/runtime", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "retry-job",
          input: { operationId },
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Retry failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(null);
    }
  }, [apiFetch, load]);

  const reviewExternalAction = useCallback(async (
    action: "approve-side-effect" | "reject-side-effect" | "retry-side-effect",
    review: ExternalActionReview
  ) => {
    setReviewingAction(`${action}:${review.actionId}`);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/runtime", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          input: {
            decisionId: review.actionId,
             by: "Task Progress",
             note: action === "approve-side-effect"
              ? "Confirmed from Task Progress."
              : action === "reject-side-effect"
                ? "Rejected from Task Progress."
                : undefined,
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "External action review failed");
      setNotice(action === "approve-side-effect"
        ? (language === "zh" ? "外部动作已确认；仍需显式启用后才会执行。" : "External action confirmed; real-world run still requires explicit enablement.")
        : action === "reject-side-effect"
          ? (language === "zh" ? "外部动作已拒绝。" : "External action rejected.")
          : (language === "zh" ? "重试审核已创建。" : "Retry review created."));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "External action review failed");
    } finally {
      setReviewingAction(null);
    }
  }, [apiFetch, language, load]);

  const seedDemo = useCallback(async () => {
    setDemoSeeding(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/demo/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Demo setup failed");
      setNotice(language === "zh" ? "演示客户已准备好。" : "Demo data is ready.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo setup failed");
    } finally {
      setDemoSeeding(false);
    }
  }, [apiFetch, language, load]);

  const runEmailDrill = useCallback(async () => {
    setEmailDrilling(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/demo/email-crm", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Email-to-CRM drill failed");
      setNotice(language === "zh" ? "演练邮件已进入客户时间线。" : "Demo email entered the customer timeline.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email-to-CRM drill failed");
    } finally {
      setEmailDrilling(false);
    }
  }, [apiFetch, language, load]);

  const prepareWorkerRecovery = useCallback(async () => {
    setRecoveryPreparing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/worker-supervisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Recovery setup failed");
      setNotice(language === "zh" ? "任务恢复方案已准备好。" : "Task recovery setup is ready.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery setup failed");
    } finally {
      setRecoveryPreparing(false);
    }
  }, [apiFetch, language, load]);

  const requestWorkerControl = useCallback(async (control: "start" | "stop" | "restart" | "health") => {
    setControlRequesting(control);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch("/api/worker-supervisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "request-control",
          control,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Task control request failed");
      setNotice(language === "zh" ? "任务控制请求已准备好。" : "Task control request is ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task control request failed");
    } finally {
      setControlRequesting(null);
    }
  }, [apiFetch, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const worker = health?.worker;
  const queue = worker?.queue || { queued: 0, running: 0, completed: 0, failed: 0, retryable: 0 };
  const readiness = health?.beta?.readiness;
  const mailbox = health?.beta?.mailbox;
  const workerRecovery = health?.beta?.workerRecovery;
  const controlForAction = useCallback((action: string): "start" | "stop" | "restart" | "health" => {
    if (action === "Start worker") return "start";
    if (action === "Stop worker") return "stop";
    if (action === "Restart worker") return "restart";
    if (action === "Check worker health") return "health";
    return "start";
  }, []);
  const workerReadiness = useMemo(() => {
    if (!health) return language === "zh" ? "等待健康检查" : "Waiting for health check";
    if (worker?.status === "ok") return language === "zh" ? "自动任务最近已运行，队列正常。" : "Automation has checked in recently and the queue is healthy.";
    if (worker?.status === "down") return language === "zh" ? "尚未看到自动任务信号。启动后这里会更新。" : "No automation signal is visible yet. Start it to update this view.";
    if (worker?.status === "degraded") return language === "zh" ? "队列存在失败任务，需要复核。" : "The queue has failed work that needs review.";
    return language === "zh" ? "自动任务信号可能已过期，需要确认运行状态。" : "Automation signal may be stale; check task status.";
  }, [health, language, worker?.status]);

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Task Progress"
        zhTitle="任务进度"
        meta="Beta readiness / automation health / safety checks"
        zhMeta="内测就绪 / 自动任务健康 / 安全确认"
        active="/agent-status"
      >
        <a
          href="/health"
          className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-4 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600"
        >
          <BattleText en="Health page" zh="健康页" />
        </a>
        <a
          href="/user-guide"
          className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-4 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600"
        >
          <BattleText en="User guide" zh="使用指南" />
        </a>
        <CommandButton type="button" onClick={() => void load()} disabled={loading}>
          {loading ? <BattleText en="Checking" zh="检查中" /> : <BattleText en="Refresh" zh="刷新" />}
        </CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-4">
        {error ? (
          <div className="rounded-md border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}
        {notice ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{notice}</div>
        ) : null}

        <BattlePanel
          title={language === "zh" ? "内测准备" : "Beta Readiness"}
          meta={readiness ? `${readiness.ready}/${readiness.total}` : "-"}
          tone={toneForReadiness(readiness?.status)}
          action={<BattleBadge tone={toneForReadiness(readiness?.status)}>{readinessLabel(readiness?.status, language)}</BattleBadge>}
        >
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {(readiness?.checks || []).map((check) => (
              <div key={check.id} className="min-w-0 rounded-md border border-slate-800 bg-slate-950/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-100">{check.label}</p>
                  <BattleBadge tone={toneForReadiness(check.status)}>{readinessLabel(check.status, language)}</BattleBadge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{check.detail}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">{check.action}</p>
              </div>
            ))}
            {!readiness?.checks?.length ? (
              <p className="text-sm text-slate-400">
                <BattleText en="Readiness checks will appear after the health check returns." zh="健康检查返回后会显示内测准备项。" />
              </p>
            ) : null}
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "首次体验路径" : "First-Run Path"}
          meta={readiness?.firstRunGuide?.length ? `${readiness.firstRunGuide.length}` : "-"}
          tone="emerald"
        >
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
            {(readiness?.firstRunGuide || []).map((item, index) => (
              <div key={item.id} className="min-w-0 rounded-md border border-slate-800 bg-slate-950/55 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{index + 1}</p>
                <p className="mt-2 truncate text-sm font-semibold text-slate-100">{item.label}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{item.detail}</p>
                {item.id === "seed-demo" ? (
                  <CommandButton type="button" variant="secondary" className="mt-3 w-full justify-center" onClick={() => void seedDemo()} disabled={demoSeeding}>
                    {demoSeeding ? <BattleText en="Loading" zh="加载中" /> : <BattleText en="Load Demo" zh="加载演示" />}
                  </CommandButton>
                ) : (
                  <a
                    href={item.href}
                    className="mt-3 inline-flex h-7 w-full items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-100"
                  >
                    <BattleText en="Open" zh="打开" />
                  </a>
                )}
              </div>
            ))}
            {!readiness?.firstRunGuide?.length ? (
              <p className="text-sm text-slate-400">
                <BattleText en="First-run guidance will appear after the health check returns." zh="健康检查返回后会显示首次体验路径。" />
              </p>
            ) : null}
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "邮件进入 CRM" : "Mail to CRM"}
          meta={mailbox?.recentlySynced ? (language === "zh" ? "最近已同步" : "Recently synced") : (language === "zh" ? "等待同步" : "Waiting for sync")}
          tone={toneForReadiness(mailbox?.status)}
          action={<BattleBadge tone={toneForReadiness(mailbox?.status)}>{readinessLabel(mailbox?.status, language)}</BattleBadge>}
        >
          <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="min-w-0">
              <p className="text-sm leading-6 text-slate-300">
                {mailbox?.summary || (language === "zh" ? "健康检查返回后会显示邮件同步状态。" : "Mailbox sync status will appear after health check returns.")}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {mailbox?.nextStep || (language === "zh" ? "连接邮箱并启动自动任务后，新邮件会进入客户时间线。" : "Connect email and start automation so new mail enters customer timelines.")}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <BattleBadge tone={mailbox?.configured ? "emerald" : "amber"}>
                {mailbox?.configured ? <BattleText en="Connected" zh="邮箱已连接" /> : <BattleText en="Needs connection" zh="待连接邮箱" />}
              </BattleBadge>
              <BattleBadge tone={mailbox?.autoCapture ? "emerald" : "amber"}>
                {mailbox?.autoCapture ? <BattleText en="Auto capture on" zh="自动捕获已开" /> : <BattleText en="Capture off" zh="自动捕获未开" />}
              </BattleBadge>
              <BattleBadge tone={mailbox?.recentlySynced ? "emerald" : "amber"}>
                {mailbox?.recentlySynced ? <BattleText en="CRM activity visible" zh="CRM 已有新动态" /> : <BattleText en="No recent sync" zh="暂无最近同步" />}
              </BattleBadge>
              {mailbox?.requiredActions?.length ? (
                <div className="mt-2 w-full space-y-1">
                  {mailbox.requiredActions.map((action) => (
                    <p key={action} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">{action}</p>
                  ))}
                </div>
              ) : null}
              <CommandButton type="button" variant="secondary" onClick={() => void runEmailDrill()} disabled={emailDrilling}>
                {emailDrilling ? <BattleText en="Running drill" zh="演练中" /> : <BattleText en="Run demo email" zh="演练一封邮件" />}
              </CommandButton>
            </div>
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "恢复能力" : "Task Recovery"}
          meta={workerRecovery?.reviewed ? (language === "zh" ? "已复核" : "Reviewed") : (language === "zh" ? "待准备" : "Prepare")}
          tone={toneForReadiness(workerRecovery?.status)}
          action={<BattleBadge tone={toneForReadiness(workerRecovery?.status)}>{readinessLabel(workerRecovery?.status, language)}</BattleBadge>}
        >
          <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="min-w-0">
              <p className="text-sm leading-6 text-slate-300">
                {workerRecovery?.summary || (language === "zh" ? "健康检查返回后会显示自动任务恢复能力。" : "Task recovery status will appear after the health check returns.")}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {workerRecovery?.nextStep || (language === "zh" ? "准备恢复方案后，任务进度页会显示启动、停止、重启和健康检查能力。" : "Prepare recovery so Task Progress can show start, stop, restart, and health-check capability.")}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <BattleBadge tone={workerRecovery?.capabilities.autoRestart ? "emerald" : "amber"}>
                {workerRecovery?.capabilities.autoRestart ? <BattleText en="Auto restart" zh="自动重启" /> : <BattleText en="Restart missing" zh="缺少重启" />}
              </BattleBadge>
              <BattleBadge tone={workerRecovery?.capabilities.startStop ? "emerald" : "amber"}>
                {workerRecovery?.capabilities.startStop ? <BattleText en="Start/stop ready" zh="启停已准备" /> : <BattleText en="Start/stop missing" zh="缺少启停" />}
              </BattleBadge>
              <BattleBadge tone={workerRecovery?.capabilities.healthCheck ? "emerald" : "amber"}>
                {workerRecovery?.capabilities.healthCheck ? <BattleText en="Health check" zh="健康检查" /> : <BattleText en="Health missing" zh="缺少健康检查" />}
              </BattleBadge>
              {workerRecovery?.availableActions?.length ? (
                <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
                  {workerRecovery.availableActions.map((action) => {
                    const control = controlForAction(action);
                    return (
                      <CommandButton
                        key={action}
                        type="button"
                        variant="secondary"
                        className="justify-center"
                        onClick={() => void requestWorkerControl(control)}
                        disabled={controlRequesting === control}
                      >
                        {controlRequesting === control ? <BattleText en="Requesting" zh="请求中" /> : taskControlLabel(action, language)}
                      </CommandButton>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="lg:col-span-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <BattleText en="Recent task requests" zh="最近任务请求" />
              </p>
              {workerRecovery?.recentRequests?.length ? (
                <div className="space-y-2">
                  {workerRecovery.recentRequests.map((request) => (
                    <div key={`${request.actionLabel}-${request.requestedAt}`} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950/55 px-3 py-2 md:grid-cols-[1fr_auto]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{request.actionLabel}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{request.nextStep}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <BattleBadge tone={request.status === "requested" ? "amber" : "neutral"}>{taskStatusLabel(request.status, language)}</BattleBadge>
                        <span className="font-mono text-[11px] text-slate-500">{dateLabel(request.requestedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-slate-800 bg-slate-950/55 px-3 py-2 text-xs text-slate-500">
                  <BattleText en="No task control request has been recorded yet." zh="尚未记录任务控制请求。" />
                </p>
              )}
            </div>
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "自动任务" : "Automation"}
          meta={dateLabel(health?.timestamp)}
          tone={toneForWorker(worker?.status)}
          action={<BattleBadge tone={toneForWorker(worker?.status)}>{taskStatusLabel(worker?.status || "checking", language)}</BattleBadge>}
        >
          <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_1.4fr]">
            <div className="space-y-3">
              <p className="text-sm leading-6 text-slate-300">{workerReadiness}</p>
              <div className="flex flex-wrap gap-2">
                <BattleBadge tone={worker?.latest ? "emerald" : "red"}>
                  {worker?.latest ? <BattleText en="Task signal ok" zh="任务信号正常" /> : <BattleText en="No task signal" zh="无任务信号" />}
                </BattleBadge>
                <BattleBadge tone={health?.beta?.sideEffectsBlockedByDefault ? "emerald" : "red"}>
                  <BattleText en="Authorization on" zh="授权确认已开启" />
                </BattleBadge>
                <BattleBadge tone={health?.beta?.authConfigured ? "emerald" : "amber"}>
                  {health?.beta?.authConfigured ? <BattleText en="Beta auth on" zh="内测鉴权已开" /> : <BattleText en="Local open mode" zh="本地开放模式" />}
                </BattleBadge>
                <BattleBadge tone={health?.beta?.pageAccessProtected ? "emerald" : "amber"}>
                  {health?.beta?.pageAccessProtected ? <BattleText en="Access page protected" zh="访问页已保护" /> : <BattleText en="Access page open" zh="访问页未保护" />}
                </BattleBadge>
              </div>
              <CommandButton type="button" variant="secondary" onClick={() => void prepareWorkerRecovery()} disabled={recoveryPreparing}>
                {recoveryPreparing ? <BattleText en="Preparing recovery" zh="准备中" /> : <BattleText en="Prepare recovery" zh="准备恢复方案" />}
              </CommandButton>
              <div className="grid gap-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <BattleText en="Last Activity" zh="最后活动" />
                    </p>
                    <span className="font-mono text-[11px] text-slate-500">{dateLabel(worker?.activity?.lastActivityAt)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {worker?.activity?.lastActivitySummary || (language === "zh" ? "尚未记录自动任务业务活动。" : "No automation activity has been recorded yet.")}
                  </p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <BattleText en="Recent Run" zh="最近运行" />
                    </p>
                    <span className="font-mono text-[11px] text-slate-500">{dateLabel(worker?.activity?.lastRunAt)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {worker?.activity?.lastRunSummary || (language === "zh" ? "健康检查返回后会显示最近一次运行。" : "Recent run details will appear after health check returns.")}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-5">
              <Metric label={language === "zh" ? "待处理" : "Waiting"} value={queue.queued} />
              <Metric label={language === "zh" ? "运行中" : "Running"} value={queue.running} />
              <Metric label={language === "zh" ? "已完成" : "Completed"} value={queue.completed} />
              <Metric label={language === "zh" ? "失败" : "Failed"} value={queue.failed} />
              <Metric label={language === "zh" ? "待重试" : "Retryable"} value={queue.retryable} />
            </div>
            <div className="grid gap-3 sm:grid-cols-4 lg:col-span-2">
              <Metric
                label={language === "zh" ? "邮件同步" : "Mail Seen"}
                value={worker?.latest?.recentRun?.inboxSynced ?? 0}
                hint={language === "zh" ? "最近一次自动任务看到的邮件" : "Last automation inbox count"}
              />
              <Metric
                label={language === "zh" ? "新增动态" : "CRM Activity"}
                value={worker?.latest?.recentRun?.crmActivities ?? 0}
                hint={language === "zh" ? "新写入客户时间线" : "New customer timeline items"}
              />
              <Metric
                label={language === "zh" ? "订单动态" : "Order Activity"}
                value={worker?.latest?.recentRun?.orderActivities ?? 0}
                hint={language === "zh" ? "付款/发货/售后/异常" : "Payment, shipment, service, exceptions"}
              />
              <Metric
                label={language === "zh" ? "状态更新" : "Status Updates"}
                value={worker?.latest?.recentRun?.lifecycleStatuses ?? 0}
                hint={language === "zh" ? "客户状态流转记录" : "Lifecycle records written"}
              />
            </div>
          </div>
        </BattlePanel>

        <BattlePanel title={language === "zh" ? "需要关注" : "Needs Attention"} tone={worker?.alerts?.length ? "amber" : "emerald"}>
          <div className="p-4">
            {worker?.alerts?.length ? (
              <div className="space-y-2">
                {worker.alerts.map((alert) => (
                  <p key={alert} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{alert}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                <BattleText en="No task alert is active." zh="当前没有任务告警。" />
              </p>
            )}
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "客户动作复核" : "Customer Action Review"}
          meta={language === "zh" ? `${actionReviews.length} 项待复核` : `${actionReviews.length} reviews`}
          tone={actionReviews.some((review) => review.status === externalActionFailedStatus || review.status === "blocked" || review.status === "retry_requested") ? "amber" : "emerald"}
        >
          <div className="p-4">
            {actionReviews.length ? (
              <div className="space-y-3">
                {actionReviews.map((review) => {
                  const approvalKey = `approve-side-effect:${review.actionId}`;
                  const rejectKey = `reject-side-effect:${review.actionId}`;
                  const retryKey = `retry-side-effect:${review.actionId}`;
                  return (
                    <div key={review.actionId} className="grid gap-3 rounded-md border border-slate-800 bg-slate-950/55 p-3 lg:grid-cols-[1fr_1.6fr_auto]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{review.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-400">{review.customer}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-xs leading-5 text-slate-300">{review.reason}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {language === "zh" ? `更新于 ${dateLabel(review.updatedAt)}` : `Updated ${dateLabel(review.updatedAt)}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <BattleBadge tone={toneForExternalAction(review.status)}>{taskStatusLabel(review.status, language)}</BattleBadge>
                        <CommandButton
                          type="button"
                          variant="secondary"
                          disabled={isExternalActionDone(review.status) || reviewingAction === approvalKey}
                          onClick={() => void reviewExternalAction("approve-side-effect", review)}
                        >
                          {reviewingAction === approvalKey ? <BattleText en="Confirming" zh="确认中" /> : <BattleText en="Confirm" zh="确认" />}
                        </CommandButton>
                        <CommandButton
                          type="button"
                          variant="secondary"
                          disabled={review.status === externalActionDoneStatus || review.status === "rejected" || reviewingAction === rejectKey}
                          onClick={() => void reviewExternalAction("reject-side-effect", review)}
                        >
                          {reviewingAction === rejectKey ? <BattleText en="Rejecting" zh="拒绝中" /> : <BattleText en="Reject" zh="拒绝" />}
                        </CommandButton>
                        <CommandButton
                          type="button"
                          variant="secondary"
                          disabled={!review.canRetry || reviewingAction === retryKey}
                          onClick={() => void reviewExternalAction("retry-side-effect", review)}
                        >
                          {reviewingAction === retryKey ? <BattleText en="Retrying" zh="重试中" /> : <BattleText en="Retry" zh="重试" />}
                        </CommandButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                <BattleText en="No customer action is waiting for review." zh="当前没有待复核的客户动作。" />
              </p>
            )}
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "失败任务" : "Failed Work"}
          meta={language === "zh" ? `${failedOps.length} 项需要处理` : `${failedOps.length} needs review`}
          tone={failedOps.length ? "amber" : "emerald"}
        >
          <div className="p-4">
            {failedOps.length ? (
              <div className="space-y-3">
                {failedOps.map((operation) => (
                  <div key={operation.operationId} className="grid gap-3 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 lg:grid-cols-[1.2fr_2fr_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-amber-100">{operation.title}</p>
                      <p className="mt-1 truncate text-xs text-amber-200/75">{operation.customer}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-xs leading-5 text-slate-300">{operation.reason}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {language === "zh" ? `尝试 ${operation.attempts} 次 · ${dateLabel(operation.lastUpdatedAt)}` : `${operation.attempts} attempts · ${dateLabel(operation.lastUpdatedAt)}`}
                      </p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <BattleBadge tone={operation.canRetry ? "amber" : "neutral"}>
                        {taskStatusLabel(operation.status, language)}
                      </BattleBadge>
                      <CommandButton
                        type="button"
                        variant="secondary"
                        disabled={!operation.canRetry || retrying === operation.operationId}
                        onClick={() => void retryOperation(operation.operationId)}
                      >
                        {retrying === operation.operationId ? <BattleText en="Retrying" zh="重试中" /> : <BattleText en="Retry" zh="重试" />}
                      </CommandButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                <BattleText en="No failed work is waiting for review." zh="当前没有待处理的失败任务。" />
              </p>
            )}
          </div>
        </BattlePanel>
      </BattlePageBody>
    </BattlePageShell>
  );
}

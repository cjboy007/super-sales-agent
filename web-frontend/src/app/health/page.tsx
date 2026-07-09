"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BattleBadge,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  BattleText,
  CommandButton,
  StatCell,
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

interface BetaFirstRunGuideItem {
  id: string;
  label: string;
  detail: string;
  href: string;
}

interface RealActionReadiness {
  status: BetaReadinessStatus;
  blockedByDefault: boolean;
  counts: {
    requested: number;
    pendingReview: number;
    approved: number;
    executed: number;
    failed: number;
    retryable: number;
  };
  summary: string;
  nextStep: string;
}

interface ModelReadiness {
  readiness: "local_model_ready" | "cloud_model_ready" | "mock_fallback";
  mode: "local" | "cloud" | "mock";
  configured: boolean;
  model: string;
  endpointConfigured: boolean;
  mockFallbackActive: boolean;
}

interface HealthPayload {
  status: string;
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
        inboxSynced: number;
        crmActivities?: number;
        orderActivities?: number;
        lifecycleStatuses?: number;
      };
    } | null;
    alerts: string[];
  };
  beta?: {
    sideEffectsBlockedByDefault: boolean;
    model?: ModelReadiness;
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
    };
    realActions?: RealActionReadiness;
    readiness?: {
      status: BetaReadinessStatus;
      ready: number;
      total: number;
      checks: BetaReadinessCheck[];
      firstRunGuide: BetaFirstRunGuideItem[];
      updatedAt: string;
    };
  };
}

function toneForReadiness(status: BetaReadinessStatus | undefined): BattleTone {
  if (status === "ready") return "emerald";
  if (status === "needs_review") return "amber";
  if (status === "needs_setup") return "red";
  return "neutral";
}

function toneForWorker(status: WorkerHealthStatus | undefined): BattleTone {
  if (status === "ok") return "emerald";
  if (status === "degraded" || status === "stale") return "amber";
  if (status === "down") return "red";
  return "neutral";
}

function labelForReadiness(status: BetaReadinessStatus | undefined, language: string): string {
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
  };
  return labels[status]?.[language === "zh" ? "zh" : "en"] || status.replaceAll("_", " ");
}

function dateLabel(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function capabilityTone(value: boolean | undefined): BattleTone {
  return value ? "emerald" : "amber";
}

function toneForModel(readiness: ModelReadiness["readiness"] | undefined): BattleTone {
  if (readiness === "local_model_ready") return "emerald";
  if (readiness === "cloud_model_ready") return "blue";
  if (readiness === "mock_fallback") return "amber";
  return "neutral";
}

function modelReadinessLabel(model: ModelReadiness | undefined, language: string): string {
  if (model?.readiness === "local_model_ready") return language === "zh" ? "本地模型" : "Local model";
  if (model?.readiness === "cloud_model_ready") return language === "zh" ? "云模型" : "Cloud model";
  if (model?.readiness === "mock_fallback") return language === "zh" ? "演示模式" : "Demo mode";
  return language === "zh" ? "检查中" : "Checking";
}

export default function HealthPage() {
  const language = useBattleLanguage();
  const { apiFetch } = useProject();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response = await fetch("/api/health", { cache: "no-store" });
      let json = await response.json();
      if (!response.ok || !json.beta?.readiness) {
        const scopedResponse = await apiFetch("/api/health", { cache: "no-store" });
        if (scopedResponse.ok) {
          response = scopedResponse;
          json = await scopedResponse.json();
        }
      }
      if (!response.ok) throw new Error(json.error || "Health check failed");
      setHealth(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const worker = health?.worker;
  const queue = worker?.queue || { queued: 0, running: 0, completed: 0, failed: 0, retryable: 0 };
  const readiness = health?.beta?.readiness;
  const mailbox = health?.beta?.mailbox;
  const workerRecovery = health?.beta?.workerRecovery;
  const realActions = health?.beta?.realActions;
  const model = health?.beta?.model;
  const recentRun = worker?.latest?.recentRun;
  const safeActions = health?.beta?.sideEffectsBlockedByDefault;

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Health Check"
        zhTitle="健康检查"
        meta="Operational readiness / automation status / mailbox sync"
        zhMeta="运行就绪 / 自动任务状态 / 邮箱同步"
        active="/agent-status"
      >
        <Link href="/docs/DEPLOYMENT_READINESS.md" className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600">
          <BattleText en="Readiness guide" zh="就绪指南" />
        </Link>
        <Link href="/user-guide" className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600">
          <BattleText en="User guide" zh="使用指南" />
        </Link>
        <CommandButton type="button" onClick={() => void load()} disabled={loading}>
          {loading ? <BattleText en="Checking" zh="检查中" /> : <BattleText en="Refresh" zh="刷新" />}
        </CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-4">
        {error ? (
          <div className="rounded-md border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-5">
          <StatCell
            label={language === "zh" ? "就绪检查" : "Readiness"}
            value={readiness ? `${readiness.ready}/${readiness.total}` : "-"}
            tone={toneForReadiness(readiness?.status)}
          />
          <StatCell
            label={language === "zh" ? "模型状态" : "Model readiness"}
            value={modelReadinessLabel(model, language)}
            tone={toneForModel(model?.readiness)}
          />
          <StatCell
            label={language === "zh" ? "自动任务状态" : "Automation status"}
            value={taskStatusLabel(worker?.status, language)}
            tone={toneForWorker(worker?.status)}
          />
          <StatCell
            label={language === "zh" ? "邮箱同步" : "Mailbox sync"}
            value={recentRun?.inboxSynced ?? 0}
            tone={toneForReadiness(mailbox?.status)}
          />
          <StatCell
            label={language === "zh" ? "确认控制" : "Confirmation controls"}
            value={safeActions ? (language === "zh" ? "已开启" : "On") : (language === "zh" ? "需复核" : "Review")}
            tone={safeActions ? "emerald" : "red"}
          />
        </div>

        <BattlePanel
          title={language === "zh" ? "模型状态" : "Model readiness"}
          meta={model ? `${model.mode} / ${model.model}` : loading ? "checking" : "unavailable"}
          tone={toneForModel(model?.readiness)}
          action={<BattleBadge tone={toneForModel(model?.readiness)}>{modelReadinessLabel(model, language)}</BattleBadge>}
        >
          <div className="grid gap-3 p-4 md:grid-cols-3">
            <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <BattleText en="Readiness" zh="当前状态" />
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-100">{modelReadinessLabel(model, language)}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {model?.mockFallbackActive
                  ? (language === "zh" ? "当前没有真实模型配置，演示模式不代表真实模型可用。" : "No real model is configured. Demo mode does not mean a real model is ready.")
                  : (language === "zh" ? "当前模型配置会用于真实 AI 任务。" : "The configured model will be used for real AI tasks.")}
              </p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <BattleText en="Model" zh="模型" />
              </p>
              <p className="mt-2 break-all font-mono text-sm text-slate-100">{model?.model || "-"}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {model?.endpointConfigured
                  ? (language === "zh" ? "已配置连接地址。" : "Endpoint is configured.")
                  : (language === "zh" ? "尚未配置连接地址。" : "Endpoint is not configured.")}
              </p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <BattleText en="Next step" zh="下一步" />
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                {model?.readiness === "local_model_ready"
                  ? (language === "zh" ? "本地模型已就绪，可继续投递和归纳测试。" : "Local model is ready. Continue with upload and synthesis tests.")
                  : model?.readiness === "cloud_model_ready"
                    ? (language === "zh" ? "云模型已就绪。请确认 API Key 只保存在本地设置里。" : "Cloud model is ready. Keep the API key in local settings.")
                    : (language === "zh" ? "到设置页配置本地或国内模型，然后测试连接。" : "Configure a local or China model in Settings, then test the connection.")}
              </p>
              <Link
                href="/settings"
                className="mt-3 inline-flex h-8 items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 active:translate-y-px"
              >
                <BattleText en="Open Settings" zh="打开设置" />
              </Link>
            </div>
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "就绪检查" : "Readiness"}
          meta={readiness ? `${readiness.ready}/${readiness.total} ready` : loading ? "checking" : "unavailable"}
          tone={toneForReadiness(readiness?.status)}
          action={<BattleBadge tone={toneForReadiness(readiness?.status)}>{labelForReadiness(readiness?.status, language)}</BattleBadge>}
        >
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {(readiness?.checks || []).map((check) => (
              <div key={check.id} className="min-w-0 rounded-md border border-slate-800 bg-slate-950/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-100">{check.label}</p>
                  <BattleBadge tone={toneForReadiness(check.status)}>{labelForReadiness(check.status, language)}</BattleBadge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{check.detail}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-200">{check.action}</p>
              </div>
            ))}
            {!readiness?.checks?.length ? (
              <p className="text-sm text-slate-400">
                <BattleText en="Readiness checks will appear after the health check returns." zh="健康检查返回后会显示就绪检查项。" />
              </p>
            ) : null}
          </div>
        </BattlePanel>

        <BattlePanel
          title={language === "zh" ? "首次体验路径" : "First-run path"}
          meta={readiness?.firstRunGuide?.length ? `${readiness.firstRunGuide.length}` : loading ? "checking" : "unavailable"}
          tone="blue"
        >
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
            {(readiness?.firstRunGuide || []).map((item, index) => (
              <a
                key={item.id}
                href={item.href}
                className="min-w-0 rounded-md border border-slate-800 bg-slate-950/55 p-3 transition hover:border-blue-500/40 hover:bg-blue-500/10"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{index + 1}</p>
                <p className="mt-2 truncate text-sm font-semibold text-slate-100">{item.label}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{item.detail}</p>
              </a>
            ))}
            {!readiness?.firstRunGuide?.length ? (
              <p className="text-sm text-slate-400">
                <BattleText en="First-run guidance will appear after the health check returns." zh="健康检查返回后会显示首次体验路径。" />
              </p>
            ) : null}
          </div>
        </BattlePanel>

        <div className="grid gap-4 xl:grid-cols-2">
          <BattlePanel
            title={language === "zh" ? "自动任务状态" : "Automation status"}
            meta={dateLabel(worker?.latest?.lastHeartbeatAt || health?.timestamp)}
            tone={toneForWorker(worker?.status)}
            action={<BattleBadge tone={toneForWorker(worker?.status)}>{taskStatusLabel(worker?.status || "checking", language)}</BattleBadge>}
          >
            <div className="space-y-4 p-4">
              <p className="text-sm leading-6 text-slate-300">
                {worker?.status === "ok"
                  ? (language === "zh" ? "自动任务最近已运行，队列可见。" : "Automation checked in recently and the queue is visible.")
                  : worker?.status === "degraded"
                    ? (language === "zh" ? "自动任务可见，但有失败或待重试任务需要处理。" : "Automation is visible, with failed or retryable work to review.")
                    : worker?.status === "stale"
                      ? (language === "zh" ? "自动任务信号可能已过期，需要确认运行状态。" : "The automation signal may be stale and should be checked.")
                      : (language === "zh" ? "暂未看到自动任务信号。" : "No automation signal is visible yet.")}
              </p>
              <div className="grid gap-3 sm:grid-cols-5">
                <StatCell label={language === "zh" ? "待处理" : "Waiting"} value={queue.queued} tone="blue" />
                <StatCell label={language === "zh" ? "运行中" : "Running"} value={queue.running} tone="purple" />
                <StatCell label={language === "zh" ? "完成" : "Done"} value={queue.completed} tone="emerald" />
                <StatCell label={language === "zh" ? "失败" : "Failed"} value={queue.failed} tone={queue.failed ? "red" : "neutral"} />
                <StatCell label={language === "zh" ? "待重试" : "Retry"} value={queue.retryable} tone={queue.retryable ? "amber" : "neutral"} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <BattleText en="Last activity" zh="最后活动" />
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-slate-500">{dateLabel(worker?.activity?.lastActivityAt)}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {worker?.activity?.lastActivitySummary || (language === "zh" ? "尚未记录自动任务业务活动。" : "No automation activity has been recorded yet.")}
                  </p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <BattleText en="Recent run" zh="最近运行" />
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-slate-500">{dateLabel(worker?.activity?.lastRunAt)}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {worker?.activity?.lastRunSummary || (language === "zh" ? "健康检查返回后会显示最近一次运行。" : "Recent run details will appear after the health check returns.")}
                  </p>
                </div>
              </div>
              {worker?.alerts?.length ? (
                <div className="space-y-2">
                  {worker.alerts.map((alert) => (
                    <p key={alert} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{alert}</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-5 text-slate-500">
                  <BattleText en="No active task alert is reported." zh="当前没有任务告警。" />
                </p>
              )}
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "邮箱同步" : "Mailbox sync"}
            meta={mailbox?.recentlySynced ? (language === "zh" ? "最近已同步" : "recent activity") : (language === "zh" ? "等待同步" : "waiting")}
            tone={toneForReadiness(mailbox?.status)}
            action={<BattleBadge tone={toneForReadiness(mailbox?.status)}>{labelForReadiness(mailbox?.status, language)}</BattleBadge>}
          >
            <div className="space-y-4 p-4">
              <p className="text-sm leading-6 text-slate-300">
                {mailbox?.summary || (language === "zh" ? "健康检查返回后会显示邮箱同步状态。" : "Mailbox sync status will appear after the health check returns.")}
              </p>
              <p className="rounded-md border border-slate-800 bg-slate-950/55 px-3 py-2 text-xs leading-5 text-slate-300">
                {mailbox?.nextStep || (language === "zh" ? "连接邮箱并启动自动任务后，新邮件会进入客户时间线。" : "Connect email and start automation so new mail enters customer timelines.")}
              </p>
              <div className="flex flex-wrap gap-2">
                <BattleBadge tone={capabilityTone(mailbox?.configured)}>
                  {mailbox?.configured ? <BattleText en="Mailbox connected" zh="邮箱已连接" /> : <BattleText en="Needs mailbox" zh="待连接邮箱" />}
                </BattleBadge>
                <BattleBadge tone={capabilityTone(mailbox?.autoCapture)}>
                  {mailbox?.autoCapture ? <BattleText en="Auto capture" zh="自动捕获" /> : <BattleText en="Capture paused" zh="捕获未开" />}
                </BattleBadge>
                <BattleBadge tone={capabilityTone(mailbox?.recentlySynced)}>
                  {mailbox?.recentlySynced ? <BattleText en="CRM activity visible" zh="CRM 已有新动态" /> : <BattleText en="No recent mail" zh="暂无最近邮件" />}
                </BattleBadge>
              </div>
            </div>
          </BattlePanel>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <BattlePanel
            title={language === "zh" ? "恢复能力" : "Task recovery"}
            meta={workerRecovery?.reviewed ? (language === "zh" ? "已复核" : "reviewed") : (language === "zh" ? "待准备" : "prepare")}
            tone={toneForReadiness(workerRecovery?.status)}
            action={<BattleBadge tone={toneForReadiness(workerRecovery?.status)}>{labelForReadiness(workerRecovery?.status, language)}</BattleBadge>}
          >
            <div className="space-y-4 p-4">
              <p className="text-sm leading-6 text-slate-300">
                {workerRecovery?.summary || (language === "zh" ? "健康检查返回后会显示自动任务恢复能力。" : "Task recovery status will appear after the health check returns.")}
              </p>
              <p className="rounded-md border border-slate-800 bg-slate-950/55 px-3 py-2 text-xs leading-5 text-slate-300">
                {workerRecovery?.nextStep || (language === "zh" ? "准备恢复方案后，任务进度页会显示启停、重启和健康检查能力。" : "Prepare recovery so Task Progress can show start, stop, restart, and health-check capability.")}
              </p>
              <div className="flex flex-wrap gap-2">
                <BattleBadge tone={capabilityTone(workerRecovery?.capabilities.autoRestart)}>
                  <BattleText en="Auto restart" zh="自动恢复" />
                </BattleBadge>
                <BattleBadge tone={capabilityTone(workerRecovery?.capabilities.startStop)}>
                  <BattleText en="Start and stop" zh="启停能力" />
                </BattleBadge>
                <BattleBadge tone={capabilityTone(workerRecovery?.capabilities.healthCheck)}>
                  <BattleText en="Health check" zh="健康检查" />
                </BattleBadge>
              </div>
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "确认控制" : "Confirmation controls"}
            meta={safeActions ? (language === "zh" ? "默认需确认" : "review by default") : (language === "zh" ? "需要复核" : "review needed")}
            tone={safeActions ? "emerald" : "red"}
            action={<BattleBadge tone={safeActions ? "emerald" : "red"}>{safeActions ? <BattleText en="Authorization on" zh="确认已开启" /> : <BattleText en="Review" zh="复核" />}</BattleBadge>}
          >
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
                <p className="text-xs font-semibold text-slate-100">
                  <BattleText en="Email sending" zh="真实发信" />
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  <BattleText en="Held until explicit confirmation is recorded." zh="默认需确认，只有明确授权后才执行。" />
                </p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
                <p className="text-xs font-semibold text-slate-100">
                  <BattleText en="CRM updates" zh="CRM 写入" />
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  <BattleText en="Each real change needs explicit authorization." zh="每次真实写入都需要明确授权。" />
                </p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/55 p-3">
                <p className="text-xs font-semibold text-slate-100">
                  <BattleText en="Follow-up actions" zh="客户跟进" />
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  <BattleText en="Retries stay controlled and visible in Task Progress." zh="失败重试保持受控，并在任务进度页可见。" />
                </p>
              </div>
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "客户动作确认" : "Customer action confirmation"}
            meta={realActions ? `${realActions.counts.executed} executed` : loading ? "checking" : "unavailable"}
            tone={toneForReadiness(realActions?.status)}
            action={<BattleBadge tone={toneForReadiness(realActions?.status)}>{labelForReadiness(realActions?.status, language)}</BattleBadge>}
          >
            <div className="space-y-4 p-4">
              <p className="text-sm leading-6 text-slate-300">
                {realActions?.summary || (language === "zh" ? "健康检查返回后会显示客户动作确认状态。" : "Customer action confirmation status will appear after the health check returns.")}
              </p>
              <p className="rounded-md border border-slate-800 bg-slate-950/55 px-3 py-2 text-xs leading-5 text-slate-300">
                {realActions?.nextStep || (language === "zh" ? "先完成一次受控确认演练，再邀请外部用户。" : "Run a controlled confirmation test before inviting external users.")}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCell
                  label={language === "zh" ? "待复核" : "Review"}
                  value={realActions?.counts.pendingReview ?? 0}
                  tone={(realActions?.counts.pendingReview || 0) > 0 ? "amber" : "neutral"}
                />
                <StatCell
                  label={language === "zh" ? "已执行" : "Executed"}
                  value={realActions?.counts.executed ?? 0}
                  tone={(realActions?.counts.executed || 0) > 0 ? "emerald" : "neutral"}
                />
                <StatCell
                  label={language === "zh" ? "可重试" : "Retryable"}
                  value={realActions?.counts.retryable ?? 0}
                  tone={(realActions?.counts.retryable || 0) > 0 ? "amber" : "neutral"}
                />
              </div>
            </div>
          </BattlePanel>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}

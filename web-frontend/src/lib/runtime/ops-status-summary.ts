export type OpsStatusLevel = "idle" | "running" | "attention" | "critical" | "unknown";

export interface OpsStatusQueue {
  queued?: number;
  running?: number;
  completed?: number;
  failed?: number;
  retryable?: number;
}

export interface OpsStatusWorker {
  status?: "ok" | "degraded" | "stale" | "down" | string;
  queue?: OpsStatusQueue;
  alerts?: string[];
}

export interface OpsStatusInput {
  worker?: OpsStatusWorker | null;
  actionReviews?: number;
  timestamp?: string;
}

export interface OpsStatusSummary {
  level: OpsStatusLevel;
  badge: string;
  navLabel: string;
  zhNavLabel: string;
  summary: string;
  zhSummary: string;
  detail: string;
  zhDetail: string;
  queued: number;
  running: number;
  failed: number;
  retryable: number;
  actionReviews: number;
  updatedAt?: string;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function plural(countValue: number, one: string, many: string): string {
  return countValue === 1 ? one : many;
}

function baseSummary(input: OpsStatusInput): Omit<OpsStatusSummary, "level" | "badge" | "navLabel" | "zhNavLabel" | "summary" | "zhSummary" | "detail" | "zhDetail"> {
  const queue = input.worker?.queue || {};
  return {
    queued: count(queue.queued),
    running: count(queue.running),
    failed: count(queue.failed),
    retryable: count(queue.retryable),
    actionReviews: count(input.actionReviews),
    updatedAt: input.timestamp,
  };
}

function withNav(summary: Omit<OpsStatusSummary, "navLabel" | "zhNavLabel">): OpsStatusSummary {
  return {
    ...summary,
    navLabel: summary.badge ? `Ops ${summary.badge}` : "Ops",
    zhNavLabel: summary.badge ? `运维 ${summary.badge}` : "运维",
  };
}

export function summarizeOpsStatus(input: OpsStatusInput = {}): OpsStatusSummary {
  const counts = baseSummary(input);
  const workerStatus = input.worker?.status;
  const alerts = Array.isArray(input.worker?.alerts) ? input.worker.alerts.filter(Boolean) : [];
  const activeTasks = counts.queued + counts.running;

  if (!input.worker) {
    return withNav({
      ...counts,
      level: "unknown",
      badge: "",
      summary: "SSA status checking",
      zhSummary: "SSA 状态检查中",
      detail: "Operations status will appear when the health check returns.",
      zhDetail: "健康检查返回后会显示后台运行状态。",
    });
  }

  if (workerStatus === "down") {
    return withNav({
      ...counts,
      level: "critical",
      badge: "!",
      summary: "Worker is offline",
      zhSummary: "后台 Worker 离线",
      detail: "Open Operations to recover the background worker.",
      zhDetail: "打开运维页恢复后台 Worker。",
    });
  }

  if (counts.failed > 0) {
    return withNav({
      ...counts,
      level: "critical",
      badge: "!",
      summary: `${counts.failed} failed ${plural(counts.failed, "task", "tasks")} needs review`,
      zhSummary: `${counts.failed} 项失败任务需要处理`,
      detail: "Open Operations to review failed work and retry safely.",
      zhDetail: "打开运维页复核失败任务并安全重试。",
    });
  }

  if (counts.retryable > 0) {
    return withNav({
      ...counts,
      level: "critical",
      badge: "!",
      summary: `${counts.retryable} retryable ${plural(counts.retryable, "task", "tasks")} needs review`,
      zhSummary: `${counts.retryable} 项可重试任务需要处理`,
      detail: "Open Operations to decide whether the work should run again.",
      zhDetail: "打开运维页判断是否重新执行。",
    });
  }

  if (alerts.length > 0 || workerStatus === "degraded" || workerStatus === "stale") {
    return withNav({
      ...counts,
      level: "attention",
      badge: "!",
      summary: alerts[0] || "Worker health needs review",
      zhSummary: "后台健康状态需复核",
      detail: "Open Operations to inspect the worker health check.",
      zhDetail: "打开运维页查看 Worker 健康检查。",
    });
  }

  if (counts.actionReviews > 0) {
    return withNav({
      ...counts,
      level: "attention",
      badge: String(Math.min(counts.actionReviews, 9)),
      summary: `${counts.actionReviews} ${plural(counts.actionReviews, "action", "actions")} waiting for review`,
      zhSummary: `${counts.actionReviews} 项动作等待审批`,
      detail: "Customer-facing actions stay blocked until an operator reviews them.",
      zhDetail: "客户可见动作会保持拦截，直到人工审批。",
    });
  }

  if (activeTasks > 0) {
    return withNav({
      ...counts,
      level: "running",
      badge: "●",
      summary: `${activeTasks} background ${plural(activeTasks, "task", "tasks")} active`,
      zhSummary: `${activeTasks} 项后台任务运行中`,
      detail: "SSA is working in the background.",
      zhDetail: "SSA 正在后台处理任务。",
    });
  }

  return withNav({
    ...counts,
    level: "idle",
    badge: "",
    summary: "SSA standing by",
    zhSummary: "SSA 待命中",
    detail: "No background task needs attention.",
    zhDetail: "当前没有需要处理的后台任务。",
  });
}

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
    navLabel: summary.badge ? `Task Progress ${summary.badge}` : "Task Progress",
    zhNavLabel: summary.badge ? `任务进度 ${summary.badge}` : "任务进度",
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
      summary: "Task status checking",
      zhSummary: "任务状态检查中",
      detail: "Task progress will appear when the health check returns.",
      zhDetail: "健康检查返回后会显示任务进度。",
    });
  }

  if (workerStatus === "down") {
    return withNav({
      ...counts,
      level: "critical",
      badge: "!",
      summary: "Automation is offline",
      zhSummary: "自动任务离线",
      detail: "Open Task Progress to recover automated work.",
      zhDetail: "打开任务进度页恢复自动任务。",
    });
  }

  if (counts.failed > 0) {
    return withNav({
      ...counts,
      level: "critical",
      badge: "!",
      summary: `${counts.failed} failed ${plural(counts.failed, "task", "tasks")} needs review`,
      zhSummary: `${counts.failed} 项失败任务需要处理`,
      detail: "Open Task Progress to review failed work and retry safely.",
      zhDetail: "打开任务进度页复核失败任务并安全重试。",
    });
  }

  if (counts.retryable > 0) {
    return withNav({
      ...counts,
      level: "critical",
      badge: "!",
      summary: `${counts.retryable} retryable ${plural(counts.retryable, "task", "tasks")} needs review`,
      zhSummary: `${counts.retryable} 项可重试任务需要处理`,
      detail: "Open Task Progress to decide whether the work should run again.",
      zhDetail: "打开任务进度页判断是否重新执行。",
    });
  }

  if (alerts.length > 0 || workerStatus === "degraded" || workerStatus === "stale") {
    return withNav({
      ...counts,
      level: "attention",
      badge: "!",
      summary: alerts[0] || "Automation health needs review",
      zhSummary: "自动任务状态需复核",
      detail: "Open Task Progress to inspect the health check.",
      zhDetail: "打开任务进度页查看健康检查。",
    });
  }

  if (counts.actionReviews > 0) {
    return withNav({
      ...counts,
      level: "attention",
      badge: String(Math.min(counts.actionReviews, 9)),
      summary: `${counts.actionReviews} ${plural(counts.actionReviews, "action", "actions")} waiting for review`,
      zhSummary: `${counts.actionReviews} 项动作待确认`,
      detail: "Customer-facing actions stay blocked until you confirm them.",
      zhDetail: "客户可见动作会保持拦截，直到完成确认。",
    });
  }

  if (activeTasks > 0) {
    return withNav({
      ...counts,
      level: "running",
      badge: "●",
      summary: `${activeTasks} automated ${plural(activeTasks, "task", "tasks")} active`,
      zhSummary: `${activeTasks} 项自动任务运行中`,
      detail: "SSA is processing automated work.",
      zhDetail: "SSA 正在处理自动任务。",
    });
  }

  return withNav({
    ...counts,
    level: "idle",
    badge: "",
    summary: "SSA standing by",
    zhSummary: "SSA 待命中",
    detail: "No automated task needs attention.",
    zhDetail: "当前没有需要处理的自动任务。",
  });
}

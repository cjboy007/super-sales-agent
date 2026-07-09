import fs from "fs";
import path from "path";
import { ensureDir, readJsonFile, sanitizeSsaPathSegment, ssaDataPath } from "../ssa-data-paths";
import type { RuntimeJob } from "./types";
import type { JadenWorkerTickResult } from "./jaden-worker";

export type WorkerRunStatus = "starting" | "running" | "idle" | "degraded" | "stopped" | "failed";
export type WorkerHealthStatus = "ok" | "degraded" | "stale" | "down";

export interface WorkerQueueSnapshot {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  retryable: number;
}

export interface WorkerStatusSnapshot {
  workerId: string;
  workspaceId: string;
  startedAt: string;
  lastHeartbeatAt: string;
  lastActivityAt?: string;
  lastActivitySummary?: string;
  status: WorkerRunStatus;
  queue: WorkerQueueSnapshot;
  alerts: string[];
  lastResult?: JadenWorkerTickResult;
}

export interface WorkerActivitySummary {
  lastRunAt?: string;
  lastActivityAt?: string;
  lastRunSummary: string;
  lastActivitySummary: string;
  hasRecentActivity: boolean;
}

export interface WorkerHealthSummary {
  status: WorkerHealthStatus;
  queue: WorkerQueueSnapshot;
  latest: WorkerStatusSnapshot | null;
  activity: WorkerActivitySummary;
  alerts: string[];
  workers: Array<{
    workerId: string;
    workspaceId: string;
    status: WorkerRunStatus;
    lastHeartbeatAt: string;
  }>;
}

const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;
const ACTIVE_WORKER_STATUSES = new Set<WorkerRunStatus>(["starting", "running", "idle", "degraded", "failed"]);

function workerDir(): string {
  return ssaDataPath("runtime", "workers");
}

function workerStatusPath(workerId: string): string {
  return path.join(workerDir(), `${sanitizeSsaPathSegment(workerId, "worker")}.json`);
}

function emptyQueue(): WorkerQueueSnapshot {
  return {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    retryable: 0,
  };
}

export function summarizeQueue(jobs: RuntimeJob[]): WorkerQueueSnapshot {
  const queue = emptyQueue();
  for (const job of jobs) {
    if (job.status === "queued") queue.queued += 1;
    if (job.status === "running") queue.running += 1;
    if (job.status === "completed") queue.completed += 1;
    if (job.status === "failed") queue.failed += 1;
    if (job.status === "queued" && job.error) queue.retryable += 1;
  }
  return queue;
}

export function alertsForQueue(queue: WorkerQueueSnapshot): string[] {
  const alerts: string[] = [];
  if (queue.failed > 0) alerts.push(`${queue.failed} failed job${queue.failed === 1 ? "" : "s"} needs review`);
  if (queue.retryable > 0) alerts.push(`${queue.retryable} retryable job${queue.retryable === 1 ? "" : "s"} waiting`);
  return alerts;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export function hasWorkerActivity(result: JadenWorkerTickResult | undefined): boolean {
  if (!result) return false;
  return [
    result.inboxSynced,
    result.crmActivities,
    result.orderActivities,
    result.customersUpdated,
    result.lifecycleStatuses,
    result.completed,
    result.failed,
    result.retried,
    result.exhausted,
  ].some((value) => Number(value || 0) > 0);
}

export function summarizeWorkerRun(result: JadenWorkerTickResult | undefined): string {
  if (!result || !hasWorkerActivity(result)) {
    return "Latest run found no new mail, queued tasks, customer updates, order updates, or lifecycle changes.";
  }

  const parts: string[] = [];
  if (result.inboxSynced > 0) parts.push(`Saw ${plural(result.inboxSynced, "mailbox message")}`);
  if (result.crmActivities > 0) parts.push(`wrote ${plural(result.crmActivities, "customer timeline item")}`);
  if (result.orderActivities > 0) parts.push(`wrote ${plural(result.orderActivities, "order milestone")}`);
  if (result.customersUpdated > 0) parts.push(`updated ${plural(result.customersUpdated, "customer record")}`);
  if (result.lifecycleStatuses > 0) parts.push(`recorded ${plural(result.lifecycleStatuses, "lifecycle status change")}`);
  if (result.completed > 0) parts.push(`completed ${plural(result.completed, "queued task")}`);
  if (result.failed > 0) parts.push(`failed ${plural(result.failed, "task")}`);
  if (result.retried > 0) parts.push(`scheduled ${plural(result.retried, "retry", "retries")}`);
  if (result.exhausted > 0) parts.push(`exhausted ${plural(result.exhausted, "task")}`);

  if (parts.length === 1) return `${parts[0][0].toUpperCase()}${parts[0].slice(1)}.`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.`;
}

function activityForStatus(status: WorkerStatusSnapshot | null): WorkerActivitySummary {
  const lastRunSummary = summarizeWorkerRun(status?.lastResult);
  const hasRecentActivity = hasWorkerActivity(status?.lastResult);
  const derivedActivityAt = hasRecentActivity ? status?.lastHeartbeatAt : undefined;
  const derivedActivitySummary = hasRecentActivity ? lastRunSummary : undefined;

  return {
    lastRunAt: status?.lastHeartbeatAt,
    lastActivityAt: status?.lastActivityAt || derivedActivityAt,
    lastRunSummary,
    lastActivitySummary: status?.lastActivitySummary || derivedActivitySummary || "No worker activity has been recorded yet.",
    hasRecentActivity,
  };
}

export function recordWorkerStatus(snapshot: WorkerStatusSnapshot): WorkerStatusSnapshot {
  ensureDir(workerDir());
  const previous = readWorkerStatus(snapshot.workerId);
  const hasActivity = hasWorkerActivity(snapshot.lastResult) && snapshot.status !== "stopped";
  const normalized: WorkerStatusSnapshot = {
    ...snapshot,
    lastActivityAt: hasActivity ? snapshot.lastHeartbeatAt : snapshot.lastActivityAt || previous?.lastActivityAt,
    lastActivitySummary: hasActivity ? summarizeWorkerRun(snapshot.lastResult) : snapshot.lastActivitySummary || previous?.lastActivitySummary,
    queue: { ...emptyQueue(), ...snapshot.queue },
    alerts: Array.from(new Set(snapshot.alerts || [])),
  };
  fs.writeFileSync(workerStatusPath(normalized.workerId), JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

export function readWorkerStatus(workerId?: string): WorkerStatusSnapshot | null {
  if (workerId) return readJsonFile<WorkerStatusSnapshot | null>(workerStatusPath(workerId), null);
  return listWorkerStatuses(1)[0] || null;
}

export function listWorkerStatuses(limit = 20): WorkerStatusSnapshot[] {
  const dir = workerDir();
  if (!fs.existsSync(dir)) return [];
  const statuses: WorkerStatusSnapshot[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const status = readJsonFile<WorkerStatusSnapshot | null>(path.join(dir, entry.name), null);
    if (status?.workerId && status.lastHeartbeatAt) statuses.push(status);
  }
  return statuses
    .sort((a, b) => b.lastHeartbeatAt.localeCompare(a.lastHeartbeatAt))
    .slice(0, Math.min(100, Math.max(1, Math.floor(limit) || 20)));
}

function recentFirst(a: WorkerStatusSnapshot, b: WorkerStatusSnapshot): number {
  return b.lastHeartbeatAt.localeCompare(a.lastHeartbeatAt);
}

function latestWorkerStatus(statuses: WorkerStatusSnapshot[]): WorkerStatusSnapshot | null {
  const sorted = [...statuses].sort(recentFirst);
  return sorted.find((worker) => ACTIVE_WORKER_STATUSES.has(worker.status)) || sorted[0] || null;
}

export function summarizeWorkerHealth(
  statuses: WorkerStatusSnapshot[] = listWorkerStatuses(),
  options: { now?: Date; staleAfterMs?: number } = {}
): WorkerHealthSummary {
  const latest = latestWorkerStatus(statuses);
  const queue = latest?.queue || emptyQueue();
  const alerts = Array.from(new Set([...(latest?.alerts || []), ...alertsForQueue(queue)]));

  let status: WorkerHealthStatus = "ok";
  if (!latest) {
    status = "down";
    alerts.push("No resident worker heartbeat is visible. Start the worker before shared use.");
  } else if (latest.status === "stopped") {
    status = "down";
    alerts.push("Resident worker is stopped. Start the worker before shared use.");
  } else if (queue.failed > 0 || alerts.length > 0 || latest.status === "failed" || latest.status === "degraded") {
    status = "degraded";
  } else {
    const heartbeatAt = new Date(latest.lastHeartbeatAt).getTime();
    const now = options.now || new Date();
    const staleAfterMs = options.staleAfterMs || DEFAULT_STALE_AFTER_MS;
    if (!Number.isFinite(heartbeatAt) || now.getTime() - heartbeatAt > staleAfterMs) {
      status = "stale";
      alerts.push("Worker heartbeat is stale. Check the resident process or recovery setup.");
    }
  }

  return {
    status,
    queue,
    latest,
    activity: activityForStatus(latest),
    alerts: Array.from(new Set(alerts)),
    workers: statuses.slice(0, 10).map((worker) => ({
      workerId: worker.workerId,
      workspaceId: worker.workspaceId,
      status: worker.status,
      lastHeartbeatAt: worker.lastHeartbeatAt,
    })),
  };
}

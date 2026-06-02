import type { RuntimeJob, RuntimeEvent } from "./types";
import { createSalesRuntime, type SalesRuntime } from "./sales-runtime";

export interface JadenWorkerTickOptions {
  runtime?: SalesRuntime;
  workerId?: string;
  maxJobs?: number;
  maxAttempts?: number;
  leaseMs?: number;
  now?: Date;
}

export interface JadenWorkerTickResult {
  workerId: string;
  claimed: number;
  completed: number;
  failed: number;
  retried: number;
  exhausted: number;
  processedJobIds: string[];
}

const DEFAULT_MAX_JOBS = 5;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;

function clampPositive(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value as number)));
}

function defaultWorkerId(): string {
  return `jaden-worker-${process.pid}`;
}

function resultFor(workerId: string): JadenWorkerTickResult {
  return {
    workerId,
    claimed: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    exhausted: 0,
    processedJobIds: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function workflowText(job: RuntimeJob): string {
  return `Jaden worker job ${job.workflow}`;
}

function recordWorkerEvent(
  runtime: SalesRuntime,
  type: string,
  job: RuntimeJob,
  payload: Record<string, unknown>
): RuntimeEvent {
  return runtime.recordEvent(type, job.workspaceId, {
    jobId: job.id,
    workflow: job.workflow,
    attempts: job.attempts || 0,
    ...payload,
  });
}

export async function runJadenWorkerTick(options: JadenWorkerTickOptions = {}): Promise<JadenWorkerTickResult> {
  const runtime = options.runtime || createSalesRuntime();
  const workerId = options.workerId || defaultWorkerId();
  const maxJobs = clampPositive(options.maxJobs, DEFAULT_MAX_JOBS, 50);
  const maxAttempts = clampPositive(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, 10);
  const leaseMs = clampPositive(options.leaseMs, DEFAULT_LEASE_MS, 60 * 60 * 1000);
  const result = resultFor(workerId);

  for (let index = 0; index < maxJobs; index += 1) {
    const claimed = runtime.workflows.claimNext(workerId, {
      leaseMs,
      now: options.now,
    });
    if (!claimed) break;

    result.claimed += 1;
    result.processedJobIds.push(claimed.id);
    recordWorkerEvent(runtime, "jaden.worker.job.claimed", claimed, {
      workerId,
      status: claimed.status,
    });

    try {
      const completed = await runtime.workflows.run(claimed.id);
      if (completed.status === "completed") {
        result.completed += 1;
        recordWorkerEvent(runtime, "jaden.worker.job.completed", completed, {
          workerId,
          status: completed.status,
        });
      } else {
        const message = completed.error || `${workflowText(completed)} did not complete.`;
        throw new Error(message);
      }
    } catch (error) {
      const message = errorMessage(error);
      result.failed += 1;

      if ((claimed.attempts || 0) >= maxAttempts) {
        result.exhausted += 1;
        const failed = runtime.workflows.fail(claimed.id, `Jaden worker exhausted ${maxAttempts} attempts: ${message}`);
        recordWorkerEvent(runtime, "jaden.worker.job.failed", failed, {
          workerId,
          status: failed.status,
          exhausted: true,
          error: failed.error || message,
        });
      } else {
        result.retried += 1;
        const retryable = runtime.workflows.requeue(claimed.id, `Jaden worker retry after failure: ${message}`);
        recordWorkerEvent(runtime, "jaden.worker.job.retry_scheduled", retryable, {
          workerId,
          status: retryable.status,
          error: retryable.error || message,
          nextAttempt: (retryable.attempts || 0) + 1,
        });
      }
    }
  }

  return result;
}

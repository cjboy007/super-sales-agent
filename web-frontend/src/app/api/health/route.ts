import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { getBetaReadiness } from "@/lib/runtime/beta-readiness";
import { createSalesRuntime } from "@/lib/runtime";
import { summarizeMailboxReadiness } from "@/lib/runtime/mailbox-readiness";
import { summarizeRealActionReadiness } from "@/lib/runtime/real-action-readiness";
import { summarizeWorkerHealth } from "@/lib/runtime/worker-health";
import { publicWorkerRecoverySummary, summarizeWorkerSupervisorReadiness } from "@/lib/runtime/worker-supervisor";
import type { WorkerHealthSummary } from "@/lib/runtime/worker-health";
import type { MailboxReadinessSummary } from "@/lib/runtime/mailbox-readiness";
import { getLlmRuntimeStatus } from "@/lib/runtime/llm";

function publicWorkerHealth(worker: WorkerHealthSummary) {
  return {
    status: worker.status,
    activity: worker.activity,
    queue: worker.queue,
    latest: worker.latest
      ? {
        status: worker.latest.status,
        lastHeartbeatAt: worker.latest.lastHeartbeatAt,
        recentRun: worker.latest.lastResult
          ? {
            claimed: worker.latest.lastResult.claimed,
            completed: worker.latest.lastResult.completed,
            failed: worker.latest.lastResult.failed,
            retried: worker.latest.lastResult.retried,
            exhausted: worker.latest.lastResult.exhausted,
            inboxSynced: worker.latest.lastResult.inboxSynced,
            crmActivities: worker.latest.lastResult.crmActivities,
            orderActivities: worker.latest.lastResult.orderActivities,
            customersUpdated: worker.latest.lastResult.customersUpdated,
            lifecycleStatuses: worker.latest.lastResult.lifecycleStatuses,
          }
          : undefined,
      }
      : null,
    alerts: worker.alerts,
  };
}

function publicMailboxReadiness(mailbox: MailboxReadinessSummary) {
  return {
    status: mailbox.status,
    configured: mailbox.configured,
    autoCapture: mailbox.autoCapture,
    recentlySynced: mailbox.recentlySynced,
    summary: mailbox.summary,
    nextStep: mailbox.nextStep,
    requiredActions: mailbox.requiredActions,
  };
}

export async function GET(request: NextRequest) {
  const worker = summarizeWorkerHealth();
  const llm = getLlmRuntimeStatus();
  const model = {
    readiness: llm.readiness,
    mode: llm.mode,
    configured: llm.configured,
    model: llm.model,
    endpointConfigured: Boolean(llm.endpoint),
    mockFallbackActive: llm.readiness === "mock_fallback",
  };
  const beta = {
    authConfigured: false,
    pageAccessProtected: false,
    sideEffectsBlockedByDefault: true,
    model,
  };

  const access = requireResolvedWorkspaceAccess(request);
  if (!access.ok) return access.response;
  const workspaceId = access.workspaceId;
  const workerSupervisor = summarizeWorkerSupervisorReadiness(workspaceId);
  const mailbox = summarizeMailboxReadiness(worker, { workspaceId });
  const runtime = createSalesRuntime();
  const realActions = summarizeRealActionReadiness(runtime, { workspaceId });
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    worker: publicWorkerHealth(worker),
    beta: {
      ...beta,
      mailbox: publicMailboxReadiness(mailbox),
      realActions,
      workerRecovery: publicWorkerRecoverySummary(workerSupervisor),
      readiness: getBetaReadiness({
        runtime,
        worker,
        supervisor: workerSupervisor,
        mailbox,
        realActions,
        pageAccessProtected: beta.pageAccessProtected,
        workspaceId,
      }),
    },
  });
}

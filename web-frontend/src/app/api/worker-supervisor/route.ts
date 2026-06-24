import { NextRequest, NextResponse } from "next/server";
import { requireAdminBetaAuth, requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { prepareWorkerSupervisor, requestWorkerControl } from "@/lib/runtime/worker-supervisor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = requireAdminBetaAuth(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const workspace = requireResolvedWorkspaceAccess(request, body);
  if (!workspace.ok) return workspace.response;
  const workspaceId = workspace.workspaceId;

  try {
    if (body.action === "request-control") {
      const control = requestWorkerControl({
        workspaceId,
        workerId: body.workerId,
        control: body.control,
      });

      return NextResponse.json({
        success: true,
        data: {
          status: control.status,
          workerLabel: control.workerLabel,
          actionLabel: control.actionLabel,
          execution: control.execution,
          requestedAt: control.requestedAt,
          nextStep: control.nextStep,
        },
      });
    }

    const prepared = prepareWorkerSupervisor({
      platform: body.platform,
      workspaceId,
      workerId: body.workerId,
      intervalMs: body.intervalMs,
      maxJobs: body.maxJobs,
      maxAttempts: body.maxAttempts,
    });

    return NextResponse.json({
      success: true,
      data: {
        status: prepared.status,
        workerLabel: prepared.workerLabel,
        recovery: prepared.recovery,
        nextStep: prepared.nextStep,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Task recovery setup failed.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

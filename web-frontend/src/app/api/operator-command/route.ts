import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

interface OperatorCommandBody {
  page?: string;
  message?: string;
  context?: Record<string, unknown>;
  url?: string;
  surface?: string;
  mode?: string;
  target?: Record<string, unknown>;
}

function titleForWorkflow(workflow: unknown): string {
  if (workflow === "email.reply") return "Email follow-up";
  if (workflow === "quotation.prepare") return "Quote or PI preparation";
  if (workflow === "lead.import") return "Customer import";
  if (workflow === "company_intel.run") return "Customer background check";
  if (workflow === "intake.product_doc.process") return "Product document intake";
  if (workflow === "operator.command") return "Operator request";
  if (workflow === "side_effect.request") return "External action approval";
  return "Background task";
}

function publicPlan(plan: unknown) {
  const rawPlan = plan && typeof plan === "object" && !Array.isArray(plan)
    ? plan as { source?: unknown; jobs?: unknown }
    : {};
  const jobs = Array.isArray(rawPlan.jobs) ? rawPlan.jobs : [];
  return {
    source: typeof rawPlan.source === "string" ? rawPlan.source : "local-planner",
    jobs: jobs.map((job) => {
      const rawJob = job && typeof job === "object" && !Array.isArray(job)
        ? job as { workflow?: unknown }
        : {};
      return { title: titleForWorkflow(rawJob.workflow) };
    }),
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as OperatorCommandBody;
  const runtime = createSalesRuntime();
  const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
  if (!auth.ok) return auth.response;
  const workspaceId = auth.workspaceId;

  try {
    const record = await runtime.createStructuredOperatorCommand({
      workspaceId,
      page: body.page,
      message: body.message,
      context: body.context,
      url: body.url,
      surface: body.surface,
      mode: body.mode,
      target: body.target,
    });

    return NextResponse.json({
      success: true,
      data: {
        status: record.status,
        sideEffects: record.sideEffects,
        queuedTasks: record.jobIds?.length || (record.jobId ? 1 : 0),
        commandThreadId: record.commandThreadId,
        envelope: record.envelope ? {
          surface: record.envelope.surface,
          mode: record.envelope.mode,
          target: record.envelope.target,
        } : null,
        validatedPlan: record.validatedPlan ? {
          source: record.validatedPlan.source,
          intent: record.validatedPlan.intent,
          confidence: record.validatedPlan.confidence,
          workflows: record.validatedPlan.validation.acceptedWorkflows,
          rejectedWorkflows: record.validatedPlan.validation.rejectedWorkflows,
          needsHumanReview: record.validatedPlan.needsHumanReview,
          warnings: record.validatedPlan.validation.warnings,
        } : null,
        plan: publicPlan(record.plan),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Message is required" ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

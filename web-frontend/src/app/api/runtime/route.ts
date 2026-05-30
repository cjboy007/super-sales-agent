import { NextRequest, NextResponse } from "next/server";
import {
  filterWorkspaceScoped,
  hasWorkspaceAccess,
  type BetaAuthSession,
  requireBetaAuth,
  requireWorkspaceAccess,
} from "@/lib/runtime/beta-auth";
import { createSalesRuntime, RUNTIME_WORKFLOWS, type RuntimeWorkflowType, type WorkspaceInput } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const WORKFLOWS = new Set<RuntimeWorkflowType>(RUNTIME_WORKFLOWS);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseWorkflow(value: unknown): RuntimeWorkflowType | null {
  if (typeof value !== "string") return null;
  return WORKFLOWS.has(value as RuntimeWorkflowType) ? (value as RuntimeWorkflowType) : null;
}

function parseWorkspaceInput(value: unknown): WorkspaceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<WorkspaceInput>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  return candidate as WorkspaceInput;
}

function scopedRuntimeSnapshot(runtime: ReturnType<typeof createSalesRuntime>, session: BetaAuthSession) {
  const snapshot = runtime.snapshot();
  if (session.workspaces.includes("*")) return snapshot;
  const allowed = new Set(session.workspaces);
  return {
    ...snapshot,
    workspaces: snapshot.workspaces.filter((workspace) => allowed.has(workspace.id)),
    jobs: filterWorkspaceScoped(session, snapshot.jobs),
    sideEffects: filterWorkspaceScoped(session, snapshot.sideEffects),
    events: filterWorkspaceScoped(session, snapshot.events),
  };
}

export async function GET(request: NextRequest) {
  const runtime = createSalesRuntime();
  const auth = requireBetaAuth(request);
  if (!auth.ok) return auth.response;
  const action = request.nextUrl.searchParams.get("action") || "snapshot";

  if (action === "jobs") {
    return NextResponse.json({ success: true, data: filterWorkspaceScoped(auth.session, runtime.workflows.listJobs(50)) });
  }

  if (action === "manifest") {
    return NextResponse.json({ success: true, data: runtime.manifest() });
  }

  if (action === "workspaces") {
    const workspaces = runtime.listWorkspaces();
    const data = auth.session.workspaces.includes("*")
      ? workspaces
      : workspaces.filter((workspace) => auth.session.workspaces.includes(workspace.id));
    return NextResponse.json({ success: true, data });
  }

  if (action === "side-effects") {
    const limit = Math.min(500, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "50")));
    return NextResponse.json({ success: true, data: filterWorkspaceScoped(auth.session, runtime.listSideEffects(limit)) });
  }

  if (action === "packs") {
    return NextResponse.json({ success: true, data: runtime.listPacks() });
  }

  return NextResponse.json({ success: true, data: scopedRuntimeSnapshot(runtime, auth.session) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      workspaceId?: string;
      workflow?: string;
      input?: Record<string, unknown>;
      run?: boolean;
      action?: string;
      workspace?: WorkspaceInput;
    };

    if (body.action === "register-workspace") {
      const workspaceInput = parseWorkspaceInput(body.workspace) || parseWorkspaceInput(body.input);
      if (!workspaceInput) {
        return NextResponse.json(
          { success: false, error: "Workspace id is required" },
          { status: 400 }
        );
      }
      const auth = requireWorkspaceAccess(request, workspaceInput.id);
      if (!auth.ok) return auth.response;

      const runtime = createSalesRuntime();
      const workspace = runtime.registerWorkspace(workspaceInput);
      return NextResponse.json({ success: true, data: workspace });
    }

    if (body.action === "import-leads") {
      const workspaceId = body.workspaceId || request.nextUrl.searchParams.get("project") || "farreach";
      const auth = requireWorkspaceAccess(request, workspaceId);
      if (!auth.ok) return auth.response;
      const input = body.input || {};
      const runtime = createSalesRuntime();
      const result = runtime.importLeads({
        workspaceId,
        fileName: typeof input.fileName === "string" ? input.fileName : undefined,
        csv: typeof input.csv === "string" ? input.csv : undefined,
        json: Array.isArray(input.json) ? input.json as Array<Record<string, unknown>> : undefined,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (body.action === "approve-side-effect" || body.action === "reject-side-effect" || body.action === "retry-side-effect") {
      const auth = requireBetaAuth(request);
      if (!auth.ok) return auth.response;
      const decisionId = typeof body.input?.decisionId === "string" ? body.input.decisionId : "";
      if (!decisionId) {
        return NextResponse.json(
          { success: false, error: "Side effect decision id is required" },
          { status: 400 }
        );
      }
      const runtime = createSalesRuntime();
      const existingDecision = runtime.getSideEffect(decisionId);
      if (!existingDecision) {
        return NextResponse.json(
          { success: false, error: `Side effect decision not found: ${decisionId}` },
          { status: 400 }
        );
      }
      if (!hasWorkspaceAccess(auth.session, existingDecision.workspaceId)) {
        return NextResponse.json(
          { success: false, error: "Workspace access denied" },
          { status: 403 }
        );
      }
      if (body.action === "approve-side-effect") {
        return NextResponse.json({
          success: true,
          data: runtime.approveSideEffect(decisionId, {
            by: typeof body.input?.by === "string" ? body.input.by : undefined,
            note: typeof body.input?.note === "string" ? body.input.note : undefined,
          }),
        });
      }
      if (body.action === "reject-side-effect") {
        return NextResponse.json({
          success: true,
          data: runtime.rejectSideEffect(decisionId, {
            by: typeof body.input?.by === "string" ? body.input.by : undefined,
            note: typeof body.input?.note === "string" ? body.input.note : undefined,
          }),
        });
      }
      return NextResponse.json({ success: true, data: runtime.retrySideEffect(decisionId) });
    }

    const workspaceId = body.workspaceId || request.nextUrl.searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, workspaceId);
    if (!auth.ok) return auth.response;
    const workflow = parseWorkflow(body.workflow);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: "Unsupported or missing workflow" },
        { status: 400 }
      );
    }

    const runtime = createSalesRuntime();
    const job = runtime.workflows.enqueue(workspaceId, workflow, body.input || {});
    const data = body.run ? await runtime.workflows.run(job.id) : job;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: errorMessage(error) },
      { status: 500 }
    );
  }
}

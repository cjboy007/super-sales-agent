import { NextRequest, NextResponse } from "next/server";
import {
  filterWorkspaceScoped,
  hasWorkspaceAccess,
  type BetaAuthSession,
  requireBetaAuth,
  requireResolvedWorkspaceAccess,
  requireWorkspaceAccess,
} from "@/lib/runtime/beta-auth";
import { publicActionView } from "../public-action";
import { createSalesRuntime, RUNTIME_WORKFLOWS, type RuntimeJob, type RuntimeWorkflowType, type WorkspaceInput } from "@/lib/runtime";
import type { RuntimeEvent, SalesPack, SideEffectDecision, SideEffectKind, WorkspaceAdapter } from "@/lib/runtime/types";

export const dynamic = "force-dynamic";

const WORKFLOWS = new Set<RuntimeWorkflowType>(RUNTIME_WORKFLOWS);

function errorMessage(error: unknown): string {
  return cleanFailureReason(error instanceof Error ? error.message : String(error));
}

function errorStatus(error: unknown, fallback = 500): number {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : fallback;
  return Number.isFinite(status) && status >= 400 && status < 600 ? status : fallback;
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

function operationIdForJob(job: RuntimeJob): string {
  return Buffer.from(`${job.workspaceId}:${job.id}`).toString("base64url");
}

function jobIdFromOperationId(operationId: string): string | null {
  try {
    const decoded = Buffer.from(operationId, "base64url").toString("utf-8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) return null;
    return decoded.slice(separator + 1) || null;
  } catch {
    return null;
  }
}

function businessTitleForWorkflow(workflow: RuntimeWorkflowType): string {
  if (workflow === "email.reply") return "Email follow-up";
  if (workflow === "quotation.prepare") return "Quote or PI preparation";
  if (workflow === "lead.import") return "Customer import";
  if (workflow === "company_intel.run") return "Customer background check";
  if (workflow === "follow_up.plan") return "Follow-up planning";
  if (workflow === "intake.product_doc.process") return "Product document intake";
  if (workflow === "operator.command") return "Operator request";
  if (workflow === "side_effect.request") return "External action approval";
  return "Runtime task";
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function customerLabel(input: Record<string, unknown>): string {
  const lead = input.lead && typeof input.lead === "object" && !Array.isArray(input.lead)
    ? input.lead as Record<string, unknown>
    : {};
  return (
    textField(input.customer) ||
    textField(input.companyName) ||
    textField(input.company) ||
    textField(input.account) ||
    textField(lead.companyName) ||
    textField(lead.company) ||
    textField(input.email) ||
    "Unknown customer"
  );
}

function cleanFailureReason(reason: string | undefined): string {
  const raw = textField(reason) || "The operation failed and needs review.";
  return raw
    .replace(/\/Users\/[^\s"'`]+/g, "the local runtime")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "the local runtime")
    .replace(/\bruntime\/ssa-runtime\.db\b/g, "the task queue")
    .replace(/\bprovider\b/gi, "service")
    .replace(/\bSSA_ENABLE_REAL_[A-Z_]+=true\b/g, "explicit enablement")
    .replace(/\bSSA_ENABLE_[A-Z_]+=true\b/g, "explicit enablement")
    .replace(/\bside effects?\b/gi, "external action")
    .replace(/\bPI-[A-Z0-9][A-Z0-9-]*\b/gi, "the PI")
    .replace(/\bQT-[A-Z0-9][A-Z0-9-]*\b/gi, "the quote")
    .replace(/\bRFQ-[A-Z0-9][A-Z0-9-]*\b/gi, "the RFQ")
    .replace(/\bPO-[A-Z0-9][A-Z0-9-]*\b/gi, "the purchase order")
    .slice(0, 260);
}

function failedJobView(job: RuntimeJob) {
  return {
    operationId: operationIdForJob(job),
    title: businessTitleForWorkflow(job.workflow),
    customer: customerLabel(job.input),
    status: job.status,
    attempts: job.attempts || 0,
    canRetry: job.status === "failed",
    lastUpdatedAt: job.updatedAt,
    reason: cleanFailureReason(job.error),
  };
}

function runtimeJobView(job: RuntimeJob) {
  const safetyStep = job.steps.find((step) => step.id === "side-effect-gate");
  const safetyGate = safetyStep?.output
    ? {
      title: titleForSideEffect((textField(safetyStep.output.kind) || "email.send") as SideEffectKind),
      status: textField(safetyStep.output.status) || safetyStep.status,
      realExecutionEnabled: safetyStep.output.realExecutionEnabled === true,
    }
    : undefined;
  return {
    operationId: operationIdForJob(job),
    workspaceId: job.workspaceId,
    title: businessTitleForWorkflow(job.workflow),
    customer: customerLabel(job.input),
    status: job.status,
    attempts: job.attempts || 0,
    canRetry: job.status === "failed",
    requestedAt: job.createdAt,
    updatedAt: job.updatedAt,
    reason: job.error ? cleanFailureReason(job.error) : undefined,
    safetyGate,
  };
}

function workspaceView(workspace: WorkspaceAdapter) {
  return {
    id: workspace.id,
    name: workspace.name,
    brandName: workspace.brandName,
    industry: workspace.industry,
    capabilities: workspace.capabilities,
    packs: workspace.packs,
  };
}

function publicPackAction(workflow: RuntimeWorkflowType): string {
  return businessTitleForWorkflow(workflow);
}

function packView(pack: SalesPack) {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description
      .replace(/\bworkflows\b/gi, "sales processes")
      .replace(/\bworkflow\b/gi, "sales process"),
    actions: pack.workflows.map(publicPackAction),
  };
}

function titleForSideEffect(kind: SideEffectKind): string {
  if (kind === "email.send") return "Customer email send";
  if (kind === "crm.write") return "CRM update";
  if (kind === "imap.fetch") return "Mailbox sync";
  if (kind === "document.generate") return "Document generation";
  if (kind === "document.preview") return "Document preview";
  if (kind === "feishu.notify") return "Team notification";
  if (kind === "payment.write") return "Payment update";
  if (kind === "bank.read") return "Bank data check";
  if (kind === "data.read") return "Data access";
  return "External action";
}

function sideEffectCustomer(decision: SideEffectDecision): string {
  return (
    textField(decision.payload.customerName) ||
    textField(decision.payload.customer) ||
    textField(decision.payload.account) ||
    textField(decision.payload.to) ||
    textField(decision.payload.contactEmail) ||
    "Unknown customer"
  );
}

function sideEffectCanRetry(decision: SideEffectDecision): boolean {
  if (decision.execution?.status === "failed") return decision.execution.canRetry !== false;
  return decision.status === "blocked" || decision.status === "retry_requested" || decision.status === "execution_failed";
}

function sideEffectReviewView(decision: SideEffectDecision) {
  return {
    actionId: decision.id,
    title: titleForSideEffect(decision.kind),
    customer: sideEffectCustomer(decision),
    status: decision.status,
    canRetry: sideEffectCanRetry(decision),
    requestedAt: decision.createdAt,
    updatedAt: decision.updatedAt || decision.execution?.executedAt || decision.execution?.failedAt || decision.createdAt,
    reason: cleanFailureReason(decision.execution?.error || decision.reason),
    execution: decision.execution ? {
      status: decision.execution.status,
      canRetry: decision.execution.status === "failed" ? decision.execution.canRetry !== false : false,
    } : undefined,
  };
}

function crmWriteRequestView(result: {
  decisionId: string;
  kind: "crm.write";
  status: SideEffectDecision["status"];
  reason: string;
  customerName: string;
  subject: string;
}) {
  return {
    decisionId: result.decisionId,
    kind: result.kind,
    status: result.status,
    reason: cleanFailureReason(result.reason),
    customerName: result.customerName,
    subject: result.subject,
  };
}

function titleForRuntimeEvent(event: RuntimeEvent): string {
  if (event.type.includes("inbox") || event.type.includes("email")) return "Mailbox activity";
  if (event.type.includes("lead")) return "Customer import";
  if (event.type.includes("company_intel")) return "Customer background check";
  if (event.type.includes("side_effect")) return "External action review";
  if (event.type.includes("runtime.job")) return "Background work";
  if (event.type.includes("operator.command")) return "Operator request";
  if (event.type.includes("order")) return "Order update";
  if (event.type.includes("config")) return "Settings update";
  return "System activity";
}

function runtimeEventView(event: RuntimeEvent) {
  return {
    activityId: event.id,
    workspaceId: event.workspaceId,
    title: titleForRuntimeEvent(event),
    createdAt: event.createdAt,
  };
}

function publicCapabilityId(id: string): string {
  if (id === "runtime-workflows") return "runtime-operations";
  if (id === "llm-adapters") return "ai-assistance";
  return id;
}

function publicCapabilityLabel(id: string): string {
  if (id === "sales-packs") return "Sales playbooks";
  if (id === "runtime-workflows") return "Background operations";
  if (id === "approval-gates") return "Action approvals";
  if (id === "sales-memory") return "Customer memory";
  if (id === "operator-console") return "Operations console";
  if (id === "llm-adapters") return "AI assistance";
  return id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function cleanCapabilityNotes(notes: string): string {
  return notes
    .replace(/\bworkflows\b/gi, "sales processes")
    .replace(/\bworkflow\b/gi, "sales process")
    .replace(/\bprovider\b/gi, "service")
    .replace(/\bOpenClaw\b/g, "external tools")
    .replace(/\bHermes\b/g, "external memory")
    .replace(/\bSQLite\b/g, "local task store")
    .replace(/\bLLM\b/g, "AI")
    .replace(/\bRuntime jobs\b/g, "Background tasks");
}

function manifestView(runtime: ReturnType<typeof createSalesRuntime>) {
  const manifest = runtime.manifest();
  return {
    id: manifest.id,
    name: manifest.name,
    positioning: "A B2B sales workspace for customer CRM, orders, timelines, approvals, and background operations.",
    productBoundary: {
      standaloneRuntime: manifest.runtimeBoundary.standalone,
      dataProtected: true,
      sideEffectsBlockedByDefault: manifest.runtimeBoundary.sideEffectsBlockedByDefault,
    },
    capabilities: manifest.capabilities.map((capability) => ({
      id: publicCapabilityId(capability.id),
      label: publicCapabilityLabel(capability.id),
      status: capability.status,
      notes: cleanCapabilityNotes(capability.notes),
    })),
    packs: manifest.salesPacks.map(packView),
    operatorSurfaces: [
      "Customer CRM",
      "Inbox",
      "Quotations",
      "Operations",
      "Settings",
    ],
    nextSteps: [
      "Set a beta access pass before inviting external users.",
      "Connect a real mailbox for automatic customer timeline capture.",
    ],
  };
}

function scopedRuntimeSnapshot(runtime: ReturnType<typeof createSalesRuntime>, session: BetaAuthSession) {
  const snapshot = runtime.snapshot();
  const allowed = session.workspaces.includes("*") ? null : new Set(session.workspaces);
  const scopedSideEffects = allowed
    ? snapshot.sideEffects.filter((decision) => allowed.has(decision.workspaceId))
    : snapshot.sideEffects;

  return {
    ...snapshot,
    workspaces: (allowed ? snapshot.workspaces.filter((workspace) => allowed.has(workspace.id)) : snapshot.workspaces).map(workspaceView),
    packs: snapshot.packs.map(packView),
    jobs: filterWorkspaceScoped(session, snapshot.jobs).map(runtimeJobView),
    sideEffects: scopedSideEffects.map(sideEffectReviewView),
    events: filterWorkspaceScoped(session, snapshot.events).map(runtimeEventView),
  };
}

export async function GET(request: NextRequest) {
  const runtime = createSalesRuntime();
  const auth = requireBetaAuth(request);
  if (!auth.ok) return auth.response;
  const action = request.nextUrl.searchParams.get("action") || "snapshot";

  if (action === "jobs") {
    return NextResponse.json({ success: true, data: filterWorkspaceScoped(auth.session, runtime.workflows.listJobs(50)).map(runtimeJobView) });
  }

  if (action === "manifest") {
    return NextResponse.json({ success: true, data: manifestView(runtime) });
  }

  if (action === "workspaces") {
    const workspaces = runtime.listWorkspaces();
    const data = auth.session.workspaces.includes("*")
      ? workspaces
      : auth.session.workspaces
        .filter((workspaceId) => workspaceId !== "*")
        .map((workspaceId) => workspaces.find((workspace) => workspace.id === workspaceId) || runtime.getWorkspace(workspaceId));
    return NextResponse.json({ success: true, data: data.map(workspaceView) });
  }

  if (action === "side-effects") {
    const limit = Math.min(500, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "50")));
    return NextResponse.json({ success: true, data: filterWorkspaceScoped(auth.session, runtime.listSideEffects(limit)).map(sideEffectReviewView) });
  }

  if (action === "failed-jobs") {
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "25")));
    const failedJobs = filterWorkspaceScoped(auth.session, runtime.workflows.listJobs(500))
      .filter((job) => job.status === "failed")
      .slice(0, limit)
      .map(failedJobView);
    return NextResponse.json({ success: true, data: failedJobs });
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
      const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
      if (!auth.ok) return auth.response;
      const workspaceId = auth.workspaceId;
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

    if (body.action === "retry-job") {
      const auth = requireBetaAuth(request);
      if (!auth.ok) return auth.response;
      const operationId = typeof body.input?.operationId === "string" ? body.input.operationId : "";
      const jobId = operationId ? jobIdFromOperationId(operationId) : null;
      if (!jobId) {
        return NextResponse.json(
          { success: false, error: "Operation id is required" },
          { status: 400 }
        );
      }
      const runtime = createSalesRuntime();
      const existingJob = runtime.workflows.getJob(jobId);
      if (!existingJob || existingJob.status !== "failed") {
        return NextResponse.json(
          { success: false, error: "Failed operation not found" },
          { status: 404 }
        );
      }
      if (!hasWorkspaceAccess(auth.session, existingJob.workspaceId)) {
        return NextResponse.json(
          { success: false, error: "Workspace access denied" },
          { status: 403 }
        );
      }
      const retried = runtime.workflows.requeue(existingJob.id, "Retry requested by operations");
      runtime.recordEvent("runtime.job.retry_requested", retried.workspaceId, {
        operationId,
        title: businessTitleForWorkflow(retried.workflow),
        customer: customerLabel(retried.input),
        sideEffects: "local-only",
      });
      return NextResponse.json({ success: true, data: failedJobView(retried) });
    }

    if (body.action === "request-crm-write") {
      const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
      if (!auth.ok) return auth.response;
      const workspaceId = auth.workspaceId;
      const runtime = createSalesRuntime();
      const result = runtime.requestCrmWrite({
        workspaceId,
        ...(body.input || {}),
      });
      return NextResponse.json({
        success: true,
        data: crmWriteRequestView(result),
      });
    }

    if (body.action === "execute-crm-write") {
      const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
      if (!auth.ok) return auth.response;
      const workspaceId = auth.workspaceId;
      const runtime = createSalesRuntime();
      const result = runtime.executeCrmWrite({
        workspaceId,
        ...(body.input || {}),
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
          data: publicActionView(runtime.approveSideEffect(decisionId, {
            by: typeof body.input?.by === "string" ? body.input.by : undefined,
            note: typeof body.input?.note === "string" ? body.input.note : undefined,
          })),
        });
      }
      if (body.action === "reject-side-effect") {
        return NextResponse.json({
          success: true,
          data: publicActionView(runtime.rejectSideEffect(decisionId, {
            by: typeof body.input?.by === "string" ? body.input.by : undefined,
            note: typeof body.input?.note === "string" ? body.input.note : undefined,
          })),
        });
      }
      return NextResponse.json({ success: true, data: publicActionView(runtime.retrySideEffect(decisionId)) });
    }

    const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const workspaceId = auth.workspaceId;
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

    return NextResponse.json({ success: true, data: runtimeJobView(data) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: errorMessage(error) },
      { status: errorStatus(error) }
    );
  }
}

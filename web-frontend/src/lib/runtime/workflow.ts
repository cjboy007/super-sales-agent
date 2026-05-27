import type {
  RuntimeJob,
  RuntimeJobStatus,
  RuntimeWorkflowStep,
  RuntimeWorkflowType,
  SideEffectDecision,
  SideEffectKind,
  WorkspaceId,
} from "./types";
import { createRuntimeTaskQueue, type SqliteTaskQueue } from "./task-queue";

interface WorkflowRuntimeHost {
  runLlm(input: {
    task: "classify" | "extract" | "draft" | "summarize" | "translate" | "recommend";
    input: string;
    workspaceId?: WorkspaceId;
    context?: Record<string, unknown>;
  }): Promise<{ text: string; confidence: number; provider: string; source: string; structured?: Record<string, unknown> }>;
  requestSideEffect(input: {
    kind: SideEffectKind;
    workspaceId: WorkspaceId;
    summary: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): SideEffectDecision;
  recordEvent(type: string, workspaceId: WorkspaceId, payload: Record<string, unknown>): unknown;
}

function nowIso() {
  return new Date().toISOString();
}

function makeJobId(workflow: RuntimeWorkflowType) {
  return `${workflow.replace(/[^a-zA-Z0-9._-]/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeStep(
  id: string,
  kind: RuntimeWorkflowStep["kind"],
  summary: string,
  status: RuntimeJobStatus = "queued"
): RuntimeWorkflowStep {
  return { id, kind, status, summary };
}

function inputText(input: Record<string, unknown>) {
  return [input.subject, input.body, input.message, input.notes, input.customer, input.email]
    .filter((item) => typeof item === "string" && item.trim())
    .join("\n");
}

function sideEffectKindForWorkflow(workflow: RuntimeWorkflowType): SideEffectKind {
  if (workflow === "quotation.prepare") return "document.generate";
  if (workflow === "lead.import") return "crm.write";
  if (workflow === "operator.command") return "feishu.notify";
  return "email.send";
}

export class WorkflowEngine {
  private readonly queue: SqliteTaskQueue;

  constructor(private readonly host: WorkflowRuntimeHost, queue = createRuntimeTaskQueue()) {
    this.queue = queue;
  }

  enqueue(workspaceId: WorkspaceId, workflow: RuntimeWorkflowType, input: Record<string, unknown>): RuntimeJob {
    const createdAt = nowIso();
    const job: RuntimeJob = {
      id: makeJobId(workflow),
      workspaceId,
      workflow,
      status: "queued",
      input,
      steps: [
        makeStep("classify", "llm", "Classify and summarize workflow input"),
        makeStep("side-effect-gate", "side_effect", "Create auditable side-effect request"),
        makeStep("record", "event", "Record workflow completion event"),
      ],
      createdAt,
      updatedAt: createdAt,
    };
    return this.queue.enqueue(job);
  }

  listJobs(limit = 50): RuntimeJob[] {
    return this.queue.list(limit);
  }

  getJob(id: string): RuntimeJob | null {
    return this.queue.get(id);
  }

  claimNext(workerId: string, options?: { leaseMs?: number; now?: Date }): RuntimeJob | null {
    return this.queue.claimNext(workerId, options);
  }

  async run(jobId: string): Promise<RuntimeJob> {
    const existing = this.getJob(jobId);
    if (!existing) throw new Error(`Runtime job not found: ${jobId}`);

    let job = this.queue.save({ ...existing, status: "running" });
    try {
      const text = inputText(job.input);
      const llm = await this.host.runLlm({
        task: "classify",
        workspaceId: job.workspaceId,
        input: text,
        context: { workflow: job.workflow },
      });
      job = this.completeStep(job, "classify", {
        text: llm.text,
        confidence: llm.confidence,
        provider: llm.provider,
        source: llm.source,
        structured: llm.structured || {},
      });

      const sideEffect = this.host.requestSideEffect({
        kind: sideEffectKindForWorkflow(job.workflow),
        workspaceId: job.workspaceId,
        summary: `Workflow ${job.workflow}: ${text.slice(0, 180) || "no text input"}`,
        payload: {
          workflow: job.workflow,
          input: job.input,
          jobId: job.id,
        },
        idempotencyKey: `${job.workspaceId}:${job.workflow}:${job.id}`,
      });
      job = this.completeStep(job, "side-effect-gate", {
        decisionId: sideEffect.id,
        kind: sideEffect.kind,
        status: sideEffect.status,
        reason: sideEffect.reason,
        realExecutionEnabled: sideEffect.realExecutionEnabled,
      });

      this.host.recordEvent("workflow.completed", job.workspaceId, {
        jobId: job.id,
        workflow: job.workflow,
        sideEffectStatus: sideEffect.status,
      });
      job = this.completeStep(job, "record", { event: "workflow.completed" });
      return this.queue.save({ ...job, status: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.queue.save({ ...job, status: "failed", error: message });
    }
  }

  private completeStep(job: RuntimeJob, stepId: string, output: Record<string, unknown>): RuntimeJob {
    const next: RuntimeJob = {
      ...job,
      steps: job.steps.map((step) =>
        step.id === stepId ? { ...step, status: "completed", output } : step
      ),
    };
    return this.queue.save(next);
  }
}

import type {
  RuntimeJob,
  RuntimeJobStatus,
  RuntimeWorkflowStep,
  RuntimeWorkflowType,
  SideEffectDecision,
  SideEffectKind,
  WorkspaceId,
} from "./types";
import type { CompanyIntelLeadInput, CompanyIntelReadModel } from "./company-intel";
import { runProductDocReaderJob } from "./product-doc-reader";
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
  completeCompanyIntel(input: {
    workspaceId: WorkspaceId;
    lead: CompanyIntelLeadInput;
    jobId?: string;
    note?: string;
  }): CompanyIntelReadModel;
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

function companyIntelLeadInput(input: Record<string, unknown>): CompanyIntelLeadInput {
  const rawLead = input.lead;
  const lead = rawLead && typeof rawLead === "object" && !Array.isArray(rawLead)
    ? rawLead as Record<string, unknown>
    : input;
  const text = (value: unknown) => typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  const score = text(lead.score);
  return {
    companyName: text(lead.companyName || lead.company_name || lead.company || lead.account || lead.name),
    country: text(lead.country || lead.market),
    industry: text(lead.industry || lead.vertical),
    contact: text(lead.contact || lead.contact_name || lead.contactName || lead.person),
    position: text(lead.position || lead.title || lead.role),
    email: text(lead.email || lead.email_address || lead.mail),
    homepage: text(lead.homepage || lead.website || lead.url),
    category: text(lead.category || lead.tier || lead.segment),
    reason: text(lead.reason || lead.source || lead.notes || lead.industry),
    confidence: text(lead.confidence || lead.confidence_score || lead.verification_status),
    score: score === "Hot" || score === "Warm" || score === "Cold" ? score : undefined,
  };
}

function sideEffectKindForWorkflow(workflow: RuntimeWorkflowType): SideEffectKind {
  if (workflow === "quotation.prepare") return "document.generate";
  if (workflow === "lead.import") return "crm.write";
  if (workflow === "company_intel.run") return "data.read";
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
    const steps = workflow === "company_intel.run"
      ? [
        makeStep("normalize", "memory", "Normalize lead for company-intel"),
        makeStep("dossier", "memory", "Write company-intel dossier"),
        makeStep("record", "event", "Record workflow completion event"),
      ]
      : workflow === "intake.product_doc.process"
        ? [
          makeStep("extract-product-doc", "memory", "Run local product-doc-reader and write intake analysis"),
          makeStep("record", "event", "Record product document processing completion"),
        ]
      : [
        makeStep("classify", "llm", "Classify and summarize workflow input"),
        makeStep("side-effect-gate", "side_effect", "Create auditable side-effect request"),
        makeStep("record", "event", "Record workflow completion event"),
      ];
    const job: RuntimeJob = {
      id: makeJobId(workflow),
      workspaceId,
      workflow,
      status: "queued",
      input,
      steps,
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

  complete(id: string, output: Record<string, unknown> = {}): RuntimeJob {
    return this.queue.complete(id, output);
  }

  fail(id: string, error: string): RuntimeJob {
    return this.queue.fail(id, error);
  }

  requeue(id: string, error?: string): RuntimeJob {
    return this.queue.requeue(id, error);
  }

  async run(jobId: string): Promise<RuntimeJob> {
    const existing = this.getJob(jobId);
    if (!existing) throw new Error(`Runtime job not found: ${jobId}`);

    let job = this.queue.save({ ...existing, status: "running" });
    try {
      if (job.workflow === "company_intel.run") {
        return this.runCompanyIntelJob(job);
      }
      if (job.workflow === "intake.product_doc.process") {
        return await this.runProductDocReaderWorkflow(job);
      }

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
      return this.queue.complete(job.id, job.output || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (job.workflow === "intake.product_doc.process") {
        this.host.recordEvent("intake.file.processing_failed", job.workspaceId, {
          jobId: job.id,
          workflow: job.workflow,
          intakeId: job.input.intakeId,
          uploadId: job.input.uploadId,
          error: message,
          sideEffects: "local-only",
        });
      }
      return this.queue.fail(job.id, message);
    }
  }

  private runCompanyIntelJob(job: RuntimeJob): RuntimeJob {
    const lead = companyIntelLeadInput(job.input);
    job = this.completeStep(job, "normalize", {
      companyName: lead.companyName || "",
      email: lead.email || "",
      homepage: lead.homepage || "",
      skill: "company-intel",
    });

    const dossier = this.host.completeCompanyIntel({
      workspaceId: job.workspaceId,
      lead,
      jobId: job.id,
      note: "Generated by company-intel runtime workflow after lead entered the pool.",
    });
    job = this.completeStep(job, "dossier", {
      status: dossier.status,
      clientSlug: dossier.clientSlug,
      paths: dossier.paths,
      rating: dossier.dossier?.rating,
      leadScore: dossier.dossier?.lead_score,
    });

    this.host.recordEvent("workflow.completed", job.workspaceId, {
      jobId: job.id,
      workflow: job.workflow,
      sideEffectStatus: "local-only",
    });
    job = this.completeStep(job, "record", { event: "workflow.completed" });
    return this.queue.complete(job.id, {
      clientSlug: dossier.clientSlug,
      paths: dossier.paths,
      status: dossier.status,
    });
  }

  private async runProductDocReaderWorkflow(job: RuntimeJob): Promise<RuntimeJob> {
    const intakeId = String(job.input.intakeId || "");
    const uploadId = String(job.input.uploadId || "");
    const summary = await runProductDocReaderJob({
      project: job.workspaceId,
      intakeId,
      uploadId,
      uploadPath: typeof job.input.uploadPath === "string" ? job.input.uploadPath : undefined,
    });

    job = this.completeStep(job, "extract-product-doc", {
      drawingNo: summary.drawingNo,
      modelNo: summary.modelNo,
      confidence: summary.confidence,
      needsReview: summary.needsReview,
      sideEffects: "local-only",
    });
    this.host.recordEvent("intake.file.processing_completed", job.workspaceId, {
      jobId: job.id,
      workflow: job.workflow,
      intakeId,
      uploadId,
      status: summary.needsReview ? "needs_review" : "completed",
      confidence: summary.confidence,
      drawingNo: summary.drawingNo,
      sideEffects: "local-only",
    });
    this.host.recordEvent("memory.index.updated", job.workspaceId, {
      sourceKind: "product_doc",
      sourceId: `${intakeId}:${uploadId}`,
      intakeId,
      uploadId,
      title: summary.drawingNo || summary.productName || "product document",
    });
    job = this.completeStep(job, "record", { event: "intake.file.processing_completed" });
    return this.queue.complete(job.id, {
      intakeId,
      uploadId,
      drawingNo: summary.drawingNo,
      modelNo: summary.modelNo,
      confidence: summary.confidence,
      needsReview: summary.needsReview,
    });
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

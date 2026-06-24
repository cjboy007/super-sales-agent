import fs from "fs";
import path from "path";
import type { AgentEvent } from "../events";
import { publishAndRemember } from "../events";
import { ensureSsaCompanyDataPath } from "../ssa-data-paths";
import { createJadenPlan, createStructuredJadenPlan, type JadenPlan } from "./jaden-planner";
import { getJadenSurfaceProfile, writeJadenCommandThread, type JadenCommandMode, type JadenCommandSurface } from "./jaden-command";
import type { LlmRequest, LlmResult, MemoryRecord, MemoryWriteInput, OperatorCommandInput, OperatorCommandRecord, RuntimeWorkflowType, WorkspaceAdapter, WorkspaceId } from "./types";

interface OperatorCommandRuntime {
  getWorkspace(id?: WorkspaceId | null): WorkspaceAdapter;
  writeMemory(input: MemoryWriteInput): MemoryRecord | unknown;
  recordEvent(type: string, workspaceId: WorkspaceId, payload: Record<string, unknown>): unknown;
  workflows: {
    enqueue(workspaceId: WorkspaceId, workflow: RuntimeWorkflowType, input: Record<string, unknown>): { id: string; workflow: RuntimeWorkflowType };
  };
  runLlm?(request: LlmRequest): Promise<LlmResult>;
}

function nowIso() {
  return new Date().toISOString();
}

function makeCommandId() {
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, 4000) : fallback;
}

function sanitizeContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 12000) {
    return {
      truncated: true,
      preview: serialized.slice(0, 12000),
    };
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function plannerSurface(value: unknown): JadenCommandSurface | undefined {
  const sanitized = sanitizeText(value);
  return sanitized ? getJadenSurfaceProfile(sanitized).surface : undefined;
}

function plannerMode(surface: JadenCommandSurface | undefined, value: unknown): JadenCommandMode | undefined {
  const sanitized = sanitizeText(value);
  if (!surface && !sanitized) return undefined;
  return getJadenSurfaceProfile(surface || "unknown", sanitized || undefined).mode;
}

function writeCommand(record: OperatorCommandRecord): string {
  const filePath = ensureSsaCompanyDataPath(record.workspaceId, "operator-commands", `${record.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
  return filePath;
}

function publishOperatorCommand(record: OperatorCommandRecord, filePath: string): AgentEvent {
  return publishAndRemember({
    type: "operator-command",
    data: {
      id: record.id,
      project: record.project,
      workspaceId: record.workspaceId,
      page: record.page,
      message: record.message,
      status: record.status,
      sideEffects: record.sideEffects,
      jobId: record.jobId,
      jobIds: record.jobIds || (record.jobId ? [record.jobId] : []),
      file: path.basename(filePath),
    },
  });
}

function writeValidatedMemory(
  runtime: OperatorCommandRuntime,
  record: OperatorCommandRecord,
  plan: JadenPlan,
  threadId: string
): MemoryRecord[] {
  return plan.validatedPlan.memoryWrites.flatMap((item, index) => {
    try {
      const written = runtime.writeMemory({
        workspaceId: record.workspaceId,
        kind: item.kind || "fact",
        customerId: item.customerId,
        customerName: item.customerName,
        title: item.title,
        body: item.body,
        tags: ["jaden-memory", "validated-plan", plan.envelope.surface, plan.envelope.mode],
        source: {
          type: "operator",
          id: record.id,
        },
        authority: "suggested",
        confidence: item.confidence ?? plan.validatedPlan.confidence,
        metadata: {
          commandId: record.id,
          commandThreadId: threadId,
          surface: plan.envelope.surface,
          mode: plan.envelope.mode,
          target: plan.envelope.target,
          memoryPolicy: plan.envelope.memoryPolicy,
          plannerIntent: plan.validatedPlan.intent,
          plannerSource: plan.validatedPlan.source,
        },
        idempotencyKey: `${record.workspaceId}:jaden-memory:${record.id}:${index}`,
      }) as MemoryRecord;
      return written?.id ? [written] : [];
    } catch {
      return [];
    }
  });
}

export function createOperatorCommand(
  runtime: OperatorCommandRuntime,
  input: OperatorCommandInput
): OperatorCommandRecord {
  const message = sanitizeText(input.message).trim();
  if (!message) throw new Error("Message is required");

  const workspace = runtime.getWorkspace(sanitizeText(input.workspaceId, "farreach") || "farreach");
  const record: OperatorCommandRecord = {
    id: makeCommandId(),
    workspaceId: workspace.id,
    project: workspace.id,
    page: sanitizeText(input.page, "unknown") || "unknown",
    url: sanitizeText(input.url, ""),
    message,
    context: sanitizeContext(input.context),
    status: "queued_for_local_runtime",
    sideEffects: "blocked",
    createdAt: nowIso(),
  };

  const surface = plannerSurface(input.surface);
  const plannerInput = {
    workspaceId: workspace.id,
    commandId: record.id,
    page: record.page,
    url: record.url,
    message: record.message,
    context: record.context,
    surface,
    mode: plannerMode(surface, input.mode),
    target: input.target && typeof input.target === "object" && !Array.isArray(input.target)
      ? input.target as Record<string, unknown>
      : undefined,
  };
  const plan = createJadenPlan(plannerInput);

  return persistOperatorCommand(runtime, record, plan);
}

function persistOperatorCommand(
  runtime: OperatorCommandRuntime,
  record: OperatorCommandRecord,
  plan: JadenPlan
): OperatorCommandRecord {
  const jobs = plan.jobs.map((planned) => runtime.workflows.enqueue(planned.workspaceId, planned.workflow, planned.input));
  const jobIds = jobs.map((job) => job.id);
  const thread = writeJadenCommandThread({
    workspaceId: record.workspaceId,
    commandId: record.id,
    envelope: plan.envelope,
    plan: plan.validatedPlan,
    queuedJobs: jobs.map((job) => ({ id: job.id, workflow: job.workflow })),
    createdAt: record.createdAt,
  });

  const recordWithJob = {
    ...record,
    commandThreadId: thread.id,
    envelope: plan.envelope,
    validatedPlan: plan.validatedPlan,
    jobId: jobIds[0],
    jobIds,
    plan: {
      source: plan.source,
      jobs: jobs.map((job) => ({ id: job.id, workflow: job.workflow })),
    },
  };

  const filePath = writeCommand(recordWithJob);
  const liveEvent = publishOperatorCommand(recordWithJob, filePath);
  const durableMemory = writeValidatedMemory(runtime, recordWithJob, plan, thread.id);

  runtime.recordEvent("operator.command.queued", record.workspaceId, {
    commandId: record.id,
    jobId: recordWithJob.jobId,
    jobIds,
    planSource: plan.source,
    workflows: jobs.map((job) => job.workflow),
    commandThreadId: thread.id,
    surface: plan.envelope.surface,
    mode: plan.envelope.mode,
    target: plan.envelope.target,
    validatedPlan: {
      intent: plan.validatedPlan.intent,
      confidence: plan.validatedPlan.confidence,
      acceptedWorkflows: plan.validatedPlan.validation.acceptedWorkflows,
      rejectedWorkflows: plan.validatedPlan.validation.rejectedWorkflows,
      acceptedTools: plan.validatedPlan.validation.acceptedTools,
      rejectedTools: plan.validatedPlan.validation.rejectedTools,
      warnings: plan.validatedPlan.validation.warnings,
      needsHumanReview: plan.validatedPlan.needsHumanReview,
    },
    page: recordWithJob.page,
    url: recordWithJob.url,
    status: recordWithJob.status,
    sideEffects: recordWithJob.sideEffects,
    liveEventId: liveEvent.id,
    file: path.basename(filePath),
  });
  if (durableMemory.length > 0) {
    runtime.recordEvent("jaden.memory.written", record.workspaceId, {
      commandId: record.id,
      commandThreadId: thread.id,
      memoryIds: durableMemory.map((item) => item.id),
      count: durableMemory.length,
    });
  }

  return recordWithJob;
}

export async function createStructuredOperatorCommand(
  runtime: OperatorCommandRuntime,
  input: OperatorCommandInput
): Promise<OperatorCommandRecord> {
  if (!runtime.runLlm) return createOperatorCommand(runtime, input);

  const message = sanitizeText(input.message).trim();
  if (!message) throw new Error("Message is required");

  const workspace = runtime.getWorkspace(sanitizeText(input.workspaceId, "farreach") || "farreach");
  const record: OperatorCommandRecord = {
    id: makeCommandId(),
    workspaceId: workspace.id,
    project: workspace.id,
    page: sanitizeText(input.page, "unknown") || "unknown",
    url: sanitizeText(input.url, ""),
    message,
    context: sanitizeContext(input.context),
    status: "queued_for_local_runtime",
    sideEffects: "blocked",
    createdAt: nowIso(),
  };
  const surface = plannerSurface(input.surface);
  const plannerInput = {
    workspaceId: workspace.id,
    commandId: record.id,
    page: record.page,
    url: record.url,
    message: record.message,
    context: record.context,
    surface,
    mode: plannerMode(surface, input.mode),
    target: input.target && typeof input.target === "object" && !Array.isArray(input.target)
      ? input.target as Record<string, unknown>
      : undefined,
  };
  const plan = await createStructuredJadenPlan(plannerInput, {
    runLlm: runtime.runLlm.bind(runtime),
  });

  return persistOperatorCommand(runtime, record, plan);
}

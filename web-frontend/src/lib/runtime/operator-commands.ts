import fs from "fs";
import path from "path";
import type { AgentEvent } from "../events";
import { publishAndRemember } from "../events";
import { ensureSsaCompanyDataPath } from "../ssa-data-paths";
import { createJadenPlan } from "./jaden-planner";
import type { OperatorCommandInput, OperatorCommandRecord, RuntimeWorkflowType, WorkspaceId } from "./types";

interface OperatorCommandRuntime {
  getWorkspace(id?: WorkspaceId | null): { id: WorkspaceId };
  workflows: {
    enqueue(workspaceId: WorkspaceId, workflow: RuntimeWorkflowType, input: Record<string, unknown>): { id: string; workflow: RuntimeWorkflowType };
  };
  recordEvent(type: string, workspaceId: WorkspaceId, payload: Record<string, unknown>): unknown;
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

  const plan = createJadenPlan({
    workspaceId: workspace.id,
    commandId: record.id,
    page: record.page,
    url: record.url,
    message: record.message,
    context: record.context,
  });
  const jobs = plan.jobs.map((planned) => runtime.workflows.enqueue(planned.workspaceId, planned.workflow, planned.input));
  const jobIds = jobs.map((job) => job.id);

  const recordWithJob = {
    ...record,
    jobId: jobIds[0],
    jobIds,
    plan: {
      source: plan.source,
      jobs: jobs.map((job) => ({ id: job.id, workflow: job.workflow })),
    },
  };

  const filePath = writeCommand(recordWithJob);
  const liveEvent = publishOperatorCommand(recordWithJob, filePath);

  runtime.recordEvent("operator.command.queued", workspace.id, {
    commandId: record.id,
    jobId: recordWithJob.jobId,
    jobIds,
    planSource: plan.source,
    workflows: jobs.map((job) => job.workflow),
    page: recordWithJob.page,
    url: recordWithJob.url,
    status: recordWithJob.status,
    sideEffects: recordWithJob.sideEffects,
    liveEventId: liveEvent.id,
    file: path.basename(filePath),
  });

  return recordWithJob;
}

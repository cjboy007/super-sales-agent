import crypto from "crypto";
import fs from "fs";
import {
  listProspectingRuns,
  runProspectingDryRun,
  type ProspectingDryRunInput,
  type ProspectingSeedInput,
} from "./prospecting-loop";
import {
  listPersonalizedSalesDraftRuns,
  runProductQuotationDraft,
} from "./product-quotation-drafts";
import {
  listOutboundApprovalRuns,
  requestOutboundApproval,
  type OutboundApprovalActionType,
} from "./outbound-approval-pipeline";
import { listDecisionLearningRecords } from "./decision-learning";
import type { SideEffectDecision, SideEffectKind, WorkspaceId } from "./types";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";

export type GrowthSchedulerStepKind =
  | "dry_run_prospecting"
  | "quotation_draft_preparation"
  | "outbound_approval_preparation"
  | "decision_memory_review_summary";

export interface GrowthSchedulerStep {
  id: string;
  workspaceId: WorkspaceId;
  kind: GrowthSchedulerStepKind;
  status: "completed" | "skipped" | "failed";
  summary: string;
  sourceId?: string;
  outputId?: string;
  retryable: boolean;
  dryRun: true;
  draftOnly: true;
  notExecuted: true;
  noOutboundSent: true;
}

export interface GrowthSchedulerFailedWork {
  id: string;
  workspaceId: WorkspaceId;
  stepKind: GrowthSchedulerStepKind;
  reason: string;
  retryCount: number;
  retryable: boolean;
  lastError: string;
  nextRetryAt: string;
  createdAt: string;
  updatedAt: string;
  notExecuted: true;
  noOutboundSent: true;
}

export interface GrowthMetrics {
  workspaceId: WorkspaceId;
  candidateCount: number;
  evidenceCoverage: {
    packetsWithEvidence: number;
    totalPackets: number;
    coverageRate: number;
  };
  icpDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  humanEditRate: number;
  decisionRates: {
    approveOnce: number;
    editThenApprove: number;
    reject: number;
    updatePolicy: number;
    total: number;
  };
  replyRatePlaceholder: {
    status: "placeholder";
    rate: null;
    reason: string;
  };
  failureReasons: string[];
  misjudgmentReasonsPlaceholder: string[];
  retryableFailedWorkCount: number;
  noOutboundSent: true;
  notExecuted: true;
  autopilotReady: false;
}

export interface GrowthSchedulerRun {
  id: string;
  workspaceId: WorkspaceId;
  status: "completed" | "retryable";
  mode: "dry-run";
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  dryRun: true;
  draftOnly: true;
  notExecuted: true;
  noOutboundSent: true;
  autopilotReady: false;
  sideEffectGateStillRequired: true;
  realOutboundPilotStarted: false;
  steps: GrowthSchedulerStep[];
  failedWork: GrowthSchedulerFailedWork[];
  metricsSnapshot: Omit<GrowthMetrics, "workspaceId" | "noOutboundSent" | "notExecuted" | "autopilotReady">;
}

export interface GrowthSchedulerTickInput {
  workspaceId: WorkspaceId;
  idempotencyKey?: string;
  seeds?: ProspectingSeedInput[];
  intendedActionType?: OutboundApprovalActionType;
}

type RuntimeForGrowthScheduler = {
  getSalesWorldModel?: (workspaceId: WorkspaceId) => ReturnType<Required<Parameters<typeof runProspectingDryRun>[0]>["getSalesWorldModel"]>;
  requestSideEffect(request: {
    kind: SideEffectKind;
    workspaceId: WorkspaceId;
    summary: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): SideEffectDecision;
};

const STORE_LIMIT = 100;

function storePath(workspaceId: WorkspaceId): string {
  return ensureSsaCompanyDataPath(workspaceId, "growth", "scheduler-runs.json");
}

export function listGrowthSchedulerRuns(workspaceId: WorkspaceId, limit = 20): GrowthSchedulerRun[] {
  return readJsonFile<GrowthSchedulerRun[]>(storePath(workspaceId), [])
    .filter((run) => run.workspaceId === workspaceId && run.dryRun === true && run.noOutboundSent === true)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, limit));
}

export function runGrowthSchedulerTick(
  runtime: RuntimeForGrowthScheduler,
  input: GrowthSchedulerTickInput
): GrowthSchedulerRun {
  const workspaceId = cleanText(input.workspaceId, "demo-exporter");
  const idempotencyKey = makeRunIdempotencyKey(workspaceId, input);
  const existing = listGrowthSchedulerRuns(workspaceId, STORE_LIMIT)
    .find((run) => run.idempotencyKey === idempotencyKey);
  if (existing) return existing;

  const now = new Date().toISOString();
  const steps: GrowthSchedulerStep[] = [];
  const failedWork: GrowthSchedulerFailedWork[] = [];
  let prospectingRunId = "";
  let draftRunId = "";

  try {
    const prospectingRun = runProspectingDryRun(runtime, {
      workspaceId,
      idempotencyKey: `${idempotencyKey}:prospecting`,
      seeds: input.seeds,
      limit: 4,
    });
    prospectingRunId = prospectingRun.id;
    steps.push(step({
      workspaceId,
      kind: "dry_run_prospecting",
      summary: `Prepared ${prospectingRun.packets.length} dry-run prospecting packet(s).`,
      outputId: prospectingRun.id,
    }));
  } catch (error) {
    steps.push(failedStep(workspaceId, "dry_run_prospecting", "Prospecting dry-run could not be prepared."));
    failedWork.push(failedWorkItem(workspaceId, "dry_run_prospecting", error, now));
  }

  try {
    const draftRun = runProductQuotationDraft(runtime, {
      workspaceId,
      prospectingRunId: prospectingRunId || undefined,
      idempotencyKey: `${idempotencyKey}:quotation-draft`,
      limit: 4,
    });
    draftRunId = draftRun.id;
    steps.push(step({
      workspaceId,
      kind: "quotation_draft_preparation",
      sourceId: prospectingRunId,
      outputId: draftRun.id,
      summary: `Prepared ${draftRun.drafts.length} draft-only quotation draft(s).`,
    }));
  } catch (error) {
    steps.push(failedStep(workspaceId, "quotation_draft_preparation", "Quotation draft preparation could not be completed."));
    failedWork.push(failedWorkItem(workspaceId, "quotation_draft_preparation", error, now));
  }

  try {
    const approvalRun = requestOutboundApproval(runtime, {
      workspaceId,
      sourceDraftRunId: draftRunId || undefined,
      intendedActionType: input.intendedActionType || "email_send",
      idempotencyKey: `${idempotencyKey}:outbound-approval`,
    });
    steps.push(step({
      workspaceId,
      kind: "outbound_approval_preparation",
      sourceId: draftRunId,
      outputId: approvalRun.id,
      summary: `Prepared ${approvalRun.candidates.length} side-effect review request(s); not executed.`,
    }));
  } catch (error) {
    steps.push(failedStep(workspaceId, "outbound_approval_preparation", "Outbound approval preparation could not be completed."));
    failedWork.push(failedWorkItem(workspaceId, "outbound_approval_preparation", error, now));
  }

  const decisionRecords = listDecisionLearningRecords(workspaceId, 200);
  steps.push(step({
    workspaceId,
    kind: "decision_memory_review_summary",
    summary: `Summarized ${decisionRecords.length} decision memory record(s); no policy auto-approval.`,
    outputId: decisionRecords[0]?.id,
  }));

  const metrics = computeGrowthMetrics(workspaceId, failedWork);
  const run: GrowthSchedulerRun = {
    id: `growth-scheduler-run-${hashStable(idempotencyKey).slice(0, 14)}`,
    workspaceId,
    status: failedWork.length > 0 ? "retryable" : "completed",
    mode: "dry-run",
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
    dryRun: true,
    draftOnly: true,
    notExecuted: true,
    noOutboundSent: true,
    autopilotReady: false,
    sideEffectGateStillRequired: true,
    realOutboundPilotStarted: false,
    steps,
    failedWork,
    metricsSnapshot: {
      candidateCount: metrics.candidateCount,
      evidenceCoverage: metrics.evidenceCoverage,
      icpDistribution: metrics.icpDistribution,
      humanEditRate: metrics.humanEditRate,
      decisionRates: metrics.decisionRates,
      replyRatePlaceholder: metrics.replyRatePlaceholder,
      failureReasons: metrics.failureReasons,
      misjudgmentReasonsPlaceholder: metrics.misjudgmentReasonsPlaceholder,
      retryableFailedWorkCount: metrics.retryableFailedWorkCount,
    },
  };

  writeRun(workspaceId, run);
  return run;
}

export function computeGrowthMetrics(
  workspaceId: WorkspaceId,
  transientFailedWork: GrowthSchedulerFailedWork[] = []
): GrowthMetrics {
  const prospectingRuns = listProspectingRuns(workspaceId, 200);
  const packets = prospectingRuns.flatMap((run) => run.packets || []);
  const draftRuns = listPersonalizedSalesDraftRuns(workspaceId, 200);
  const drafts = draftRuns.flatMap((run) => run.drafts || []);
  const decisions = listDecisionLearningRecords(workspaceId, 200);
  const schedulerFailures = listGrowthSchedulerRuns(workspaceId, 200).flatMap((run) => run.failedWork || []);
  const failedWork = [...transientFailedWork, ...schedulerFailures];
  const withEvidence = packets.filter((packet) =>
    (packet.evidence || []).some((evidence) => evidence.kind !== "insufficient_evidence")
  ).length;
  const icpDistribution = {
    low: packets.filter((packet) => packet.icpScore?.band === "low").length,
    medium: packets.filter((packet) => packet.icpScore?.band === "medium").length,
    high: packets.filter((packet) => packet.icpScore?.band === "high").length,
  };
  const humanEditDrafts = drafts.filter((draft) => (draft.recommendedHumanEdits || []).length > 0).length;
  const decisionCounts = {
    approveOnce: decisions.filter((record) => record.decision === "approve_once").length,
    editThenApprove: decisions.filter((record) => record.decision === "edit_then_approve").length,
    reject: decisions.filter((record) => record.decision === "reject").length,
    updatePolicy: decisions.filter((record) => record.decision === "update_policy").length,
  };
  const decisionTotal = Object.values(decisionCounts).reduce((sum, value) => sum + value, 0);

  return {
    workspaceId,
    candidateCount: packets.length,
    evidenceCoverage: {
      packetsWithEvidence: withEvidence,
      totalPackets: packets.length,
      coverageRate: ratio(withEvidence, packets.length),
    },
    icpDistribution,
    humanEditRate: ratio(humanEditDrafts, Math.max(1, drafts.length)),
    decisionRates: {
      approveOnce: ratio(decisionCounts.approveOnce, decisionTotal),
      editThenApprove: ratio(decisionCounts.editThenApprove, decisionTotal),
      reject: ratio(decisionCounts.reject, decisionTotal),
      updatePolicy: ratio(decisionCounts.updatePolicy, decisionTotal),
      total: decisionTotal,
    },
    replyRatePlaceholder: {
      status: "placeholder",
      rate: null,
      reason: "No real outbound or mailbox assumption in Phase 12.",
    },
    failureReasons: unique(failedWork.map((item) => item.reason)),
    misjudgmentReasonsPlaceholder: ["Misjudgment Reasons placeholder: requires reviewed outcomes after a real pilot."],
    retryableFailedWorkCount: failedWork.filter((item) => item.retryable).length,
    noOutboundSent: true,
    notExecuted: true,
    autopilotReady: false,
  };
}

function writeRun(workspaceId: WorkspaceId, run: GrowthSchedulerRun) {
  const existing = listGrowthSchedulerRuns(workspaceId, STORE_LIMIT)
    .filter((item) => item.idempotencyKey !== run.idempotencyKey);
  fs.writeFileSync(storePath(workspaceId), JSON.stringify([run, ...existing].slice(0, STORE_LIMIT), null, 2), "utf-8");
}

function step(input: {
  workspaceId: WorkspaceId;
  kind: GrowthSchedulerStepKind;
  summary: string;
  sourceId?: string;
  outputId?: string;
}): GrowthSchedulerStep {
  return {
    id: `growth-scheduler-step-${hashStable(`${input.workspaceId}:${input.kind}:${input.outputId || input.summary}`).slice(0, 12)}`,
    workspaceId: input.workspaceId,
    kind: input.kind,
    status: "completed",
    summary: input.summary,
    sourceId: input.sourceId,
    outputId: input.outputId,
    retryable: false,
    dryRun: true,
    draftOnly: true,
    notExecuted: true,
    noOutboundSent: true,
  };
}

function failedStep(workspaceId: WorkspaceId, kind: GrowthSchedulerStepKind, summary: string): GrowthSchedulerStep {
  return {
    id: `growth-scheduler-step-${hashStable(`${workspaceId}:${kind}:failed:${summary}`).slice(0, 12)}`,
    workspaceId,
    kind,
    status: "failed",
    summary,
    retryable: true,
    dryRun: true,
    draftOnly: true,
    notExecuted: true,
    noOutboundSent: true,
  };
}

function failedWorkItem(
  workspaceId: WorkspaceId,
  stepKind: GrowthSchedulerStepKind,
  error: unknown,
  now: string
): GrowthSchedulerFailedWork {
  const reason = error instanceof Error ? error.message : "Unknown scheduler failure.";
  return {
    id: `growth-scheduler-failed-${hashStable(`${workspaceId}:${stepKind}:${reason}:${now}`).slice(0, 14)}`,
    workspaceId,
    stepKind,
    reason,
    retryCount: 0,
    retryable: true,
    lastError: reason,
    nextRetryAt: new Date(Date.parse(now) + 15 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now,
    notExecuted: true,
    noOutboundSent: true,
  };
}

function makeRunIdempotencyKey(workspaceId: WorkspaceId, input: GrowthSchedulerTickInput): string {
  const explicit = cleanText(input.idempotencyKey);
  if (explicit) return explicit;
  const seedSignature = JSON.stringify(input.seeds || []);
  return `${workspaceId}:growth-scheduler:${hashStable(seedSignature || "workspace")}`;
}

function ratio(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 1000;
}

function unique(values: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    output.push(cleaned);
  }
  return output;
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hashStable(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

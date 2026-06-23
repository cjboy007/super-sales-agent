import crypto from "crypto";
import fs from "fs";
import {
  listOutboundApprovalRuns,
  type OutboundApprovalCandidate,
  type OutboundApprovalRun,
} from "./outbound-approval-pipeline";
import type { HitlRiskLevel } from "./hitl-policy";
import type { SideEffectKind, WorkspaceId } from "./types";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";

export type DecisionLearningDecision =
  | "approve_once"
  | "edit_then_approve"
  | "reject"
  | "update_policy";

export type DecisionLearningActionKind =
  | "email.send"
  | "crm.write"
  | "quotation.generate"
  | "pi.generate"
  | "price.discount"
  | "payment.bank"
  | SideEffectKind;

export interface DecisionLearningRecord {
  id: string;
  workspaceId: WorkspaceId;
  approvalRunId: string;
  candidateId: string;
  sideEffectDecisionId: string;
  actionKind: DecisionLearningActionKind;
  decision: DecisionLearningDecision;
  humanEdits: string;
  rejectionReason: string;
  policySuggestion: string;
  scope: string;
  rollbackNote: string;
  createdAt: string;
  operator: string;
  confidence: number;
  risk: HitlRiskLevel;
  idempotencyKey: string;
  autoApproval: false;
  autoEnforced: false;
  policySuggestionOnly: boolean;
  sideEffectGateStillRequired: true;
  highRiskStillReview: true;
  highRiskGuardrail: true;
  readOnlyUntilReviewed: true;
  autopilotReady: false;
  noPolicyAutoApproval: true;
}

export interface DecisionLearningInput {
  workspaceId: WorkspaceId;
  approvalRunId: string;
  candidateId: string;
  decision: DecisionLearningDecision;
  humanEdits?: string;
  rejectionReason?: string;
  policySuggestion?: string;
  scope?: string;
  rollbackNote?: string;
  operator?: string;
  confidence?: number;
  idempotencyKey?: string;
}

const STORE_LIMIT = 200;
const DECISIONS: DecisionLearningDecision[] = [
  "approve_once",
  "edit_then_approve",
  "reject",
  "update_policy",
];

function storePath(workspaceId: WorkspaceId): string {
  return ensureSsaCompanyDataPath(workspaceId, "growth", "decision-learning-records.json");
}

export function isDecisionLearningDecision(value: unknown): value is DecisionLearningDecision {
  return typeof value === "string" && DECISIONS.includes(value as DecisionLearningDecision);
}

export function listDecisionLearningRecords(workspaceId: WorkspaceId, limit = 20): DecisionLearningRecord[] {
  return readJsonFile<DecisionLearningRecord[]>(storePath(workspaceId), [])
    .filter((record) => record.workspaceId === workspaceId && record.noPolicyAutoApproval === true)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, limit));
}

export function recordDecisionLearning(input: DecisionLearningInput): DecisionLearningRecord {
  const workspaceId = cleanText(input.workspaceId, "demo-exporter");
  if (!isDecisionLearningDecision(input.decision)) {
    throw new Error("Unsupported decision learning action.");
  }

  const selected = selectCandidate(workspaceId, input.approvalRunId, input.candidateId);
  if (!selected) throw new Error("Phase 10 approval candidate was not found in this workspace.");

  const idempotencyKey = makeIdempotencyKey(workspaceId, input, selected.run, selected.candidate);
  const existing = listDecisionLearningRecords(workspaceId, STORE_LIMIT)
    .find((record) => record.idempotencyKey === idempotencyKey);
  if (existing) return existing;

  const actionKind = actionKindFor(selected.run, selected.candidate);
  const record: DecisionLearningRecord = {
    id: `decision-learning-record-${hashStable(idempotencyKey).slice(0, 14)}`,
    workspaceId,
    approvalRunId: selected.run.id,
    candidateId: selected.candidate.id,
    sideEffectDecisionId: selected.candidate.sideEffectDecisionId,
    actionKind,
    decision: input.decision,
    humanEdits: cleanText(input.humanEdits),
    rejectionReason: cleanText(input.rejectionReason),
    policySuggestion: cleanText(input.policySuggestion),
    scope: cleanText(input.scope, "candidate"),
    rollbackNote: cleanText(input.rollbackNote, "Remove this decision memory record; no side-effect execution state was changed."),
    createdAt: new Date().toISOString(),
    operator: cleanText(input.operator, "local-operator"),
    confidence: confidenceFor(input.confidence, selected.candidate),
    risk: riskFor(actionKind),
    idempotencyKey,
    autoApproval: false,
    autoEnforced: false,
    policySuggestionOnly: input.decision === "update_policy",
    sideEffectGateStillRequired: true,
    highRiskStillReview: true,
    highRiskGuardrail: true,
    readOnlyUntilReviewed: true,
    autopilotReady: false,
    noPolicyAutoApproval: true,
  };

  writeRecord(workspaceId, record);
  return record;
}

function writeRecord(workspaceId: WorkspaceId, record: DecisionLearningRecord) {
  const existing = listDecisionLearningRecords(workspaceId, STORE_LIMIT)
    .filter((item) => item.idempotencyKey !== record.idempotencyKey);
  fs.writeFileSync(storePath(workspaceId), JSON.stringify([record, ...existing].slice(0, STORE_LIMIT), null, 2), "utf-8");
}

function selectCandidate(
  workspaceId: WorkspaceId,
  approvalRunId: string,
  candidateId: string
): { run: OutboundApprovalRun; candidate: OutboundApprovalCandidate } | null {
  const runs = listOutboundApprovalRuns(workspaceId, STORE_LIMIT);
  const run = runs.find((item) => item.id === approvalRunId);
  if (!run) return null;
  const candidate = run.candidates.find((item) => item.id === candidateId && item.workspaceId === workspaceId);
  if (!candidate) return null;
  return { run, candidate };
}

function actionKindFor(run: OutboundApprovalRun, candidate: OutboundApprovalCandidate): DecisionLearningActionKind {
  if (run.intendedActionType === "quotation_generate") return "quotation.generate";
  if (run.intendedActionType === "pi_generate") return "pi.generate";
  if (run.intendedActionType === "price_adjustment") return "price.discount";
  if (candidate.sideEffectKind === "payment.write" || candidate.sideEffectKind === "bank.read") return "payment.bank";
  return candidate.sideEffectKind;
}

function riskFor(actionKind: DecisionLearningActionKind): HitlRiskLevel {
  if (actionKind === "payment.bank") return "critical";
  if (
    actionKind === "email.send" ||
    actionKind === "crm.write" ||
    actionKind === "quotation.generate" ||
    actionKind === "pi.generate" ||
    actionKind === "price.discount"
  ) {
    return "high";
  }
  return "medium";
}

function confidenceFor(value: unknown, candidate: OutboundApprovalCandidate): number {
  const numeric = typeof value === "number" ? value : candidate.sourceDraftMetadata.confidence;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function makeIdempotencyKey(
  workspaceId: WorkspaceId,
  input: DecisionLearningInput,
  run: OutboundApprovalRun,
  candidate: OutboundApprovalCandidate
): string {
  const explicit = cleanText(input.idempotencyKey);
  if (explicit) return explicit;
  return [
    workspaceId,
    "decision-learning",
    run.id,
    candidate.id,
    input.decision,
  ].join(":");
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hashStable(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

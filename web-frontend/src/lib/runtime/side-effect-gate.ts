import fs from "fs";
import type { SideEffectDecision, SideEffectKind, SideEffectRequest } from "./types";
import { ensureSsaDataPath, readJsonFile } from "../ssa-data-paths";

const SIDE_EFFECT_FLAGS: Record<SideEffectKind, string> = {
  "email.send": "SSA_ENABLE_REAL_EMAIL_SEND",
  "crm.write": "SSA_ENABLE_REAL_CRM_WRITE",
  "data.read": "SSA_ENABLE_REAL_DATA_READ",
  "imap.fetch": "SSA_ENABLE_REAL_IMAP",
  "feishu.notify": "SSA_ENABLE_REAL_FEISHU",
  "payment.write": "SSA_ENABLE_REAL_PAYMENT",
  "bank.read": "SSA_ENABLE_REAL_BANK",
  "document.generate": "SSA_ENABLE_REAL_DOCUMENT_GENERATION",
  "document.preview": "SSA_ENABLE_REAL_DOCUMENT_PREVIEW",
};

function decisionPath() {
  return ensureSsaDataPath("runtime", "side-effect-decisions.json");
}

function makeDecisionId(kind: SideEffectKind) {
  return `${kind.replace(".", "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRealExecutionEnabled(kind: SideEffectKind) {
  const flag = SIDE_EFFECT_FLAGS[kind];
  return process.env[flag] === "true";
}

function readDecisions(): SideEffectDecision[] {
  return readJsonFile<SideEffectDecision[]>(decisionPath(), []);
}

function writeDecisions(decisions: SideEffectDecision[]) {
  fs.writeFileSync(decisionPath(), JSON.stringify(decisions, null, 2), "utf-8");
}

export function requestSideEffect(request: SideEffectRequest): SideEffectDecision {
  const realExecutionEnabled = isRealExecutionEnabled(request.kind);
  const decision: SideEffectDecision = {
    id: makeDecisionId(request.kind),
    kind: request.kind,
    workspaceId: request.workspaceId,
    status: realExecutionEnabled ? "allowed" : "blocked",
    reason: realExecutionEnabled
      ? `Real execution enabled by ${SIDE_EFFECT_FLAGS[request.kind]}.`
      : `Real execution blocked by default. Set ${SIDE_EFFECT_FLAGS[request.kind]}=true to allow this side effect.`,
    realExecutionEnabled,
    createdAt: new Date().toISOString(),
    payload: {
      summary: request.summary,
      idempotencyKey: request.idempotencyKey || null,
      ...request.payload,
    },
  };

  const decisions = readDecisions();
  decisions.unshift(decision);
  writeDecisions(decisions.slice(0, 500));
  return decision;
}

export function listSideEffectDecisions(limit = 50): SideEffectDecision[] {
  return readDecisions().slice(0, limit);
}

export function getSideEffectDecision(id: string): SideEffectDecision | null {
  return readDecisions().find((decision) => decision.id === id) || null;
}

function updateDecision(id: string, updater: (decision: SideEffectDecision) => SideEffectDecision): SideEffectDecision {
  const decisions = readDecisions();
  const index = decisions.findIndex((decision) => decision.id === id);
  if (index < 0) throw new Error(`Side effect decision not found: ${id}`);
  const updated = updater(decisions[index]);
  decisions[index] = updated;
  writeDecisions(decisions);
  return updated;
}

export function approveSideEffectDecision(id: string, input: { by?: string; note?: string } = {}): SideEffectDecision {
  return updateDecision(id, (decision) => ({
    ...decision,
    status: "approved",
    updatedAt: new Date().toISOString(),
    approvedBy: input.by || "local-operator",
    approvalNote: input.note || "",
    reason: "Approved by local operator. Real execution still requires the explicit environment flag for this side effect.",
  }));
}

export function rejectSideEffectDecision(id: string, input: { by?: string; note?: string } = {}): SideEffectDecision {
  return updateDecision(id, (decision) => ({
    ...decision,
    status: "rejected",
    updatedAt: new Date().toISOString(),
    rejectedBy: input.by || "local-operator",
    rejectionNote: input.note || "",
    reason: input.note || "Rejected by local operator.",
  }));
}

export function retrySideEffectDecision(id: string): SideEffectDecision {
  const existing = getSideEffectDecision(id);
  if (!existing) throw new Error(`Side effect decision not found: ${id}`);

  const retry = requestSideEffect({
    kind: existing.kind,
    workspaceId: existing.workspaceId,
    summary: String(existing.payload.summary || `Retry ${existing.kind}`),
    payload: {
      ...existing.payload,
      retryOf: existing.id,
    },
    idempotencyKey: String(existing.payload.idempotencyKey || `${existing.id}:retry`),
  });

  const retried = {
    ...retry,
    status: "retry_requested" as const,
    retryOf: existing.id,
    retryCount: (existing.retryCount || 0) + 1,
    updatedAt: new Date().toISOString(),
    reason: retry.realExecutionEnabled
      ? "Retry requested and real execution flag is enabled; caller must still execute through an adapter."
      : retry.reason,
  };

  const decisions = readDecisions();
  const index = decisions.findIndex((decision) => decision.id === retry.id);
  if (index >= 0) decisions[index] = retried;
  else decisions.unshift(retried);
  writeDecisions(decisions.slice(0, 500));
  return retried;
}

import fs from "fs";
import type { SideEffectDecision, SideEffectKind, SideEffectRequest } from "./types";
import { ensureSsaCompanyDataPath, readJsonFile, ssaDataPath } from "../ssa-data-paths";
import { listWorkspaceAdapters } from "./workspaces";
import { enforceSalesToolForSideEffect, getSalesTool } from "./sales-tool-registry";

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
  "price.discount": "SSA_ENABLE_REAL_PRICE_DISCOUNT",
};

function decisionPath(workspaceId: string) {
  return ensureSsaCompanyDataPath(workspaceId, "approvals", "side-effect-decisions.json");
}

function makeDecisionId(kind: SideEffectKind) {
  return `${kind.replace(".", "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRealExecutionEnabled(kind: SideEffectKind) {
  const flag = SIDE_EFFECT_FLAGS[kind];
  return process.env[flag] === "true";
}

function readDecisions(workspaceId: string): SideEffectDecision[] {
  return readJsonFile<SideEffectDecision[]>(decisionPath(workspaceId), []);
}

function writeDecisions(workspaceId: string, decisions: SideEffectDecision[]) {
  fs.writeFileSync(decisionPath(workspaceId), JSON.stringify(decisions, null, 2), "utf-8");
}

function discoverDecisionWorkspaces(): string[] {
  const ids = new Set<string>(listWorkspaceAdapters().map((workspace) => workspace.id));
  const companiesDir = ssaDataPath("companies");
  try {
    if (fs.existsSync(companiesDir)) {
      for (const entry of fs.readdirSync(companiesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) ids.add(entry.name);
      }
    }
  } catch {
    // Missing or unreadable company folders are treated as empty.
  }
  return Array.from(ids);
}

function readAllDecisions(): SideEffectDecision[] {
  return discoverDecisionWorkspaces()
    .flatMap((workspaceId) => readDecisions(workspaceId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function registryEnforcementForRequest(request: SideEffectRequest) {
  if (!request.toolId) {
    throw new Error(`Sales tool registry enforcement required before requesting ${request.kind}.`);
  }
  return enforceSalesToolForSideEffect({
    toolId: request.toolId,
    sideEffectKind: request.kind,
    workspaceId: request.workspaceId,
    input: {
      ...(request.payload || {}),
      ...(request.toolInput || {}),
      workspaceId: request.workspaceId,
    },
    idempotencyKey: request.idempotencyKey,
  });
}

function assertDecisionRegistryEnforced(decision: SideEffectDecision) {
  if (!decision.tool || decision.payload.registryEnforced !== true || decision.payload.toolId !== decision.tool.toolId) {
    throw new Error(`Sales tool registry enforcement required before recording ${decision.kind} execution.`);
  }
  const tool = getSalesTool(decision.tool.toolId);
  if (!tool || tool.sideEffectKind !== decision.kind) {
    throw new Error(`Sales tool registry enforcement required before recording ${decision.kind} execution.`);
  }
  if (!tool.approvalRequired || tool.approvalRequirement !== "operator_approval_required") {
    throw new Error(`Sales tool registry rejected ${tool.id}: high-risk side-effect tools require operator approval.`);
  }
  if (decision.tool.approvalRequired !== true || decision.tool.approvalRequirement !== "operator_approval_required") {
    throw new Error(`Sales tool registry enforcement required before recording ${decision.kind} execution.`);
  }
  if (typeof decision.payload.idempotencyKey !== "string" || !decision.payload.idempotencyKey.trim()) {
    throw new Error(`Sales tool registry enforcement required before recording ${decision.kind} execution.`);
  }
}

export function requestSideEffect(request: SideEffectRequest): SideEffectDecision {
  const enforcement = registryEnforcementForRequest(request);
  const idempotencyKey = request.idempotencyKey || "";
  if (idempotencyKey) {
    const existing = readDecisions(request.workspaceId).find((decision) =>
      decision.kind === request.kind &&
      decision.payload.idempotencyKey === idempotencyKey
    );
    if (existing) return existing;
  }

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
    tool: enforcement.audit,
    payload: {
      summary: request.summary,
      idempotencyKey: idempotencyKey || null,
      registryEnforced: true,
      toolId: enforcement.tool.id,
      toolName: enforcement.tool.name,
      toolRequiredPermissions: enforcement.tool.requiredPermissions,
      toolApprovalRequirement: enforcement.tool.approvalRequirement,
      toolIdempotencyStrategy: enforcement.tool.idempotencyStrategy,
      toolFailureRetryBehavior: enforcement.tool.failureRetryBehavior,
      ...request.payload,
    },
  };

  const decisions = readDecisions(request.workspaceId);
  decisions.unshift(decision);
  writeDecisions(request.workspaceId, decisions.slice(0, 500));
  return decision;
}

export function listSideEffectDecisions(limit = 50): SideEffectDecision[] {
  return readAllDecisions().slice(0, limit);
}

export function getSideEffectDecision(id: string): SideEffectDecision | null {
  return readAllDecisions().find((decision) => decision.id === id) || null;
}

function updateDecision(id: string, updater: (decision: SideEffectDecision) => SideEffectDecision): SideEffectDecision {
  const existing = getSideEffectDecision(id);
  if (!existing) throw new Error(`Side effect decision not found: ${id}`);
  const decisions = readDecisions(existing.workspaceId);
  const index = decisions.findIndex((decision) => decision.id === id);
  if (index < 0) throw new Error(`Side effect decision not found: ${id}`);
  const updated = updater(decisions[index]);
  decisions[index] = updated;
  writeDecisions(existing.workspaceId, decisions);
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
  assertDecisionRegistryEnforced(existing);
  const retryCount = (existing.retryCount || 0) + 1;
  const originalIdempotencyKey = typeof existing.payload.idempotencyKey === "string"
    ? existing.payload.idempotencyKey
    : "";

  const retry = requestSideEffect({
    kind: existing.kind,
    workspaceId: existing.workspaceId,
    summary: String(existing.payload.summary || `Retry ${existing.kind}`),
    payload: {
      ...existing.payload,
      retryOf: existing.id,
      originalIdempotencyKey: originalIdempotencyKey || null,
    },
    idempotencyKey: `${existing.workspaceId}:${existing.kind}:${existing.id}:retry:${retryCount}`,
    toolId: existing.tool?.toolId,
  });

  const retried = {
    ...retry,
    status: "retry_requested" as const,
    retryOf: existing.id,
    retryCount,
    updatedAt: new Date().toISOString(),
    reason: retry.realExecutionEnabled
      ? "Retry requested and real execution flag is enabled; caller must still execute through an adapter."
      : retry.reason,
  };

  const decisions = readDecisions(retried.workspaceId);
  const index = decisions.findIndex((decision) => decision.id === retry.id);
  if (index >= 0) decisions[index] = retried;
  else decisions.unshift(retried);
  writeDecisions(retried.workspaceId, decisions.slice(0, 500));
  return retried;
}

export function recordSideEffectExecutionSuccess(
  id: string,
  input: { result?: Record<string, unknown> } = {}
): SideEffectDecision {
  const existing = getSideEffectDecision(id);
  if (!existing) throw new Error(`Side effect decision not found: ${id}`);
  assertDecisionRegistryEnforced(existing);
  return updateDecision(id, (decision) => ({
    ...decision,
    status: "executed",
    updatedAt: new Date().toISOString(),
    reason: "Execution completed through an approved adapter.",
    execution: {
      status: "executed",
      executedAt: new Date().toISOString(),
      result: input.result || {},
    },
  }));
}

export function recordSideEffectExecutionFailure(
  id: string,
  input: { error: string; canRetry?: boolean }
): SideEffectDecision {
  const existing = getSideEffectDecision(id);
  if (!existing) throw new Error(`Side effect decision not found: ${id}`);
  assertDecisionRegistryEnforced(existing);
  return updateDecision(id, (decision) => ({
    ...decision,
    status: "execution_failed",
    updatedAt: new Date().toISOString(),
    reason: input.error,
    execution: {
      status: "failed",
      failedAt: new Date().toISOString(),
      error: input.error,
      canRetry: input.canRetry !== false,
    },
  }));
}

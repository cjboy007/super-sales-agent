import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision, SideEffectKind } from "./types";

export type RealActionReadinessStatus = "ready" | "needs_setup" | "needs_review";

export interface RealActionReadinessSummary {
  status: RealActionReadinessStatus;
  blockedByDefault: boolean;
  counts: {
    requested: number;
    pendingReview: number;
    approved: number;
    executed: number;
    failed: number;
    retryable: number;
  };
  summary: string;
  nextStep: string;
}

export interface RealActionReadinessOptions {
  limit?: number;
  workspaceId?: string;
}

const REAL_ACTION_FLAGS: Record<SideEffectKind, string> = {
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

function realActionsBlockedByDefault(): boolean {
  return Object.values(REAL_ACTION_FLAGS).every((flag) => process.env[flag] !== "true");
}

function decisionIsRetryable(decision: SideEffectDecision): boolean {
  if (decision.status === "retry_requested") return true;
  if (decision.execution?.status === "failed") return decision.execution.canRetry !== false;
  return decision.status === "blocked" || decision.status === "execution_failed";
}

function statusForCounts(counts: RealActionReadinessSummary["counts"]): RealActionReadinessStatus {
  if (counts.failed > 0 || counts.retryable > 0 || counts.pendingReview > 0) return "needs_review";
  if (counts.executed > 0) return "ready";
  return "needs_setup";
}

function summaryForStatus(
  status: RealActionReadinessStatus,
  counts: RealActionReadinessSummary["counts"]
): Pick<RealActionReadinessSummary, "summary" | "nextStep"> {
  if (status === "ready") {
    return {
      summary: "Real external actions have a completed approval and execution record.",
      nextStep: "Keep real actions disabled by default and continue reviewing each requested customer action.",
    };
  }
  if (status === "needs_review") {
    return {
      summary: `${counts.pendingReview + counts.failed + counts.retryable} external action item(s) are waiting for operator review.`,
      nextStep: counts.failed > 0
        ? "Review failed external actions in Operations, then retry only after approval and explicit enablement are confirmed."
        : "Review pending external actions in Operations before inviting beta users.",
    };
  }
  return {
    summary: "No completed approval and execution record is visible for real external actions yet.",
    nextStep: "Run one controlled approval test for email or CRM, then confirm the execution result is recorded.",
  };
}

function normalizeOptions(input: number | RealActionReadinessOptions): Required<RealActionReadinessOptions> {
  if (typeof input === "number") return { limit: input, workspaceId: "" };
  return {
    limit: input.limit ?? 200,
    workspaceId: input.workspaceId || "",
  };
}

export function summarizeRealActionReadiness(
  runtime: SalesRuntime,
  input: number | RealActionReadinessOptions = 200
): RealActionReadinessSummary {
  const options = normalizeOptions(input);
  const decisions = runtime.listSideEffects(options.limit)
    .filter((decision) => !options.workspaceId || decision.workspaceId === options.workspaceId);
  const counts = decisions.reduce<RealActionReadinessSummary["counts"]>((next, decision) => {
    next.requested += 1;
    if (decision.status === "blocked" || decision.status === "retry_requested") next.pendingReview += 1;
    if (decision.status === "approved" || (decision.status === "execution_failed" && Boolean(decision.approvedBy))) next.approved += 1;
    if (decision.status === "executed" || decision.execution?.status === "executed") next.executed += 1;
    if (decision.status === "execution_failed" || decision.execution?.status === "failed") next.failed += 1;
    if (decisionIsRetryable(decision)) next.retryable += 1;
    return next;
  }, {
    requested: 0,
    pendingReview: 0,
    approved: 0,
    executed: 0,
    failed: 0,
    retryable: 0,
  });
  const status = statusForCounts(counts);
  return {
    status,
    blockedByDefault: realActionsBlockedByDefault(),
    counts,
    ...summaryForStatus(status, counts),
  };
}

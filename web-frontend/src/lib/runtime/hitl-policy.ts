import type { SideEffectDecision, SideEffectKind, WorkspaceId } from "./types";

export type AutomationMode = "observe" | "assist" | "autopilot" | "locked";

export type HitlPolicyDecision = "auto" | "review" | "blocked";

export type HitlActionKind =
  | "lead.discovery"
  | "prospect.enrichment"
  | "customer.scoring"
  | "email.draft"
  | "landing_page.draft"
  | "video_script.draft"
  | "outbound.sequence.request"
  | "email.send"
  | "crm.write"
  | "quotation.generate"
  | "pi.generate"
  | "price.discount"
  | "payment.bank";

export type HitlRiskLevel = "low" | "medium" | "high" | "critical";

export type DecisionLearningAction =
  | "approve_once"
  | "edit_then_approve"
  | "reject"
  | "update_policy";

export interface HitlPolicyRule {
  actionKind: HitlActionKind;
  decision: HitlPolicyDecision;
  risk: HitlRiskLevel;
  requiresSideEffectGate: boolean;
  reason: string;
}

export type HitlPolicyMatrix = Record<HitlActionKind, HitlPolicyRule>;

export interface HitlPolicyEvaluation {
  workspaceId: WorkspaceId;
  actionKind: HitlActionKind;
  automationMode: AutomationMode;
  decision: HitlPolicyDecision;
  risk: HitlRiskLevel;
  requiresSideEffectGate: boolean;
  allowedToExecute: boolean;
  reason: string;
}

export interface HitlReadinessSummary {
  automationMode: AutomationMode;
  readiness: {
    status: "not_ready";
    autopilotReady: false;
    allowedModes: AutomationMode[];
    disabledModes: AutomationMode[];
    summary: string;
  };
  reviewQueue: {
    total: number;
    waiting: number;
    blocked: number;
    approved: number;
    rejected: number;
    failedOrRetryable: number;
    executed: number;
    recent: Array<{
      actionId: string;
      actionKind: HitlActionKind;
      title: string;
      status: SideEffectDecision["status"];
      canRetry: boolean;
      requestedAt: string;
      updatedAt: string;
      reason: string;
    }>;
  };
}

type RuntimeWithSideEffects = {
  listSideEffects(limit?: number): SideEffectDecision[];
};

const DEFAULT_MODE: AutomationMode = "assist";

const ACTION_ORDER: HitlActionKind[] = [
  "lead.discovery",
  "prospect.enrichment",
  "customer.scoring",
  "email.draft",
  "landing_page.draft",
  "video_script.draft",
  "outbound.sequence.request",
  "email.send",
  "crm.write",
  "quotation.generate",
  "pi.generate",
  "price.discount",
  "payment.bank",
];

const DEFAULT_RULES: HitlPolicyMatrix = {
  "lead.discovery": {
    actionKind: "lead.discovery",
    decision: "auto",
    risk: "low",
    requiresSideEffectGate: false,
    reason: "Research-only lead discovery does not contact customers.",
  },
  "prospect.enrichment": {
    actionKind: "prospect.enrichment",
    decision: "auto",
    risk: "low",
    requiresSideEffectGate: false,
    reason: "Company and contact enrichment stays inside the local workspace.",
  },
  "customer.scoring": {
    actionKind: "customer.scoring",
    decision: "auto",
    risk: "low",
    requiresSideEffectGate: false,
    reason: "ICP scoring only ranks internal candidates.",
  },
  "email.draft": {
    actionKind: "email.draft",
    decision: "auto",
    risk: "low",
    requiresSideEffectGate: false,
    reason: "Drafting creates local copy only; sending is a separate reviewed action.",
  },
  "landing_page.draft": {
    actionKind: "landing_page.draft",
    decision: "auto",
    risk: "medium",
    requiresSideEffectGate: false,
    reason: "Landing pages remain draft-only until a human publishes or exports them.",
  },
  "video_script.draft": {
    actionKind: "video_script.draft",
    decision: "auto",
    risk: "medium",
    requiresSideEffectGate: false,
    reason: "Video work is script-only in this phase; no rendering provider is called.",
  },
  "outbound.sequence.request": {
    actionKind: "outbound.sequence.request",
    decision: "review",
    risk: "high",
    requiresSideEffectGate: true,
    reason: "Starting an outbound sequence can contact customers and must enter review.",
  },
  "email.send": {
    actionKind: "email.send",
    decision: "review",
    risk: "high",
    requiresSideEffectGate: true,
    reason: "Customer-facing email sends require human review.",
  },
  "crm.write": {
    actionKind: "crm.write",
    decision: "review",
    risk: "high",
    requiresSideEffectGate: true,
    reason: "CRM writes modify customer records and require human review.",
  },
  "quotation.generate": {
    actionKind: "quotation.generate",
    decision: "review",
    risk: "high",
    requiresSideEffectGate: true,
    reason: "Commercial documents require human review before generation or export.",
  },
  "pi.generate": {
    actionKind: "pi.generate",
    decision: "review",
    risk: "high",
    requiresSideEffectGate: true,
    reason: "PI generation affects commercial commitments and requires human review.",
  },
  "price.discount": {
    actionKind: "price.discount",
    decision: "review",
    risk: "high",
    requiresSideEffectGate: true,
    reason: "Discount changes affect margin and require human approval.",
  },
  "payment.bank": {
    actionKind: "payment.bank",
    decision: "blocked",
    risk: "critical",
    requiresSideEffectGate: true,
    reason: "Bank and payment actions are blocked in the minimum HITL kernel.",
  },
};

export function listHitlActionKinds(): HitlActionKind[] {
  return [...ACTION_ORDER];
}

export function getDefaultHitlPolicyMatrix(_workspaceId: WorkspaceId): HitlPolicyMatrix {
  return ACTION_ORDER.reduce((matrix, actionKind) => {
    matrix[actionKind] = { ...DEFAULT_RULES[actionKind] };
    return matrix;
  }, {} as HitlPolicyMatrix);
}

export function evaluateHitlAction(input: {
  workspaceId: WorkspaceId;
  actionKind: HitlActionKind;
  automationMode?: AutomationMode;
  matrix?: HitlPolicyMatrix;
}): HitlPolicyEvaluation {
  const automationMode = input.automationMode || DEFAULT_MODE;
  const matrix = input.matrix || getDefaultHitlPolicyMatrix(input.workspaceId);
  const baseRule = matrix[input.actionKind];
  const rule = automationMode === "locked" && baseRule.requiresSideEffectGate
    ? { ...baseRule, decision: "blocked" as const, reason: "Locked mode blocks all external actions." }
    : baseRule;
  const allowedToExecute = automationMode !== "observe" && rule.decision === "auto" && !rule.requiresSideEffectGate;

  return {
    workspaceId: input.workspaceId,
    actionKind: input.actionKind,
    automationMode,
    decision: rule.decision,
    risk: rule.risk,
    requiresSideEffectGate: rule.requiresSideEffectGate,
    allowedToExecute,
    reason: rule.reason,
  };
}

export function summarizeHitlReadiness(
  runtime: RuntimeWithSideEffects,
  workspaceId: WorkspaceId
): HitlReadinessSummary {
  const decisions = runtime.listSideEffects(100)
    .filter((decision) => decision.workspaceId === workspaceId);
  const recent = decisions.slice(0, 8).map(sideEffectDecisionView);

  return {
    automationMode: DEFAULT_MODE,
    readiness: {
      status: "not_ready",
      autopilotReady: false,
      allowedModes: ["observe", "assist", "locked"],
      disabledModes: ["autopilot"],
      summary: "Autopilot is visible for planning only; customer-facing actions still require review.",
    },
    reviewQueue: {
      total: decisions.length,
      waiting: decisions.filter((decision) =>
        decision.status === "blocked" || decision.status === "retry_requested"
      ).length,
      blocked: decisions.filter((decision) => decision.status === "blocked").length,
      approved: decisions.filter((decision) => decision.status === "approved").length,
      rejected: decisions.filter((decision) => decision.status === "rejected").length,
      failedOrRetryable: decisions.filter((decision) => sideEffectCanRetry(decision)).length,
      executed: decisions.filter((decision) => decision.status === "executed").length,
      recent,
    },
  };
}

function sideEffectDecisionView(decision: SideEffectDecision): HitlReadinessSummary["reviewQueue"]["recent"][number] {
  return {
    actionId: decision.id,
    actionKind: actionKindForSideEffect(decision.kind),
    title: titleForSideEffect(decision.kind),
    status: decision.status,
    canRetry: sideEffectCanRetry(decision),
    requestedAt: decision.createdAt,
    updatedAt: decision.updatedAt || decision.execution?.executedAt || decision.execution?.failedAt || decision.createdAt,
    reason: sanitizeText(decision.execution?.error || decision.reason),
  };
}

function actionKindForSideEffect(kind: SideEffectKind): HitlActionKind {
  if (kind === "email.send") return "email.send";
  if (kind === "crm.write") return "crm.write";
  if (kind === "payment.write" || kind === "bank.read") return "payment.bank";
  if (kind === "document.generate") return "quotation.generate";
  if (kind === "document.preview") return "quotation.generate";
  if (kind === "data.read" || kind === "imap.fetch") return "prospect.enrichment";
  return "outbound.sequence.request";
}

function titleForSideEffect(kind: SideEffectKind): string {
  if (kind === "email.send") return "Email send";
  if (kind === "crm.write") return "CRM write";
  if (kind === "document.generate") return "Document generation";
  if (kind === "document.preview") return "Document preview";
  if (kind === "payment.write" || kind === "bank.read") return "Payment or bank action";
  if (kind === "imap.fetch") return "Mailbox sync";
  if (kind === "data.read") return "Data read";
  if (kind === "feishu.notify") return "Team notification";
  return "External action";
}

function sideEffectCanRetry(decision: SideEffectDecision): boolean {
  if (decision.execution?.status === "failed") return decision.execution.canRetry !== false;
  return decision.status === "retry_requested" || decision.status === "execution_failed";
}

function sanitizeText(value: unknown): string {
  const raw = typeof value === "string" && value.trim()
    ? value.trim()
    : "External action is waiting for human review.";
  return raw
    .replace(/\/Users\/[^\s"'`]+/g, "local runtime")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "local runtime")
    .replace(/\.ssa[^\s"'`]*/g, "runtime data")
    .replace(/\bSSA_[A-Z0-9_]+(?:=true)?\b/g, "explicit enablement")
    .replace(/\b(secret|token|password|api key)\b/gi, "sensitive value")
    .slice(0, 220);
}

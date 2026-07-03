// Shared type declarations for the /growth (Lead Development) page and its panels.
// Extracted from page.tsx to keep the page component focused on rendering + data flow.

export type AutomationMode = "observe" | "assist" | "autopilot" | "locked";
export type HitlPolicyDecision = "auto" | "review" | "blocked";
export type HitlRisk = "low" | "medium" | "high" | "critical";

export interface PolicyRule {
  actionKind: string;
  decision: HitlPolicyDecision;
  risk: HitlRisk;
  requiresSideEffectGate: boolean;
  reason: string;
}

export interface ReviewItem {
  actionId: string;
  actionKind: string;
  title: string;
  status: string;
  canRetry: boolean;
  requestedAt: string;
  updatedAt: string;
  reason: string;
}

export interface ProspectingStep {
  id: string;
  label: string;
  mode: "dry-run" | "draft-only" | "review";
}

export interface DecisionLearningOption {
  action: "approve_once" | "edit_then_approve" | "reject" | "update_policy";
  label: string;
  effect: string;
}

export interface ProspectingPacketData {
  id: string;
  workspaceId: string;
  candidate: {
    companyName: string;
    website?: string;
    country?: string;
    industry?: string;
    contactName?: string;
    contactRole?: string;
    contactEmail?: string;
  };
  evidence: Array<{
    kind: string;
    label: string;
    summary: string;
    confidence: number;
    sourceUrl?: string;
  }>;
  confidence: number;
  icpScore: {
    score: number;
    band: string;
    reasons: string[];
  };
  openingAngle: {
    headline: string;
    rationale: string;
    confidence: number;
    draftOnly: true;
  };
  riskFlags: string[];
  recommendedNextStep: string;
  dryRun: true;
  createdAt: string;
  idempotencyKey: string;
}

export interface ProspectingRunData {
  id: string;
  workspaceId: string;
  dryRun: true;
  draftOnly: true;
  status: string;
  sourceSummary: string;
  createdAt: string;
  updatedAt: string;
  packets: ProspectingPacketData[];
}

export interface ProspectingData {
  workspaceId: string;
  dryRun: true;
  draftOnly: true;
  noOutboundSent: true;
  runs: ProspectingRunData[];
}

export interface ProductFitRecommendationData {
  product: string;
  fitReasons: string[];
  evidence: Array<{
    kind: string;
    label: string;
    summary: string;
    confidence: number;
    sourceUrl?: string;
  }>;
  confidence: number;
  riskFlags: string[];
  missingInfo: string[];
}

export interface QuotationDraftLineData {
  lineId: string;
  product: string;
  description: string;
  specification: string;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
  currency?: string;
  costCurrency?: string;
  margin?: number;
  marginPercent?: number;
  supplier?: string;
  supplierCandidates: string[];
  hsCode?: string;
  incoterms?: string;
  missingInfo: string[];
}

export interface QuotationDraftData {
  id: string;
  status: string;
  quoteReady: false;
  lines: QuotationDraftLineData[];
  costPriceMarginReferences: string[];
  assumptions: string[];
  missingInfoChecklist: string[];
  evidenceRefs: string[];
  confidence: number;
  riskFlags: string[];
  recommendedHumanEdits: string[];
  dryRun: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
}

export interface PersonalizedSalesDraftData {
  workspaceId: string;
  prospectingPacketId: string;
  candidate: ProspectingPacketData["candidate"];
  recommendedProducts: ProductFitRecommendationData[];
  fitReasons: string[];
  quotationDraftLines: QuotationDraftLineData[];
  costPriceMarginReferences: string[];
  assumptions: string[];
  missingInfoChecklist: string[];
  evidenceRefs: string[];
  quotationDraft: QuotationDraftData;
  confidence: number;
  riskFlags: string[];
  recommendedHumanEdits: string[];
  dryRun: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  createdAt: string;
  idempotencyKey: string;
}

export interface PersonalizedSalesDraftRunData {
  id: string;
  workspaceId: string;
  status: string;
  dryRun: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  drafts: PersonalizedSalesDraftData[];
}

export interface QuotationDraftRunsData {
  workspaceId: string;
  dryRun: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  noDocumentGenerated: true;
  runs: PersonalizedSalesDraftRunData[];
}

export type OutboundApprovalActionType = "email_send" | "crm_write" | "quotation_generate" | "pi_generate" | "price_adjustment";

export interface OutboundApprovalCandidateData {
  id: string;
  workspaceId: string;
  sourceDraftRunId: string;
  sourceDraftId: string;
  sourceProspectingPacketId: string;
  targetCustomer: string;
  recipient: {
    name?: string;
    email?: string;
    role?: string;
  };
  contentSummary: string;
  productQuotationSummary: string;
  evidenceRefs: string[];
  riskFlags: string[];
  expectedAction: string;
  sideEffectKind: string;
  idempotencyKey: string;
  failureRetryStrategy: string;
  approvalStatus: string;
  sideEffectDecisionId: string;
  waitingForApproval: true;
  notExecuted: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
}

export interface OutboundApprovalRunData {
  id: string;
  workspaceId: string;
  status: string;
  intendedActionType: OutboundApprovalActionType;
  approvalRequired: true;
  notExecuted: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  crmWritten: false;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  candidates: OutboundApprovalCandidateData[];
}

export interface OutboundApprovalRunsData {
  workspaceId: string;
  approvalRequired: true;
  waitingForApproval: true;
  notExecuted: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  crmWritten: false;
  runs: OutboundApprovalRunData[];
}

export type HumanDecision = "approve_once" | "edit_then_approve" | "reject" | "update_policy";

export interface DecisionLearningRecordData {
  id: string;
  workspaceId: string;
  approvalRunId: string;
  candidateId: string;
  sideEffectDecisionId: string;
  actionKind: string;
  decision: HumanDecision;
  humanEdits: string;
  rejectionReason: string;
  policySuggestion: string;
  scope: string;
  rollbackNote: string;
  createdAt: string;
  operator: string;
  confidence: number;
  risk: string;
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

export interface DecisionLearningData {
  workspaceId: string;
  noPolicyAutoApproval: true;
  highRiskStillReview: true;
  sideEffectGateStillRequired: true;
  readOnlyUntilReviewed: true;
  autopilotReady: false;
  guardrailSummary: string;
  records: DecisionLearningRecordData[];
}

export interface GrowthSchedulerStepData {
  id: string;
  workspaceId: string;
  kind: string;
  status: string;
  summary: string;
  sourceId?: string;
  outputId?: string;
  retryable: boolean;
  dryRun: true;
  draftOnly: true;
  notExecuted: true;
  noOutboundSent: true;
}

export interface GrowthSchedulerFailedWorkData {
  id: string;
  workspaceId: string;
  stepKind: string;
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

export interface GrowthMetricsData {
  workspaceId: string;
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
    status: string;
    rate: null;
    reason: string;
  };
  failureReasons: string[];
  misjudgmentReasonsPlaceholder: string[];
  retryableFailedWorkCount: number;
  noOutboundSent: true;
  notExecuted: true;
  autopilotReady: false;
  guardrailSummary?: string;
}

export interface GrowthSchedulerRunData {
  id: string;
  workspaceId: string;
  status: string;
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
  steps: GrowthSchedulerStepData[];
  failedWork: GrowthSchedulerFailedWorkData[];
  metricsSnapshot: Omit<GrowthMetricsData, "workspaceId" | "noOutboundSent" | "notExecuted" | "autopilotReady" | "guardrailSummary">;
  guardrailSummary?: string;
}

export interface GrowthSchedulerData {
  workspaceId: string;
  dryRun: true;
  draftOnly: true;
  notExecuted: true;
  noOutboundSent: true;
  autopilotReady: false;
  sideEffectGateStillRequired: true;
  guardrailSummary: string;
  runs: GrowthSchedulerRunData[];
  failedWork: GrowthSchedulerFailedWorkData[];
}

export interface ControlCenterData {
  workspaceId: string;
  automationMode: AutomationMode;
  policyMatrix: PolicyRule[];
  readiness: {
    status: string;
    autopilotReady: boolean;
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
    recent: ReviewItem[];
  };
  prospectingPreview: {
    mode: "dry-run";
    draftOnly: boolean;
    steps: ProspectingStep[];
  };
  decisionLearning: {
    readOnly: boolean;
    actions: DecisionLearningOption[];
  };
}

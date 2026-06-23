"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useProject } from "@/lib/project";
import { cx } from "@/components/battle-station/theme";
import {
  AccessBanner,
  BattleBadge,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  BattleText,
  CommandButton,
  StatCell,
  useBattleLanguage,
  type AccessRequiredIssue,
  type BattleTone,
} from "@/components/ui/BattlePage";

type AutomationMode = "observe" | "assist" | "autopilot" | "locked";
type HitlPolicyDecision = "auto" | "review" | "blocked";
type HitlRisk = "low" | "medium" | "high" | "critical";

interface PolicyRule {
  actionKind: string;
  decision: HitlPolicyDecision;
  risk: HitlRisk;
  requiresSideEffectGate: boolean;
  reason: string;
}

interface ReviewItem {
  actionId: string;
  actionKind: string;
  title: string;
  status: string;
  canRetry: boolean;
  requestedAt: string;
  updatedAt: string;
  reason: string;
}

interface ProspectingStep {
  id: string;
  label: string;
  mode: "dry-run" | "draft-only" | "review";
}

interface DecisionLearningOption {
  action: "approve_once" | "edit_then_approve" | "reject" | "update_policy";
  label: string;
  effect: string;
}

interface ProspectingPacketData {
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

interface ProspectingRunData {
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

interface ProspectingData {
  workspaceId: string;
  dryRun: true;
  draftOnly: true;
  noOutboundSent: true;
  runs: ProspectingRunData[];
}

interface ProductFitRecommendationData {
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

interface QuotationDraftLineData {
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

interface QuotationDraftData {
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

interface PersonalizedSalesDraftData {
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

interface PersonalizedSalesDraftRunData {
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

interface QuotationDraftRunsData {
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

type OutboundApprovalActionType = "email_send" | "crm_write" | "quotation_generate" | "pi_generate" | "price_adjustment";

interface OutboundApprovalCandidateData {
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

interface OutboundApprovalRunData {
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

interface OutboundApprovalRunsData {
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

type HumanDecision = "approve_once" | "edit_then_approve" | "reject" | "update_policy";

interface DecisionLearningRecordData {
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

interface DecisionLearningData {
  workspaceId: string;
  noPolicyAutoApproval: true;
  highRiskStillReview: true;
  sideEffectGateStillRequired: true;
  readOnlyUntilReviewed: true;
  autopilotReady: false;
  guardrailSummary: string;
  records: DecisionLearningRecordData[];
}

interface GrowthSchedulerStepData {
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

interface GrowthSchedulerFailedWorkData {
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

interface GrowthMetricsData {
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

interface GrowthSchedulerRunData {
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

interface GrowthSchedulerData {
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

interface ControlCenterData {
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

const POLICY_FALLBACK: PolicyRule[] = [
  { actionKind: "lead.discovery", decision: "auto", risk: "low", requiresSideEffectGate: false, reason: "Research only." },
  { actionKind: "prospect.enrichment", decision: "auto", risk: "low", requiresSideEffectGate: false, reason: "Local enrichment." },
  { actionKind: "customer.scoring", decision: "auto", risk: "low", requiresSideEffectGate: false, reason: "Internal ranking." },
  { actionKind: "email.draft", decision: "auto", risk: "low", requiresSideEffectGate: false, reason: "Draft only." },
  { actionKind: "landing_page.draft", decision: "auto", risk: "medium", requiresSideEffectGate: false, reason: "Draft only." },
  { actionKind: "video_script.draft", decision: "auto", risk: "medium", requiresSideEffectGate: false, reason: "Script only." },
  { actionKind: "outbound.sequence.request", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Outbound request needs review." },
  { actionKind: "email.send", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Human review required." },
  { actionKind: "crm.write", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Human review required." },
  { actionKind: "quotation.generate", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Human review required." },
  { actionKind: "pi.generate", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Human review required." },
  { actionKind: "price.discount", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Human review required." },
  { actionKind: "payment.bank", decision: "blocked", risk: "critical", requiresSideEffectGate: true, reason: "Blocked in this phase." },
];

const PREVIEW_FALLBACK: ProspectingStep[] = [
  { id: "discover-leads", label: "discover leads", mode: "dry-run" },
  { id: "enrich-company", label: "enrich company", mode: "dry-run" },
  { id: "score-icp-fit", label: "score ICP fit", mode: "dry-run" },
  { id: "generate-opening-angle", label: "generate opening angle", mode: "draft-only" },
  { id: "draft-personalized-email", label: "draft personalized email", mode: "draft-only" },
  { id: "draft-landing-page", label: "draft landing page", mode: "draft-only" },
  { id: "draft-video-script", label: "draft video script", mode: "draft-only" },
  { id: "request-outbound-approval", label: "request outbound approval", mode: "review" },
];

const LEARNING_FALLBACK: DecisionLearningOption[] = [
  { action: "approve_once", label: "Approve once", effect: "One-time approval." },
  { action: "edit_then_approve", label: "Edit then approve", effect: "Human edits before approval." },
  { action: "reject", label: "Reject", effect: "Stop the proposed action." },
  { action: "update_policy", label: "Update policy", effect: "Save the decision pattern later." },
];

function decisionTone(decision: HitlPolicyDecision): BattleTone {
  if (decision === "auto") return "emerald";
  if (decision === "review") return "amber";
  return "red";
}

function riskTone(risk: HitlRisk): BattleTone {
  if (risk === "critical") return "red";
  if (risk === "high") return "amber";
  if (risk === "medium") return "blue";
  return "emerald";
}

function modeTone(mode: AutomationMode, active: boolean, allowed: boolean): BattleTone {
  if (!allowed) return "red";
  if (active) return "emerald";
  if (mode === "locked") return "amber";
  return "blue";
}

function ModeCard({
  mode,
  active,
  allowed,
  label,
  description,
}: {
  mode: AutomationMode;
  active: boolean;
  allowed: boolean;
  label: string;
  description: string;
}) {
  return (
    <div
      className={cx(
        "rounded-md border px-3 py-2",
        active ? "border-emerald-500/45 bg-emerald-500/10" : "border-slate-800 bg-slate-950/45",
        !allowed && "border-red-500/35 bg-red-500/8"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[12px] font-semibold uppercase text-slate-100">{mode}</p>
        <BattleBadge tone={modeTone(mode, active, allowed)}>
          {active ? "active" : allowed ? "available" : "not ready"}
        </BattleBadge>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-300">{label}</p>
      <p className="mt-1 min-h-9 text-[11px] leading-4 text-slate-500">{description}</p>
    </div>
  );
}

function LoadingPanel() {
  return (
    <BattlePanel title="Loading" meta="control-center" tone="neutral">
      <div className="p-4 text-sm text-slate-400">
        <BattleText en="Loading growth controls..." zh="正在加载增长控制台..." />
      </div>
    </BattlePanel>
  );
}

export default function GrowthPage() {
  const language = useBattleLanguage();
  const { apiFetch } = useProject();
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [prospecting, setProspecting] = useState<ProspectingData | null>(null);
  const [quotationDrafts, setQuotationDrafts] = useState<QuotationDraftRunsData | null>(null);
  const [outboundApprovals, setOutboundApprovals] = useState<OutboundApprovalRunsData | null>(null);
  const [decisionLearningMemory, setDecisionLearningMemory] = useState<DecisionLearningData | null>(null);
  const [scheduler, setScheduler] = useState<GrowthSchedulerData | null>(null);
  const [growthMetrics, setGrowthMetrics] = useState<GrowthMetricsData | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [accessIssue, setAccessIssue] = useState<AccessRequiredIssue | "none">("none");

  const load = useCallback(async () => {
    setError("");
    const [response, prospectingResponse, quotationResponse, approvalResponse, decisionResponse, schedulerResponse, metricsResponse] = await Promise.all([
      apiFetch("/api/growth/control-center", { cache: "no-store" }),
      apiFetch("/api/growth/prospecting", { cache: "no-store" }),
      apiFetch("/api/growth/quotation-drafts", { cache: "no-store" }),
      apiFetch("/api/growth/outbound-approvals", { cache: "no-store" }),
      apiFetch("/api/growth/decision-learning", { cache: "no-store" }),
      apiFetch("/api/growth/scheduler", { cache: "no-store" }),
      apiFetch("/api/growth/metrics", { cache: "no-store" }),
    ]);
    if (
      response.status === 401 ||
      prospectingResponse.status === 401 ||
      quotationResponse.status === 401 ||
      approvalResponse.status === 401 ||
      decisionResponse.status === 401 ||
      schedulerResponse.status === 401 ||
      metricsResponse.status === 401
    ) {
      setAccessIssue("beta_required");
      return;
    }
    if (
      response.status === 403 ||
      prospectingResponse.status === 403 ||
      quotationResponse.status === 403 ||
      approvalResponse.status === 403 ||
      decisionResponse.status === 403 ||
      schedulerResponse.status === 403 ||
      metricsResponse.status === 403
    ) {
      setAccessIssue("workspace_denied");
      return;
    }
    const json = await response.json();
    const prospectingJson = await prospectingResponse.json();
    const quotationJson = await quotationResponse.json();
    const approvalJson = await approvalResponse.json();
    const decisionJson = await decisionResponse.json();
    const schedulerJson = await schedulerResponse.json();
    const metricsJson = await metricsResponse.json();
    if (
      !response.ok || !json.success ||
      !prospectingResponse.ok || !prospectingJson.success ||
      !quotationResponse.ok || !quotationJson.success ||
      !approvalResponse.ok || !approvalJson.success ||
      !decisionResponse.ok || !decisionJson.success ||
      !schedulerResponse.ok || !schedulerJson.success ||
      !metricsResponse.ok || !metricsJson.success
    ) {
      setError(language === "zh" ? "增长控制台暂不可用" : "Growth control center is unavailable");
      return;
    }
    setAccessIssue("none");
    setData(json.data as ControlCenterData);
    setProspecting(prospectingJson.data as ProspectingData);
    setQuotationDrafts(quotationJson.data as QuotationDraftRunsData);
    setOutboundApprovals(approvalJson.data as OutboundApprovalRunsData);
    setDecisionLearningMemory(decisionJson.data as DecisionLearningData);
    setScheduler(schedulerJson.data as GrowthSchedulerData);
    setGrowthMetrics(metricsJson.data as GrowthMetricsData);
  }, [apiFetch, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const startDryRun = useCallback(async () => {
    setDryRunLoading(true);
    setActionMessage("");
    try {
      const response = await apiFetch("/api/growth/prospecting/dry-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `growth-ui-${Date.now()}`,
          limit: 4,
        }),
      });
      if (response.status === 401) setAccessIssue("beta_required");
      if (response.status === 403) setAccessIssue("workspace_denied");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setActionMessage(language === "zh" ? "dry-run 未能创建" : "dry-run was not created");
        return;
      }
      setActionMessage(language === "zh" ? "dry-run 已生成，没有外联" : "dry-run generated; no outbound sent");
      await load();
    } finally {
      setDryRunLoading(false);
    }
  }, [apiFetch, language, load]);

  const policy = data?.policyMatrix?.length ? data.policyMatrix : POLICY_FALLBACK;
  const reviewQueue = data?.reviewQueue;
  const steps = data?.prospectingPreview?.steps?.length ? data.prospectingPreview.steps : PREVIEW_FALLBACK;
  const learning = data?.decisionLearning?.actions?.length ? data.decisionLearning.actions : LEARNING_FALLBACK;
  const activeMode = data?.automationMode || "assist";
  const allowedModes = useMemo(() => new Set(data?.readiness?.allowedModes || ["observe", "assist", "locked"]), [data?.readiness?.allowedModes]);
  const latestRun = prospecting?.runs?.[0] || null;
  const candidatePackets = latestRun?.packets || [];
  const primaryPacket = candidatePackets[0] || null;
  const latestQuotationRun = quotationDrafts?.runs?.[0] || null;
  const latestDraft = latestQuotationRun?.drafts?.[0] || null;
  const draftLines = latestDraft?.quotationDraftLines || [];
  const latestApprovalRun = outboundApprovals?.runs?.[0] || null;
  const latestApproval = latestApprovalRun?.candidates?.[0] || null;
  const latestDecisionRecord = decisionLearningMemory?.records?.[0] || null;
  const latestSchedulerRun = scheduler?.runs?.[0] || null;
  const schedulerFailedWork = scheduler?.failedWork || [];
  const metrics = growthMetrics || latestSchedulerRun?.metricsSnapshot || null;

  const startQuotationDraft = useCallback(async () => {
    if (!primaryPacket || !latestRun) {
      setActionMessage(language === "zh" ? "先生成 prospecting dry-run，再生成 quotation draft" : "Run prospecting dry-run before creating a quotation draft");
      return;
    }
    setQuotationLoading(true);
    setActionMessage("");
    try {
      const response = await apiFetch("/api/growth/quotation-drafts/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `growth-ui-quotation-${primaryPacket.id}-${Date.now()}`,
          prospectingRunId: latestRun.id,
          prospectingPacketId: primaryPacket.id,
          limit: 1,
        }),
      });
      if (response.status === 401) setAccessIssue("beta_required");
      if (response.status === 403) setAccessIssue("workspace_denied");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setActionMessage(language === "zh" ? "quotation draft 未能创建" : "quotation draft was not created");
        return;
      }
      setActionMessage(language === "zh" ? "quotation draft 已生成，not sent，no document generated" : "quotation draft created; not sent, no document generated");
      await load();
    } finally {
      setQuotationLoading(false);
    }
  }, [apiFetch, language, latestRun, load, primaryPacket]);

  const requestOutboundApproval = useCallback(async () => {
    if (!latestQuotationRun || !latestDraft) {
      setActionMessage(language === "zh" ? "先生成 quotation draft，再创建 outbound approval request" : "Create a quotation draft before requesting outbound approval");
      return;
    }
    setApprovalLoading(true);
    setActionMessage("");
    try {
      const response = await apiFetch("/api/growth/outbound-approvals/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `growth-ui-approval-${latestDraft.quotationDraft.id}-${Date.now()}`,
          sourceDraftRunId: latestQuotationRun.id,
          sourceDraftId: latestDraft.quotationDraft.id,
          intendedActionType: "email_send",
        }),
      });
      if (response.status === 401) setAccessIssue("beta_required");
      if (response.status === 403) setAccessIssue("workspace_denied");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setActionMessage(language === "zh" ? "approval request 未能创建" : "approval request was not created");
        return;
      }
      setActionMessage(language === "zh" ? "approval request 已创建，not executed，not sent" : "approval request created; not executed, not sent");
      await load();
    } finally {
      setApprovalLoading(false);
    }
  }, [apiFetch, language, latestDraft, latestQuotationRun, load]);

  const recordSampleDecision = useCallback(async () => {
    if (!latestApprovalRun || !latestApproval) {
      setActionMessage(language === "zh" ? "先创建 outbound approval request，再记录 decision memory" : "Create an outbound approval request before recording decision memory");
      return;
    }
    setDecisionLoading(true);
    setActionMessage("");
    try {
      const response = await apiFetch("/api/growth/decision-learning/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `growth-ui-decision-${latestApproval.id}-${Date.now()}`,
          approvalRunId: latestApprovalRun.id,
          candidateId: latestApproval.id,
          decision: "update_policy",
          humanEdits: "Keep this as reviewed memory only; do not execute outbound.",
          rejectionReason: "",
          policySuggestion: "Require evidence-backed content before any future approval review.",
          scope: "workspace",
          rollbackNote: "Remove this decision memory; no side-effect execution state changes.",
          operator: "local-operator",
          confidence: 0.75,
        }),
      });
      if (response.status === 401) setAccessIssue("beta_required");
      if (response.status === 403) setAccessIssue("workspace_denied");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setActionMessage(language === "zh" ? "decision memory 未能记录" : "decision memory was not recorded");
        return;
      }
      setActionMessage(language === "zh" ? "decision memory 已记录；no auto-approval，high-risk still review" : "decision memory recorded; no auto-approval, high-risk still review");
      await load();
    } finally {
      setDecisionLoading(false);
    }
  }, [apiFetch, language, latestApproval, latestApprovalRun, load]);

  const runSchedulerTick = useCallback(async () => {
    setSchedulerLoading(true);
    setActionMessage("");
    try {
      const response = await apiFetch("/api/growth/scheduler/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `growth-ui-scheduler-${Date.now()}`,
        }),
      });
      if (response.status === 401) setAccessIssue("beta_required");
      if (response.status === 403) setAccessIssue("workspace_denied");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setActionMessage(language === "zh" ? "scheduler dry-run tick 未能创建" : "scheduler dry-run tick was not created");
        return;
      }
      setActionMessage(language === "zh" ? "scheduler dry-run tick 已完成；no outbound sent，not executed" : "scheduler dry-run tick completed; no outbound sent, not executed");
      await load();
    } finally {
      setSchedulerLoading(false);
    }
  }, [apiFetch, language, load]);

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Autonomous Growth"
        zhTitle="自主增长"
        meta={data?.workspaceId ? `workspace ${data.workspaceId}` : "HITL control center"}
        zhMeta={data?.workspaceId ? `工作区 ${data.workspaceId}` : "人工裁决控制台"}
        active="/growth"
      >
        <BattleBadge tone="amber">dry-run</BattleBadge>
        <BattleBadge tone="blue">draft-only</BattleBadge>
        <BattleBadge tone="neutral">no outbound sent</BattleBadge>
        <BattleBadge tone="red">autopilot disabled</BattleBadge>
        <BattleBadge tone="red">autopilot still not ready</BattleBadge>
        <CommandButton type="button" variant="secondary" onClick={() => void load()}>
          <BattleText en="Refresh" zh="刷新" />
        </CommandButton>
      </BattlePageHeader>

      {accessIssue !== "none" && <AccessBanner issue={accessIssue} next="/growth" />}

      <BattlePageBody className="space-y-3">
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {actionMessage && (
          <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {actionMessage}
          </div>
        )}

        {!data && !error && accessIssue === "none" ? <LoadingPanel /> : null}

        <div className="grid gap-3 xl:grid-cols-[minmax(360px,0.95fr)_minmax(520px,1.25fr)]">
          <BattlePanel title="Automation Mode" meta="observe / assist / autopilot / locked" tone="blue">
            <div className="grid gap-2 p-3 sm:grid-cols-2">
              <ModeCard
                mode="observe"
                active={activeMode === "observe"}
                allowed={allowedModes.has("observe")}
                label={language === "zh" ? "只观察和推荐" : "Observe and recommend"}
                description={language === "zh" ? "不会执行客户可见动作。" : "No customer-facing action is executed."}
              />
              <ModeCard
                mode="assist"
                active={activeMode === "assist"}
                allowed={allowedModes.has("assist")}
                label={language === "zh" ? "生成草稿，外部动作需人工" : "Drafts with human approval"}
                description={language === "zh" ? "当前默认模式，草稿可自动生成。" : "Current default; drafts can be prepared automatically."}
              />
              <ModeCard
                mode="autopilot"
                active={false}
                allowed={false}
                label={language === "zh" ? "低风险自动，中高风险 HITL" : "Low-risk auto, HITL for risk"}
                description={language === "zh" ? "disabled / not ready，本阶段不启用。" : "disabled / not ready for this phase."}
              />
              <ModeCard
                mode="locked"
                active={activeMode === "locked"}
                allowed={allowedModes.has("locked")}
                label={language === "zh" ? "全部外部动作 blocked" : "External actions blocked"}
                description={language === "zh" ? "可作为紧急刹车模式。" : "Emergency stop mode for outbound actions."}
              />
            </div>
          </BattlePanel>

          <BattlePanel title="Review Queue" meta="side-effect gate summary" tone="amber">
            <div className="grid gap-2 p-3 sm:grid-cols-4">
              <StatCell label="Pending" value={reviewQueue?.waiting ?? 0} tone="amber" />
              <StatCell label="Blocked" value={reviewQueue?.blocked ?? 0} tone="red" />
              <StatCell label="Failed / Retry" value={reviewQueue?.failedOrRetryable ?? 0} tone="red" />
              <StatCell label="Approved" value={reviewQueue?.approved ?? 0} tone="emerald" />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  <BattleText en="Recent Reviews" zh="最近审批" />
                </p>
                <a href="/agent-status" className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                  <BattleText en="Open agent-status" zh="打开 agent-status" />
                </a>
              </div>
              <div className="grid gap-2">
                {(reviewQueue?.recent || []).slice(0, 4).map((item) => (
                  <div key={item.actionId} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 md:grid-cols-[minmax(130px,0.7fr)_auto_minmax(180px,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-slate-200">{item.actionKind}</p>
                      <p className="truncate text-[11px] text-slate-500">{item.title}</p>
                    </div>
                    <BattleBadge tone={item.status === "blocked" ? "red" : item.status === "approved" ? "emerald" : "amber"}>
                      {item.status}
                    </BattleBadge>
                    <p className="truncate text-[11px] text-slate-500">{item.reason}</p>
                  </div>
                ))}
                {(!reviewQueue?.recent || reviewQueue.recent.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="No side-effect reviews in this workspace." zh="当前工作区暂无外部动作审批。" />
                  </div>
                )}
              </div>
            </div>
          </BattlePanel>
        </div>

        <BattlePanel title="HITL Policy Matrix" meta="auto / review / blocked" tone="purple">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Decision</th>
                  <th className="px-3 py-2 font-semibold">Risk</th>
                  <th className="px-3 py-2 font-semibold">Gate</th>
                  <th className="px-3 py-2 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {policy.map((rule) => (
                  <tr key={rule.actionKind} className="border-b border-slate-800/70 last:border-0">
                    <td className="px-3 py-2 font-mono text-slate-200">{rule.actionKind}</td>
                    <td className="px-3 py-2">
                      <BattleBadge tone={decisionTone(rule.decision)}>{rule.decision}</BattleBadge>
                    </td>
                    <td className="px-3 py-2">
                      <BattleBadge tone={riskTone(rule.risk)}>{rule.risk}</BattleBadge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                      {rule.requiresSideEffectGate ? "side-effect gate" : "local only"}
                    </td>
                    <td className="max-w-[520px] px-3 py-2 text-slate-500">{rule.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BattlePanel>

        <div className="grid gap-3 xl:grid-cols-[minmax(360px,0.9fr)_minmax(560px,1.35fr)]">
          <BattlePanel
            title="Prospecting Runs"
            meta="dry-run / draft-only / no outbound sent"
            tone="blue"
            action={
              <CommandButton type="button" variant="secondary" loading={dryRunLoading} onClick={() => void startDryRun()}>
                <BattleText en="Run dry-run" zh="生成 dry-run" />
              </CommandButton>
            }
          >
            <div className="grid gap-2 p-3 sm:grid-cols-3">
              <StatCell label="Runs" value={prospecting?.runs?.length ?? 0} tone="blue" />
              <StatCell label="Packets" value={candidatePackets.length} tone="emerald" />
              <StatCell label="Outbound" value="0" tone="red" />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="grid gap-2">
                {(prospecting?.runs || []).slice(0, 4).map((run) => (
                  <div key={run.id} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 md:grid-cols-[minmax(140px,0.8fr)_auto_minmax(160px,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-slate-200">{run.status}</p>
                      <p className="truncate text-[11px] text-slate-500">{run.sourceSummary}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <BattleBadge tone="blue">dry-run</BattleBadge>
                      <BattleBadge tone="neutral">draft-only</BattleBadge>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">{run.packets.length} Candidate Packets</p>
                  </div>
                ))}
                {(!prospecting?.runs || prospecting.runs.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="No prospecting runs yet. Run a dry-run to inspect local evidence." zh="暂无开发客户 dry-run。先生成一次以检查本地证据。" />
                  </div>
                )}
              </div>
            </div>
          </BattlePanel>

          <BattlePanel title="Candidate Packets" meta="Evidence / Confidence / ICP Score" tone="emerald">
            <div className="grid gap-2 p-3">
              {candidatePackets.slice(0, 4).map((packet) => (
                <div key={packet.id} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{packet.candidate.companyName}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-500">
                        {[packet.candidate.industry, packet.candidate.country, packet.candidate.website].filter(Boolean).join(" | ") || "local evidence only"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <BattleBadge tone="blue">Evidence / Confidence {Math.round(packet.confidence * 100)}%</BattleBadge>
                      <BattleBadge tone={packet.icpScore.band === "high" ? "emerald" : packet.icpScore.band === "medium" ? "amber" : "red"}>
                        ICP Score {packet.icpScore.score}
                      </BattleBadge>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Opening Angle</p>
                      <p className="mt-1 text-xs font-semibold text-slate-200">{packet.openingAngle.headline}</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">{packet.openingAngle.rationale}</p>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Next Step</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">{packet.recommendedNextStep}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {packet.riskFlags.slice(0, 5).map((flag) => (
                          <BattleBadge key={flag} tone={flag.includes("insufficient") || flag.includes("not_ready") ? "red" : "neutral"}>
                            {flag}
                          </BattleBadge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {candidatePackets.length === 0 && (
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                  <BattleText en="Candidate Packets will appear here after a dry-run." zh="dry-run 后会在这里显示候选客户开发包。" />
                </div>
              )}
            </div>
          </BattlePanel>
        </div>

        <BattlePanel title="Risk Flags" meta="Phase 8 safety state" tone={primaryPacket?.riskFlags?.includes("insufficient_evidence") ? "red" : "amber"}>
          <div className="grid gap-2 p-3 md:grid-cols-[minmax(240px,0.8fr)_minmax(320px,1.2fr)]">
            <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
              <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Risk Flags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(primaryPacket?.riskFlags || ["dry_run_only", "draft_only", "no_outbound_sent"]).map((flag) => (
                  <BattleBadge key={flag} tone={flag.includes("insufficient") || flag.includes("not_ready") ? "red" : "neutral"}>
                    {flag}
                  </BattleBadge>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
              <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Evidence / Confidence</p>
              <div className="mt-2 grid gap-2">
                {(primaryPacket?.evidence || []).slice(0, 3).map((item) => (
                  <div key={`${item.kind}:${item.label}`} className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5">
                    <p className="min-w-0 truncate text-[11px] text-slate-300">{item.label}: {item.summary}</p>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">{Math.round(item.confidence * 100)}%</span>
                  </div>
                ))}
                {!primaryPacket && (
                  <p className="text-[11px] text-slate-500">
                    <BattleText en="No evidence loaded yet." zh="尚未加载证据。" />
                  </p>
                )}
              </div>
            </div>
          </div>
        </BattlePanel>

        <div className="grid gap-3 xl:grid-cols-[minmax(360px,0.9fr)_minmax(560px,1.35fr)]">
          <BattlePanel
            title="Quotation Drafts"
            meta="Phase 9 / draft-only / not sent"
            tone="amber"
            action={
              <CommandButton type="button" variant="secondary" loading={quotationLoading} onClick={() => void startQuotationDraft()}>
                <BattleText en="Create quotation draft" zh="生成 quotation draft" />
              </CommandButton>
            }
          >
            <div className="grid gap-2 p-3 sm:grid-cols-3">
              <StatCell label="Runs" value={quotationDrafts?.runs?.length ?? 0} tone="amber" />
              <StatCell label="Drafts" value={latestQuotationRun?.drafts?.length ?? 0} tone="blue" />
              <StatCell label="Sent" value="0" tone="red" />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="flex flex-wrap gap-1.5">
                <BattleBadge tone="blue">draft-only</BattleBadge>
                <BattleBadge tone="neutral">not sent</BattleBadge>
                <BattleBadge tone="red">officialQuote false</BattleBadge>
                <BattleBadge tone="red">piGenerated false</BattleBadge>
                <BattleBadge tone="red">documentGenerated false</BattleBadge>
                <BattleBadge tone="neutral">no document generated</BattleBadge>
                <BattleBadge tone="red">autopilot still not ready</BattleBadge>
              </div>
              <div className="mt-3 grid gap-2">
                {(quotationDrafts?.runs || []).slice(0, 4).map((run) => (
                  <div key={run.id} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 md:grid-cols-[minmax(140px,0.8fr)_auto_minmax(160px,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-slate-200">{run.status}</p>
                      <p className="truncate text-[11px] text-slate-500">{run.drafts.length} Quotation Drafts</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <BattleBadge tone="blue">draft-only</BattleBadge>
                      <BattleBadge tone="neutral">not sent</BattleBadge>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">{run.createdAt}</p>
                  </div>
                ))}
                {(!quotationDrafts?.runs || quotationDrafts.runs.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="Quotation drafts will appear here after a Phase 8 packet is selected." zh="选择 Phase 8 开发包后，这里会显示 quotation draft。" />
                  </div>
                )}
              </div>
            </div>
          </BattlePanel>

          <BattlePanel title="Product Fit Recommendations" meta="local evidence / human review" tone="emerald">
            <div className="grid gap-2 p-3">
              {(latestDraft?.recommendedProducts || []).slice(0, 4).map((product) => (
                <div key={product.product} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{product.product}</p>
                      <p className="mt-1 text-[11px] text-slate-500">confidence {Math.round(product.confidence * 100)}%</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {product.riskFlags.slice(0, 4).map((flag) => (
                        <BattleBadge key={flag} tone={flag.includes("missing") ? "amber" : "neutral"}>{flag}</BattleBadge>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1.5">
                    {product.fitReasons.slice(0, 3).map((reason) => (
                      <p key={reason} className="text-[11px] leading-4 text-slate-400">{reason}</p>
                    ))}
                  </div>
                </div>
              ))}
              {!latestDraft && (
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                  <BattleText en="No product fit recommendations yet." zh="尚未生成客户适配产品推荐。" />
                </div>
              )}
            </div>
          </BattlePanel>
        </div>

        <BattlePanel title="Draft Lines" meta="Cost / Price / Margin References" tone="blue">
          <div className="grid gap-3 p-3 xl:grid-cols-[minmax(520px,1.25fr)_minmax(360px,0.95fr)]">
            <div className="grid gap-2">
              {draftLines.slice(0, 5).map((line) => (
                <div key={line.lineId} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{line.product}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-500">{line.specification || line.description}</p>
                    </div>
                    <BattleBadge tone="blue">draft-only</BattleBadge>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <StatCell label="Qty" value={line.quantity ?? "missing"} tone={line.quantity ? "emerald" : "amber"} />
                    <StatCell label="Price" value={line.unitPrice !== undefined ? `${line.currency || "USD"} ${line.unitPrice}` : "missing"} tone={line.unitPrice !== undefined ? "emerald" : "amber"} />
                    <StatCell label="Cost" value={line.unitCost !== undefined ? `${line.costCurrency || line.currency || "USD"} ${line.unitCost}` : "missing"} tone={line.unitCost !== undefined ? "emerald" : "amber"} />
                    <StatCell label="Margin" value={line.marginPercent !== undefined ? `${line.marginPercent}%` : "pending"} tone={line.marginPercent !== undefined ? "emerald" : "amber"} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(line.missingInfo || []).slice(0, 8).map((item) => (
                      <BattleBadge key={item} tone="amber">{item}</BattleBadge>
                    ))}
                  </div>
                </div>
              ))}
              {draftLines.length === 0 && (
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                  <BattleText en="No draft lines yet; low evidence packets stay in missing inquiry info state." zh="暂无草稿行；低证据开发包会停留在缺询盘信息状态。" />
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Cost / Price / Margin References</p>
                <div className="mt-2 grid gap-1.5">
                  {(latestDraft?.costPriceMarginReferences || ["No local reference selected yet."]).slice(0, 5).map((item) => (
                    <p key={item} className="text-[11px] leading-4 text-slate-400">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Assumptions</p>
                <div className="mt-2 grid gap-1.5">
                  {(latestDraft?.assumptions || ["No assumptions yet."]).slice(0, 5).map((item) => (
                    <p key={item} className="text-[11px] leading-4 text-slate-400">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Missing Info Checklist</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(latestDraft?.missingInfoChecklist || ["product", "quantity", "specs", "destination"]).slice(0, 12).map((item) => (
                    <BattleBadge key={item} tone="amber">{item}</BattleBadge>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Evidence References</p>
                <div className="mt-2 grid gap-1.5">
                  {(latestDraft?.evidenceRefs || ["No evidence reference selected yet."]).slice(0, 5).map((item) => (
                    <p key={item} className="truncate text-[11px] leading-4 text-slate-400">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Recommended Human Edits</p>
                <div className="mt-2 grid gap-1.5">
                  {(latestDraft?.recommendedHumanEdits || ["Review prospecting packet before quotation work."]).slice(0, 5).map((item) => (
                    <p key={item} className="text-[11px] leading-4 text-slate-400">{item}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </BattlePanel>

        <BattlePanel
          title="Outbound Approval Pipeline"
          meta="Phase 10 / approval required / not executed"
          tone="amber"
          action={
            <CommandButton type="button" variant="secondary" loading={approvalLoading} onClick={() => void requestOutboundApproval()}>
              <BattleText en="Request approval" zh="创建审批请求" />
            </CommandButton>
          }
        >
          <div className="grid gap-2 p-3 sm:grid-cols-4">
            <StatCell label="Approval Requests" value={outboundApprovals?.runs?.length ?? 0} tone="amber" />
            <StatCell label="Executed" value="0" tone="red" />
            <StatCell label="Sent" value="0" tone="red" />
            <StatCell label="CRM Writes" value="0" tone="red" />
          </div>
          <div className="border-t border-slate-800 p-3">
            <div className="flex flex-wrap gap-1.5">
              <BattleBadge tone="amber">approval required</BattleBadge>
              <BattleBadge tone="red">not executed</BattleBadge>
              <BattleBadge tone="neutral">not sent</BattleBadge>
              <BattleBadge tone="neutral">crm not written</BattleBadge>
              <BattleBadge tone="neutral">no document generated</BattleBadge>
              <BattleBadge tone="red">officialQuote false</BattleBadge>
              <BattleBadge tone="red">piGenerated false</BattleBadge>
              <BattleBadge tone="red">autopilot still not ready</BattleBadge>
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(420px,1.05fr)_minmax(420px,0.95fr)]">
              <div className="grid gap-2">
                {(outboundApprovals?.runs || []).slice(0, 4).map((run) => (
                  <div key={run.id} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-slate-200">{run.intendedActionType}</p>
                        <p className="mt-1 truncate text-[11px] text-slate-500">{run.candidates.length} Approval Requests</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <BattleBadge tone="amber">approval required</BattleBadge>
                        <BattleBadge tone="red">not executed</BattleBadge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                        <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Target Customer</p>
                        <p className="mt-1 truncate text-xs text-slate-200">{run.candidates[0]?.targetCustomer || "No target selected"}</p>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                        <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Side-effect Gate Status</p>
                        <p className="mt-1 truncate text-xs text-slate-200">{run.candidates[0]?.approvalStatus || "waiting for approval"}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {(!outboundApprovals?.runs || outboundApprovals.runs.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="Approval Requests will appear here after a Phase 9 draft is selected." zh="选择 Phase 9 草稿后，这里会显示审批请求。" />
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Recipient</p>
                  <p className="mt-1 truncate text-xs text-slate-200">
                    {[latestApproval?.recipient.name, latestApproval?.recipient.role, latestApproval?.recipient.email].filter(Boolean).join(" | ") || "No recipient selected"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Content Summary</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestApproval?.contentSummary || "No approval content summary yet."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Expected Action</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestApproval?.expectedAction || "No expected action selected."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Idempotency Key</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{latestApproval?.idempotencyKey || "No idempotency key yet."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Failure / Retry Strategy</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestApproval?.failureRetryStrategy || "Retry strategy will be shown after approval request creation."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Evidence</p>
                  <div className="mt-2 grid gap-1.5">
                    {(latestApproval?.evidenceRefs || ["No evidence attached yet."]).slice(0, 5).map((item) => (
                      <p key={item} className="truncate text-[11px] leading-4 text-slate-400">{item}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Risk Flags</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(latestApproval?.riskFlags || ["approval_required", "not_executed"]).slice(0, 10).map((flag) => (
                      <BattleBadge key={flag} tone={flag.includes("insufficient") || flag.includes("not_ready") ? "red" : "neutral"}>
                        {flag}
                      </BattleBadge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BattlePanel>

        <div className="grid gap-3 xl:grid-cols-[minmax(460px,1fr)_minmax(460px,1fr)]">
          <BattlePanel
            title="Autonomous Scheduler"
            meta="Phase 12 / dry-run only / no outbound sent"
            tone="blue"
            action={
              <CommandButton type="button" variant="secondary" loading={schedulerLoading} onClick={() => void runSchedulerTick()}>
                <BattleText en="Run scheduler tick" zh="运行 scheduler tick" />
              </CommandButton>
            }
          >
            <div className="grid gap-2 p-3 sm:grid-cols-4">
              <StatCell label="Scheduled Runs" value={scheduler?.runs?.length ?? 0} tone="blue" />
              <StatCell label="Failed / Retryable Work" value={schedulerFailedWork.length} tone={schedulerFailedWork.length ? "amber" : "neutral"} />
              <StatCell label="Executed" value="0" tone="red" />
              <StatCell label="Outbound" value="0" tone="red" />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="flex flex-wrap gap-1.5">
                <BattleBadge tone="blue">dry-run only</BattleBadge>
                <BattleBadge tone="neutral">draft-only</BattleBadge>
                <BattleBadge tone="red">not executed</BattleBadge>
                <BattleBadge tone="neutral">no outbound sent</BattleBadge>
                <BattleBadge tone="red">side-effect gate still required</BattleBadge>
                <BattleBadge tone="red">autopilot still not ready</BattleBadge>
              </div>
              <div className="mt-3 grid gap-2">
                {(scheduler?.runs || []).slice(0, 4).map((run) => (
                  <div key={run.id} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-slate-200">{run.mode} / {run.status}</p>
                        <p className="mt-1 truncate text-[11px] text-slate-500">{run.steps.length} scheduler step(s)</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <BattleBadge tone="blue">dry-run only</BattleBadge>
                        <BattleBadge tone="red">not executed</BattleBadge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-1.5">
                      {run.steps.slice(0, 4).map((step) => (
                        <div key={step.id} className="grid gap-2 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5 md:grid-cols-[minmax(160px,0.7fr)_auto_minmax(200px,1fr)] md:items-center">
                          <p className="truncate font-mono text-[11px] text-slate-300">{step.kind}</p>
                          <BattleBadge tone={step.status === "failed" ? "amber" : "neutral"}>{step.status}</BattleBadge>
                          <p className="truncate text-[11px] text-slate-500">{step.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(!scheduler?.runs || scheduler.runs.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="Scheduled Runs will appear after a dry-run scheduler tick." zh="运行 dry-run scheduler tick 后会显示调度记录。" />
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Failed / Retryable Work</p>
                <div className="mt-2 grid gap-1.5">
                  {schedulerFailedWork.slice(0, 4).map((item) => (
                    <div key={item.id} className="grid gap-2 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5 md:grid-cols-[minmax(140px,0.7fr)_auto_minmax(160px,1fr)] md:items-center">
                      <p className="truncate font-mono text-[11px] text-slate-300">{item.stepKind}</p>
                      <BattleBadge tone={item.retryable ? "amber" : "red"}>{item.retryable ? "retryable" : "failed"}</BattleBadge>
                      <p className="truncate text-[11px] text-slate-500">{item.reason}</p>
                    </div>
                  ))}
                  {schedulerFailedWork.length === 0 && (
                    <p className="text-[11px] text-slate-500">
                      <BattleText en="No failed or retryable scheduler work in this workspace." zh="当前工作区暂无失败或待重试调度工作。" />
                    </p>
                  )}
                </div>
              </div>
            </div>
          </BattlePanel>

          <BattlePanel title="Growth Metrics" meta="Phase 12 / dry-run data only" tone="emerald">
            <div className="grid gap-2 p-3 sm:grid-cols-4">
              <StatCell label="Candidate Count" value={metrics?.candidateCount ?? 0} tone="blue" />
              <StatCell label="Evidence Coverage" value={`${Math.round((metrics?.evidenceCoverage.coverageRate || 0) * 100)}%`} tone="emerald" />
              <StatCell label="Human Edit Rate" value={`${Math.round((metrics?.humanEditRate || 0) * 100)}%`} tone="amber" />
              <StatCell label="Retryable" value={metrics?.retryableFailedWorkCount ?? 0} tone={(metrics?.retryableFailedWorkCount || 0) > 0 ? "amber" : "neutral"} />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">ICP Distribution</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <StatCell label="Low" value={metrics?.icpDistribution.low ?? 0} tone="red" />
                    <StatCell label="Medium" value={metrics?.icpDistribution.medium ?? 0} tone="amber" />
                    <StatCell label="High" value={metrics?.icpDistribution.high ?? 0} tone="emerald" />
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Approve / Reject Rate</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <StatCell label="Approve Once" value={`${Math.round((metrics?.decisionRates.approveOnce || 0) * 100)}%`} tone="emerald" />
                    <StatCell label="Reject" value={`${Math.round((metrics?.decisionRates.reject || 0) * 100)}%`} tone="red" />
                    <StatCell label="Edit Then Approve" value={`${Math.round((metrics?.decisionRates.editThenApprove || 0) * 100)}%`} tone="amber" />
                    <StatCell label="Update Policy" value={`${Math.round((metrics?.decisionRates.updatePolicy || 0) * 100)}%`} tone="purple" />
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Reply Rate Placeholder</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{metrics?.replyRatePlaceholder.reason || "Reply Rate Placeholder waits for a real reviewed pilot; no outbound assumption."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Misjudgment Reasons</p>
                  <div className="mt-2 grid gap-1.5">
                    {(metrics?.misjudgmentReasonsPlaceholder || ["Misjudgment Reasons placeholder: requires reviewed outcomes after a real pilot."]).slice(0, 3).map((item) => (
                      <p key={item} className="text-[11px] leading-4 text-slate-400">{item}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 md:col-span-2">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Failure Reasons</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(metrics?.failureReasons.length ? metrics.failureReasons : ["No scheduler failure reasons recorded."]).slice(0, 8).map((item) => (
                      <BattleBadge key={item} tone={item.includes("No scheduler") ? "neutral" : "amber"}>{item}</BattleBadge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </BattlePanel>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(520px,1.25fr)_minmax(360px,0.95fr)]">
          <BattlePanel title="Autonomous Prospecting Preview" meta="dry-run / draft-only" tone="emerald">
            <div className="grid gap-2 p-3 lg:grid-cols-2">
              {steps.map((step, index) => (
                <div key={step.id} className="flex gap-3 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-slate-800 font-mono text-[11px] font-semibold text-slate-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-100">{step.label}</p>
                    <div className="mt-1">
                      <BattleBadge tone={step.mode === "review" ? "amber" : "blue"}>{step.mode}</BattleBadge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BattlePanel>

          <BattlePanel
            title="Decision Learning"
            meta="Decision Memory / No Auto-Approval"
            tone="neutral"
            action={
              <CommandButton type="button" variant="secondary" loading={decisionLoading} onClick={() => void recordSampleDecision()}>
                <BattleText en="Record sample decision" zh="记录样例决定" />
              </CommandButton>
            }
          >
            <div className="grid gap-2 p-3">
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-400">
                  <BattleText en="Decision Memory" zh="决策记忆" />
                </p>
                <BattleBadge tone="neutral">read-only until reviewed</BattleBadge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <BattleBadge tone="red">no auto-approval</BattleBadge>
                <BattleBadge tone="amber">high-risk still review</BattleBadge>
                <BattleBadge tone="red">side-effect gate still required</BattleBadge>
                <BattleBadge tone="red">autopilot still not ready</BattleBadge>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Human Decision</p>
                  <p className="mt-1 truncate text-xs text-slate-200">{latestDecisionRecord?.decision || "No human decision recorded yet."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">High-risk Guardrail</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">
                    {decisionLearningMemory?.guardrailSummary || "No Auto-Approval; high-risk still review; side-effect gate still required."}
                  </p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Human Edits</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestDecisionRecord?.humanEdits || "Human Edits will appear after a decision is recorded."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Rejection Reason</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestDecisionRecord?.rejectionReason || "No Rejection Reason recorded."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Policy Suggestion</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestDecisionRecord?.policySuggestion || "Policy Suggestion remains suggestion-only."}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Scope</p>
                  <p className="mt-1 truncate text-xs text-slate-200">{latestDecisionRecord?.scope || "candidate / workspace"}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 lg:col-span-2">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">Rollback Note</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestDecisionRecord?.rollbackNote || "Rollback Note will explain how to remove the memory without changing side-effect decisions."}</p>
                </div>
              </div>
              {learning.map((item) => (
                <div key={item.action} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-100">{item.label}</p>
                    <BattleBadge tone={item.action === "reject" ? "red" : item.action === "update_policy" ? "purple" : "amber"}>
                      {item.action}
                    </BattleBadge>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{item.effect}</p>
                </div>
              ))}
            </div>
          </BattlePanel>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}

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
import PageCommandPanel from "@/components/ui/PageCommandPanel";

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
  { actionKind: "email.send", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Review needed before customer-facing action." },
  { actionKind: "crm.write", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Review needed before customer record changes." },
  { actionKind: "quotation.generate", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Review needed before quote generation." },
  { actionKind: "pi.generate", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Review needed before PI generation." },
  { actionKind: "price.discount", decision: "review", risk: "high", requiresSideEffectGate: true, reason: "Review needed before price changes." },
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
  { action: "approve_once", label: "Confirm once", effect: "One-time confirmation." },
  { action: "edit_then_approve", label: "Edit then confirm", effect: "Manual edits before confirmation." },
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

function modeLabel(mode: AutomationMode, language: "en" | "zh") {
  const labels: Record<AutomationMode, { en: string; zh: string }> = {
    observe: { en: "Observe", zh: "观察建议" },
    assist: { en: "Assist", zh: "草稿协助" },
    autopilot: { en: "Auto-send", zh: "自动外发" },
    locked: { en: "Locked", zh: "全部锁定" },
  };
  return labels[mode][language];
}

function modeAvailabilityLabel(active: boolean, allowed: boolean, language: "en" | "zh") {
  if (active) return language === "zh" ? "当前模式" : "Current";
  if (allowed) return language === "zh" ? "可切换" : "Available";
  return language === "zh" ? "未开放" : "Not open";
}

function decisionLabel(decision: HitlPolicyDecision, language: "en" | "zh") {
  const labels: Record<HitlPolicyDecision, { en: string; zh: string }> = {
    auto: { en: "Auto", zh: "可自动处理" },
    review: { en: "Review", zh: "需要确认" },
    blocked: { en: "Blocked", zh: "已拦截" },
  };
  return labels[decision][language];
}

function riskLabel(risk: HitlRisk, language: "en" | "zh") {
  const labels: Record<HitlRisk, { en: string; zh: string }> = {
    low: { en: "Low", zh: "低" },
    medium: { en: "Medium", zh: "中" },
    high: { en: "High", zh: "高" },
    critical: { en: "Critical", zh: "极高" },
  };
  return labels[risk][language];
}

function actionKindLabel(value: string, language: "en" | "zh") {
  const labels: Record<string, { en: string; zh: string }> = {
    "lead.discovery": { en: "Lead discovery", zh: "发现潜在客户" },
    "prospect.enrichment": { en: "Company enrichment", zh: "补全公司资料" },
    "customer.scoring": { en: "Customer scoring", zh: "客户匹配评分" },
    "email.draft": { en: "Email draft", zh: "邮件草稿" },
    "landing_page.draft": { en: "Landing page draft", zh: "落地页草稿" },
    "video_script.draft": { en: "Video script draft", zh: "视频脚本草稿" },
    "outbound.sequence.request": { en: "Outbound request", zh: "外联请求" },
    "email.send": { en: "Send email", zh: "发送邮件" },
    "crm.write": { en: "CRM update", zh: "写入客户记录" },
    "quotation.generate": { en: "Create quotation", zh: "生成报价" },
    "pi.generate": { en: "Create PI", zh: "生成 PI" },
    "price.discount": { en: "Price discount", zh: "价格让利" },
    "payment.bank": { en: "Bank/payment action", zh: "银行/付款动作" },
    email_send: { en: "Send email", zh: "发送邮件" },
    crm_write: { en: "CRM update", zh: "写入客户记录" },
    quotation_generate: { en: "Create quotation", zh: "生成报价" },
    pi_generate: { en: "Create PI", zh: "生成 PI" },
    price_adjustment: { en: "Price adjustment", zh: "调整价格" },
  };
  return labels[value]?.[language] || value.replaceAll("_", " ").replaceAll(".", " / ");
}

function statusLabel(value: string | undefined, language: "en" | "zh") {
  if (!value) return language === "zh" ? "等待" : "Waiting";
  const labels: Record<string, { en: string; zh: string }> = {
    pending: { en: "Pending", zh: "待确认" },
    waiting: { en: "Waiting", zh: "等待确认" },
    blocked: { en: "Blocked", zh: "已拦截" },
    approved: { en: "Reviewed", zh: "已确认" },
    rejected: { en: "Rejected", zh: "已拒绝" },
    failed: { en: "Failed", zh: "失败" },
    retryable: { en: "Retryable", zh: "可重试" },
    completed: { en: "Completed", zh: "已完成" },
    running: { en: "Running", zh: "运行中" },
    created: { en: "Created", zh: "已创建" },
    review: { en: "Review", zh: "需要确认" },
    "dry-run": { en: "Preview", zh: "预览" },
    "draft-only": { en: "Draft only", zh: "只生成草稿" },
  };
  return labels[value]?.[language] || value.replaceAll("_", " ");
}

function flagLabel(value: string, language: "en" | "zh") {
  const labels: Record<string, { en: string; zh: string }> = {
    dry_run_only: { en: "Preview only", zh: "仅预览" },
    draft_only: { en: "Draft only", zh: "只生成草稿" },
    no_outbound_sent: { en: "No customer send", zh: "未外发" },
    not_executed: { en: "Not executed", zh: "未执行" },
    approval_required: { en: "Review required", zh: "需要确认" },
    insufficient_evidence: { en: "Insufficient evidence", zh: "证据不足" },
    not_ready: { en: "Not ready", zh: "未就绪" },
  };
  return labels[value]?.[language] || value.replaceAll("_", " ");
}

function prospectingStepLabel(step: ProspectingStep, language: "en" | "zh") {
  const labels: Record<string, { en: string; zh: string }> = {
    "discover-leads": { en: "Discover leads", zh: "发现潜在客户" },
    "enrich-company": { en: "Enrich company", zh: "补全公司资料" },
    "score-icp-fit": { en: "Score customer fit", zh: "评估客户匹配度" },
    "generate-opening-angle": { en: "Prepare opening angle", zh: "准备切入角度" },
    "draft-personalized-email": { en: "Draft personal email", zh: "起草个性化邮件" },
    "draft-landing-page": { en: "Draft landing page", zh: "起草落地页" },
    "draft-video-script": { en: "Draft video script", zh: "起草视频脚本" },
    "request-outbound-approval": { en: "Submit for review", zh: "提交外联确认" },
  };
  return labels[step.id]?.[language] || step.label;
}

function ModeCard({
  mode,
  active,
  allowed,
  label,
  description,
  language,
}: {
  mode: AutomationMode;
  active: boolean;
  allowed: boolean;
  label: string;
  description: string;
  language: "en" | "zh";
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
        <p className="text-[12px] font-semibold text-slate-100">{modeLabel(mode, language)}</p>
        <BattleBadge tone={modeTone(mode, active, allowed)}>
          {modeAvailabilityLabel(active, allowed, language)}
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
      setActionMessage(language === "zh" ? "开发预览未能创建" : "Lead preview was not created");
      return;
    }
      setActionMessage(language === "zh" ? "开发预览已生成，没有外联。" : "Lead preview created; no customer send.");
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
      setActionMessage(language === "zh" ? "先生成线索开发预览，再生成报价草稿。" : "Create a lead preview before creating a quotation draft.");
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
        setActionMessage(language === "zh" ? "报价草稿未能创建" : "Quotation draft was not created");
        return;
      }
      setActionMessage(language === "zh" ? "报价草稿已生成，尚未发送，也未生成正式文件。" : "Quotation draft created; not sent and no official document generated.");
      await load();
    } finally {
      setQuotationLoading(false);
    }
  }, [apiFetch, language, latestRun, load, primaryPacket]);

  const requestOutboundApproval = useCallback(async () => {
    if (!latestQuotationRun || !latestDraft) {
      setActionMessage(language === "zh" ? "先生成报价草稿，再提交外联确认。" : "Create a quotation draft before submitting outbound review.");
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
        setActionMessage(language === "zh" ? "外联确认未能创建" : "Outbound review was not created");
        return;
      }
      setActionMessage(language === "zh" ? "外联确认已创建，尚未执行，也未发送。" : "Outbound review created; not executed and not sent.");
      await load();
    } finally {
      setApprovalLoading(false);
    }
  }, [apiFetch, language, latestDraft, latestQuotationRun, load]);

  const recordSampleDecision = useCallback(async () => {
    if (!latestApprovalRun || !latestApproval) {
      setActionMessage(language === "zh" ? "先提交外联确认，再记录决策。" : "Submit an outbound review before recording a decision.");
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
          humanEdits: "Keep this as reviewed note only; do not send to customers.",
          rejectionReason: "",
          policySuggestion: "Require evidence-backed content before future review.",
          scope: "workspace",
          rollbackNote: "Remove this decision note; no customer-facing action changes.",
          operator: "local-operator",
          confidence: 0.75,
        }),
      });
      if (response.status === 401) setAccessIssue("beta_required");
      if (response.status === 403) setAccessIssue("workspace_denied");
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
      setActionMessage(language === "zh" ? "决策记录未能保存" : "Decision note was not saved");
      return;
    }
      setActionMessage(language === "zh" ? "决策记录已保存；不会自动外发，高风险仍需确认。" : "Decision note saved; no automatic send, high-risk still needs review.");
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
        setActionMessage(language === "zh" ? "计划检查未能创建" : "Plan check was not created");
        return;
      }
      setActionMessage(language === "zh" ? "计划检查已完成；没有外发，也没有执行客户可见动作。" : "Plan check completed; no customer send and no customer-facing action executed.");
      await load();
    } finally {
      setSchedulerLoading(false);
    }
  }, [apiFetch, language, load]);

  const commandContext = useMemo(() => ({
    workspaceId: data?.workspaceId,
    activeMode,
    readiness: data?.readiness,
    reviewQueue,
    primaryPacket: primaryPacket ? {
      id: primaryPacket.id,
      companyName: primaryPacket.candidate.companyName,
      confidence: primaryPacket.confidence,
      icpScore: primaryPacket.icpScore,
      openingAngle: primaryPacket.openingAngle,
      riskFlags: primaryPacket.riskFlags,
      recommendedNextStep: primaryPacket.recommendedNextStep,
    } : null,
    latestDraft: latestDraft ? {
      sourceDraftId: latestDraft.quotationDraft.id,
      candidate: latestDraft.candidate,
      confidence: latestDraft.confidence,
      riskFlags: latestDraft.riskFlags,
      missingInfoChecklist: latestDraft.missingInfoChecklist,
      recommendedHumanEdits: latestDraft.recommendedHumanEdits,
      draftLineCount: latestDraft.quotationDraftLines.length,
    } : null,
    latestApproval: latestApproval ? {
      id: latestApproval.id,
      targetCustomer: latestApproval.targetCustomer,
      approvalStatus: latestApproval.approvalStatus,
      expectedAction: latestApproval.expectedAction,
      sideEffectKind: latestApproval.sideEffectKind,
      riskFlags: latestApproval.riskFlags,
      notExecuted: latestApproval.notExecuted,
    } : null,
    latestDecisionRecord,
    latestSchedulerRun: latestSchedulerRun ? {
      id: latestSchedulerRun.id,
      status: latestSchedulerRun.status,
      steps: latestSchedulerRun.steps.map((step) => ({
        id: step.id,
        kind: step.kind,
        status: step.status,
        summary: step.summary,
        retryable: step.retryable,
      })),
    } : null,
    metrics,
  }), [
    activeMode,
    data?.readiness,
    data?.workspaceId,
    latestApproval,
    latestDecisionRecord,
    latestDraft,
    latestSchedulerRun,
    metrics,
    primaryPacket,
    reviewQueue,
  ]);
  const commandSummary = [
    primaryPacket ? `candidate ${primaryPacket.candidate.companyName}` : "no active candidate",
    latestDraft ? `${latestDraft.quotationDraftLines.length} draft line(s)` : "no active quote draft",
    latestApproval ? `review ${latestApproval.approvalStatus}` : "no active outbound review",
  ].join(" / ");

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Lead Development"
        zhTitle="线索开发"
        meta={data?.workspaceId ? `workspace ${data.workspaceId}` : "lead research and outbound preparation"}
        zhMeta={data?.workspaceId ? `工作区 ${data.workspaceId}` : "客户开发与外联准备"}
        active="/growth"
      >
        <BattleBadge tone="amber"><BattleText en="Preview only" zh="仅预览" /></BattleBadge>
        <BattleBadge tone="blue"><BattleText en="Draft only" zh="只生成草稿" /></BattleBadge>
        <BattleBadge tone="neutral"><BattleText en="No customer send" zh="未外发" /></BattleBadge>
        <BattleBadge tone="red"><BattleText en="Auto-send off" zh="自动外发未开放" /></BattleBadge>
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
          <BattlePanel
            title={language === "zh" ? "开发模式" : "Development Mode"}
            meta={language === "zh" ? "观察建议 / 草稿协助 / 自动外发 / 全部锁定" : "observe / assist / auto-send / locked"}
            tone="blue"
          >
            <div className="grid gap-2 p-3 sm:grid-cols-2">
              <ModeCard
                mode="observe"
                active={activeMode === "observe"}
                allowed={allowedModes.has("observe")}
                label={language === "zh" ? "只观察和推荐" : "Observe and recommend"}
                description={language === "zh" ? "不会执行客户可见动作。" : "No customer-facing action is executed."}
                language={language}
              />
              <ModeCard
                mode="assist"
                active={activeMode === "assist"}
                allowed={allowedModes.has("assist")}
                label={language === "zh" ? "生成草稿，外部动作需确认" : "Drafts with confirmation review"}
                description={language === "zh" ? "当前默认模式，草稿可自动生成。" : "Current default; drafts can be prepared automatically."}
                language={language}
              />
              <ModeCard
                mode="autopilot"
                active={false}
                allowed={false}
                label={language === "zh" ? "低风险自动，高风险需确认" : "Low-risk auto, review for risk"}
                description={language === "zh" ? "本阶段不开放。" : "Not open in this stage."}
                language={language}
              />
              <ModeCard
                mode="locked"
                active={activeMode === "locked"}
                allowed={allowedModes.has("locked")}
                label={language === "zh" ? "全部外部动作已锁定" : "External actions locked"}
                description={language === "zh" ? "可作为紧急刹车模式。" : "Emergency stop mode for outbound actions."}
                language={language}
              />
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "待确认事项" : "Review Items"}
            meta={language === "zh" ? "客户可见动作确认" : "customer-facing action checks"}
            tone="amber"
          >
            <div className="grid gap-2 p-3 sm:grid-cols-4">
              <StatCell label={language === "zh" ? "待确认" : "Pending"} value={reviewQueue?.waiting ?? 0} tone="amber" />
              <StatCell label={language === "zh" ? "已拦截" : "Blocked"} value={reviewQueue?.blocked ?? 0} tone="red" />
              <StatCell label={language === "zh" ? "失败/重试" : "Failed / Retry"} value={reviewQueue?.failedOrRetryable ?? 0} tone="red" />
              <StatCell label={language === "zh" ? "已确认" : "Reviewed"} value={reviewQueue?.approved ?? 0} tone="emerald" />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  <BattleText en="Recent Reviews" zh="最近复核" />
                </p>
                <a href="/agent-status" className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
                  <BattleText en="Open Task Progress" zh="打开任务进度" />
                </a>
              </div>
              <div className="grid gap-2">
                {(reviewQueue?.recent || []).slice(0, 4).map((item) => (
                  <div key={item.actionId} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 md:grid-cols-[minmax(130px,0.7fr)_auto_minmax(180px,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-200">{actionKindLabel(item.actionKind, language)}</p>
                      <p className="truncate text-[11px] text-slate-500">{item.title}</p>
                    </div>
                    <BattleBadge tone={item.status === "blocked" ? "red" : item.status === "approved" ? "emerald" : "amber"}>
                      {statusLabel(item.status, language)}
                    </BattleBadge>
                    <p className="truncate text-[11px] text-slate-500">{item.reason}</p>
                  </div>
                ))}
                {(!reviewQueue?.recent || reviewQueue.recent.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="No customer-facing action is waiting for review." zh="当前工作区暂无待确认的客户可见动作。" />
                  </div>
                )}
              </div>
            </div>
          </BattlePanel>
        </div>

        <BattlePanel
          title={language === "zh" ? "动作边界" : "Action Boundaries"}
          meta={language === "zh" ? "可自动处理 / 需要确认 / 已拦截" : "auto / review / blocked"}
          tone="purple"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">{language === "zh" ? "动作" : "Action"}</th>
                  <th className="px-3 py-2 font-semibold">{language === "zh" ? "处理方式" : "Decision"}</th>
                  <th className="px-3 py-2 font-semibold">{language === "zh" ? "风险" : "Risk"}</th>
                  <th className="px-3 py-2 font-semibold">{language === "zh" ? "执行边界" : "Boundary"}</th>
                  <th className="px-3 py-2 font-semibold">{language === "zh" ? "说明" : "Reason"}</th>
                </tr>
              </thead>
              <tbody>
                {policy.map((rule) => (
                  <tr key={rule.actionKind} className="border-b border-slate-800/70 last:border-0">
                    <td className="px-3 py-2 text-slate-200">{actionKindLabel(rule.actionKind, language)}</td>
                    <td className="px-3 py-2">
                      <BattleBadge tone={decisionTone(rule.decision)}>{decisionLabel(rule.decision, language)}</BattleBadge>
                    </td>
                    <td className="px-3 py-2">
                      <BattleBadge tone={riskTone(rule.risk)}>{riskLabel(rule.risk, language)}</BattleBadge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                      {rule.requiresSideEffectGate
                        ? (language === "zh" ? "确认后执行" : "Review before action")
                        : (language === "zh" ? "仅本地处理" : "Local only")}
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
            title={language === "zh" ? "线索开发记录" : "Lead Development Runs"}
            meta={language === "zh" ? "仅预览 / 只生成草稿 / 未外发" : "preview only / draft only / no customer send"}
            tone="blue"
            action={
              <CommandButton type="button" variant="secondary" loading={dryRunLoading} onClick={() => void startDryRun()}>
                <BattleText en="Create preview" zh="生成开发预览" />
              </CommandButton>
            }
          >
            <div className="grid gap-2 p-3 sm:grid-cols-3">
              <StatCell label={language === "zh" ? "开发记录" : "Runs"} value={prospecting?.runs?.length ?? 0} tone="blue" />
              <StatCell label={language === "zh" ? "候选客户" : "Candidates"} value={candidatePackets.length} tone="emerald" />
              <StatCell label={language === "zh" ? "外发" : "Sent"} value="0" tone="red" />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="grid gap-2">
                {(prospecting?.runs || []).slice(0, 4).map((run) => (
                  <div key={run.id} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 md:grid-cols-[minmax(140px,0.8fr)_auto_minmax(160px,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-200">{statusLabel(run.status, language)}</p>
                      <p className="truncate text-[11px] text-slate-500">{run.sourceSummary}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <BattleBadge tone="blue"><BattleText en="Preview" zh="预览" /></BattleBadge>
                      <BattleBadge tone="neutral"><BattleText en="Draft only" zh="只生成草稿" /></BattleBadge>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">
                      {language === "zh" ? `${run.packets.length} 个候选客户` : `${run.packets.length} candidates`}
                    </p>
                  </div>
                ))}
                {(!prospecting?.runs || prospecting.runs.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="No lead development preview yet. Create one to inspect local evidence." zh="暂无线索开发预览。先生成一次，检查本地证据。" />
                  </div>
                )}
              </div>
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "候选客户" : "Candidate Customers"}
            meta={language === "zh" ? "证据 / 可信度 / 匹配度" : "evidence / confidence / fit score"}
            tone="emerald"
          >
            <div className="grid gap-2 p-3">
              {candidatePackets.slice(0, 4).map((packet) => (
                <div key={packet.id} className="min-w-0 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{packet.candidate.companyName}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-500">
                        {[packet.candidate.industry, packet.candidate.country, packet.candidate.website].filter(Boolean).join(" | ") || (language === "zh" ? "仅本地证据" : "local evidence only")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <BattleBadge tone="blue">
                        {language === "zh" ? `证据可信度 ${Math.round(packet.confidence * 100)}%` : `Evidence ${Math.round(packet.confidence * 100)}%`}
                      </BattleBadge>
                      <BattleBadge tone={packet.icpScore.band === "high" ? "emerald" : packet.icpScore.band === "medium" ? "amber" : "red"}>
                        {language === "zh" ? `匹配度 ${packet.icpScore.score}` : `Fit score ${packet.icpScore.score}`}
                      </BattleBadge>
                    </div>
                  </div>
                  <div className="mt-3 grid min-w-0 gap-2 lg:grid-cols-2">
                    <div className="min-w-0 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                        {language === "zh" ? "切入角度" : "Opening Angle"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-200">{packet.openingAngle.headline}</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">{packet.openingAngle.rationale}</p>
                    </div>
                    <div className="min-w-0 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                        {language === "zh" ? "下一步" : "Next Step"}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">{packet.recommendedNextStep}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {packet.riskFlags.slice(0, 5).map((flag) => (
                          <BattleBadge key={flag} tone={flag.includes("insufficient") || flag.includes("not_ready") ? "red" : "neutral"}>
                            {flagLabel(flag, language)}
                          </BattleBadge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {candidatePackets.length === 0 && (
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                  <BattleText en="Candidate customers will appear here after a preview is created." zh="生成开发预览后，这里会显示候选客户。" />
                </div>
              )}
            </div>
          </BattlePanel>
        </div>

        <BattlePanel
          title={language === "zh" ? "风险提醒" : "Risk Notes"}
          meta={language === "zh" ? "证据状态与客户可见动作边界" : "evidence state and customer-facing boundaries"}
          tone={primaryPacket?.riskFlags?.includes("insufficient_evidence") ? "red" : "amber"}
        >
          <div className="grid min-w-0 gap-2 p-3 md:grid-cols-[minmax(240px,0.8fr)_minmax(320px,1.2fr)]">
            <div className="min-w-0 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
              <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                {language === "zh" ? "风险提醒" : "Risk Notes"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(primaryPacket?.riskFlags || ["dry_run_only", "draft_only", "no_outbound_sent"]).map((flag) => (
                  <BattleBadge key={flag} tone={flag.includes("insufficient") || flag.includes("not_ready") ? "red" : "neutral"}>
                    {flagLabel(flag, language)}
                  </BattleBadge>
                ))}
              </div>
            </div>
            <div className="min-w-0 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
              <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                {language === "zh" ? "证据可信度" : "Evidence / Confidence"}
              </p>
              <div className="mt-2 grid gap-2">
                {(primaryPacket?.evidence || []).slice(0, 3).map((item) => (
                  <div key={`${item.kind}:${item.label}`} className="flex min-w-0 items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5">
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
            title={language === "zh" ? "报价草稿" : "Quotation Drafts"}
            meta={language === "zh" ? "只生成草稿 / 未外发" : "draft only / not sent"}
            tone="amber"
            action={
              <CommandButton type="button" variant="secondary" loading={quotationLoading} onClick={() => void startQuotationDraft()}>
                <BattleText en="Create quotation draft" zh="生成报价草稿" />
              </CommandButton>
            }
          >
            <div className="grid gap-2 p-3 sm:grid-cols-3">
              <StatCell label={language === "zh" ? "生成记录" : "Runs"} value={quotationDrafts?.runs?.length ?? 0} tone="amber" />
              <StatCell label={language === "zh" ? "草稿" : "Drafts"} value={latestQuotationRun?.drafts?.length ?? 0} tone="blue" />
              <StatCell label={language === "zh" ? "已发送" : "Sent"} value="0" tone="red" />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="flex flex-wrap gap-1.5">
                <BattleBadge tone="blue"><BattleText en="Draft only" zh="只生成草稿" /></BattleBadge>
                <BattleBadge tone="neutral"><BattleText en="Not sent" zh="未发送" /></BattleBadge>
                <BattleBadge tone="red"><BattleText en="No official quotation" zh="未生成正式报价" /></BattleBadge>
                <BattleBadge tone="red"><BattleText en="No PI" zh="未生成 PI" /></BattleBadge>
                <BattleBadge tone="neutral"><BattleText en="No document" zh="未生成文件" /></BattleBadge>
                <BattleBadge tone="red"><BattleText en="Auto-send off" zh="自动外发未开放" /></BattleBadge>
              </div>
              <div className="mt-3 grid gap-2">
                {(quotationDrafts?.runs || []).slice(0, 4).map((run) => (
                  <div key={run.id} className="grid gap-2 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 md:grid-cols-[minmax(140px,0.8fr)_auto_minmax(160px,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-200">{statusLabel(run.status, language)}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {language === "zh" ? `${run.drafts.length} 份报价草稿` : `${run.drafts.length} quotation drafts`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <BattleBadge tone="blue"><BattleText en="Draft only" zh="只生成草稿" /></BattleBadge>
                      <BattleBadge tone="neutral"><BattleText en="Not sent" zh="未发送" /></BattleBadge>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">{run.createdAt}</p>
                  </div>
                ))}
                {(!quotationDrafts?.runs || quotationDrafts.runs.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="Quotation drafts will appear here after a candidate customer is selected." zh="选择候选客户后，这里会显示报价草稿。" />
                  </div>
                )}
              </div>
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "产品匹配建议" : "Product Fit Recommendations"}
            meta={language === "zh" ? "本地证据 / 复核" : "local evidence / review"}
            tone="emerald"
          >
            <div className="grid gap-2 p-3">
              {(latestDraft?.recommendedProducts || []).slice(0, 4).map((product) => (
                <div key={product.product} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{product.product}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {language === "zh" ? `可信度 ${Math.round(product.confidence * 100)}%` : `confidence ${Math.round(product.confidence * 100)}%`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {product.riskFlags.slice(0, 4).map((flag) => (
                        <BattleBadge key={flag} tone={flag.includes("missing") ? "amber" : "neutral"}>{flagLabel(flag, language)}</BattleBadge>
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

        <BattlePanel
          title={language === "zh" ? "报价明细草稿" : "Draft Lines"}
          meta={language === "zh" ? "成本 / 价格 / 毛利参考" : "cost / price / margin references"}
          tone="blue"
        >
          <div className="grid gap-3 p-3 xl:grid-cols-[minmax(520px,1.25fr)_minmax(360px,0.95fr)]">
            <div className="grid gap-2">
              {draftLines.slice(0, 5).map((line) => (
                <div key={line.lineId} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{line.product}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-500">{line.specification || line.description}</p>
                    </div>
                    <BattleBadge tone="blue"><BattleText en="Draft only" zh="只生成草稿" /></BattleBadge>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <StatCell label={language === "zh" ? "数量" : "Qty"} value={line.quantity ?? (language === "zh" ? "缺失" : "missing")} tone={line.quantity ? "emerald" : "amber"} />
                    <StatCell label={language === "zh" ? "价格" : "Price"} value={line.unitPrice !== undefined ? `${line.currency || "USD"} ${line.unitPrice}` : (language === "zh" ? "缺失" : "missing")} tone={line.unitPrice !== undefined ? "emerald" : "amber"} />
                    <StatCell label={language === "zh" ? "成本" : "Cost"} value={line.unitCost !== undefined ? `${line.costCurrency || line.currency || "USD"} ${line.unitCost}` : (language === "zh" ? "缺失" : "missing")} tone={line.unitCost !== undefined ? "emerald" : "amber"} />
                    <StatCell label={language === "zh" ? "毛利" : "Margin"} value={line.marginPercent !== undefined ? `${line.marginPercent}%` : (language === "zh" ? "待确认" : "pending")} tone={line.marginPercent !== undefined ? "emerald" : "amber"} />
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
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  {language === "zh" ? "成本 / 价格 / 毛利参考" : "Cost / Price / Margin References"}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {(latestDraft?.costPriceMarginReferences || ["No local reference selected yet."]).slice(0, 5).map((item) => (
                    <p key={item} className="text-[11px] leading-4 text-slate-400">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  {language === "zh" ? "关键假设" : "Assumptions"}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {(latestDraft?.assumptions || ["No assumptions yet."]).slice(0, 5).map((item) => (
                    <p key={item} className="text-[11px] leading-4 text-slate-400">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  {language === "zh" ? "缺失信息" : "Missing Info"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(latestDraft?.missingInfoChecklist || ["product", "quantity", "specs", "destination"]).slice(0, 12).map((item) => (
                    <BattleBadge key={item} tone="amber">{item}</BattleBadge>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  {language === "zh" ? "证据参考" : "Evidence References"}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {(latestDraft?.evidenceRefs || ["No evidence reference selected yet."]).slice(0, 5).map((item) => (
                    <p key={item} className="truncate text-[11px] leading-4 text-slate-400">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  {language === "zh" ? "建议人工修改" : "Recommended Edits"}
                </p>
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
          title={language === "zh" ? "外联确认" : "Outbound Review"}
          meta={language === "zh" ? "需要确认 / 未执行 / 未发送" : "review required / not executed / not sent"}
          tone="amber"
          action={
            <CommandButton type="button" variant="secondary" loading={approvalLoading} onClick={() => void requestOutboundApproval()}>
              <BattleText en="Submit for review" zh="提交外联确认" />
            </CommandButton>
          }
        >
          <div className="grid gap-2 p-3 sm:grid-cols-4">
            <StatCell label={language === "zh" ? "确认事项" : "Review Items"} value={outboundApprovals?.runs?.length ?? 0} tone="amber" />
            <StatCell label={language === "zh" ? "已执行" : "Executed"} value="0" tone="red" />
            <StatCell label={language === "zh" ? "已发送" : "Sent"} value="0" tone="red" />
            <StatCell label={language === "zh" ? "客户记录写入" : "CRM Writes"} value="0" tone="red" />
          </div>
          <div className="border-t border-slate-800 p-3">
            <div className="flex flex-wrap gap-1.5">
              <BattleBadge tone="amber"><BattleText en="Review required" zh="需要确认" /></BattleBadge>
              <BattleBadge tone="red"><BattleText en="Not executed" zh="未执行" /></BattleBadge>
              <BattleBadge tone="neutral"><BattleText en="Not sent" zh="未发送" /></BattleBadge>
              <BattleBadge tone="neutral"><BattleText en="Customer record not updated" zh="未写入客户记录" /></BattleBadge>
              <BattleBadge tone="neutral"><BattleText en="No document" zh="未生成文件" /></BattleBadge>
              <BattleBadge tone="red"><BattleText en="Auto-send off" zh="自动外发未开放" /></BattleBadge>
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(420px,1.05fr)_minmax(420px,0.95fr)]">
              <div className="grid gap-2">
                {(outboundApprovals?.runs || []).slice(0, 4).map((run) => (
                  <div key={run.id} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-200">{actionKindLabel(run.intendedActionType, language)}</p>
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {language === "zh" ? `${run.candidates.length} 项确认事项` : `${run.candidates.length} review items`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <BattleBadge tone="amber"><BattleText en="Review required" zh="需要确认" /></BattleBadge>
                        <BattleBadge tone="red"><BattleText en="Not executed" zh="未执行" /></BattleBadge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                        <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                          {language === "zh" ? "目标客户" : "Target Customer"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-200">{run.candidates[0]?.targetCustomer || (language === "zh" ? "未选择目标客户" : "No target selected")}</p>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                        <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                          {language === "zh" ? "确认状态" : "Review Status"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-200">{statusLabel(run.candidates[0]?.approvalStatus || "waiting", language)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {(!outboundApprovals?.runs || outboundApprovals.runs.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="Review items will appear here after a quotation draft is selected." zh="选择报价草稿后，这里会显示外联确认事项。" />
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "收件人" : "Recipient"}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-200">
                    {[latestApproval?.recipient.name, latestApproval?.recipient.role, latestApproval?.recipient.email].filter(Boolean).join(" | ") || (language === "zh" ? "未选择收件人" : "No recipient selected")}
                  </p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "内容摘要" : "Content Summary"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestApproval?.contentSummary || (language === "zh" ? "暂无内容摘要。" : "No content summary yet.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "预计动作" : "Expected Action"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestApproval?.expectedAction || (language === "zh" ? "暂未选择预计动作。" : "No expected action selected.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "唯一记录号" : "Reference ID"}
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{latestApproval?.idempotencyKey || (language === "zh" ? "暂无记录号" : "No reference ID yet.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "失败处理" : "Failure / Retry Strategy"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestApproval?.failureRetryStrategy || (language === "zh" ? "提交确认后会显示失败处理方案。" : "Retry strategy will appear after review creation.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "证据" : "Evidence"}
                  </p>
                  <div className="mt-2 grid gap-1.5">
                    {(latestApproval?.evidenceRefs || [language === "zh" ? "暂无证据。" : "No evidence attached yet."]).slice(0, 5).map((item) => (
                      <p key={item} className="truncate text-[11px] leading-4 text-slate-400">{item}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "风险提醒" : "Risk Notes"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(latestApproval?.riskFlags || ["approval_required", "not_executed"]).slice(0, 10).map((flag) => (
                      <BattleBadge key={flag} tone={flag.includes("insufficient") || flag.includes("not_ready") ? "red" : "neutral"}>
                        {flagLabel(flag, language)}
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
            title={language === "zh" ? "自动开发计划" : "Development Plan"}
            meta={language === "zh" ? "仅预览 / 只生成草稿 / 未外发" : "preview only / draft only / no customer send"}
            tone="blue"
            action={
              <CommandButton type="button" variant="secondary" loading={schedulerLoading} onClick={() => void runSchedulerTick()}>
                <BattleText en="Run plan check" zh="运行计划检查" />
              </CommandButton>
            }
          >
            <div className="grid gap-2 p-3 sm:grid-cols-4">
              <StatCell label={language === "zh" ? "计划记录" : "Plan Runs"} value={scheduler?.runs?.length ?? 0} tone="blue" />
              <StatCell label={language === "zh" ? "失败/重试" : "Failed / Retry"} value={schedulerFailedWork.length} tone={schedulerFailedWork.length ? "amber" : "neutral"} />
              <StatCell label={language === "zh" ? "已执行" : "Executed"} value="0" tone="red" />
              <StatCell label={language === "zh" ? "外发" : "Sent"} value="0" tone="red" />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="flex flex-wrap gap-1.5">
                <BattleBadge tone="blue"><BattleText en="Preview only" zh="仅预览" /></BattleBadge>
                <BattleBadge tone="neutral"><BattleText en="Draft only" zh="只生成草稿" /></BattleBadge>
                <BattleBadge tone="red"><BattleText en="Not executed" zh="未执行" /></BattleBadge>
                <BattleBadge tone="neutral"><BattleText en="No customer send" zh="未外发" /></BattleBadge>
                <BattleBadge tone="red"><BattleText en="Review still required" zh="仍需确认" /></BattleBadge>
                <BattleBadge tone="red"><BattleText en="Auto-send off" zh="自动外发未开放" /></BattleBadge>
              </div>
              <div className="mt-3 grid gap-2">
                {(scheduler?.runs || []).slice(0, 4).map((run) => (
                  <div key={run.id} className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-200">{statusLabel(run.status, language)}</p>
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {language === "zh" ? `${run.steps.length} 个计划步骤` : `${run.steps.length} plan steps`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <BattleBadge tone="blue"><BattleText en="Preview only" zh="仅预览" /></BattleBadge>
                        <BattleBadge tone="red"><BattleText en="Not executed" zh="未执行" /></BattleBadge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-1.5">
                      {run.steps.slice(0, 4).map((step) => (
                        <div key={step.id} className="grid gap-2 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5 md:grid-cols-[minmax(160px,0.7fr)_auto_minmax(200px,1fr)] md:items-center">
                          <p className="truncate text-[11px] font-semibold text-slate-300">{actionKindLabel(step.kind, language)}</p>
                          <BattleBadge tone={step.status === "failed" ? "amber" : "neutral"}>{statusLabel(step.status, language)}</BattleBadge>
                          <p className="truncate text-[11px] text-slate-500">{step.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(!scheduler?.runs || scheduler.runs.length === 0) && (
                  <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 text-xs text-slate-500">
                    <BattleText en="Plan checks will appear here after a preview run." zh="运行计划检查后，这里会显示调度记录。" />
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                  {language === "zh" ? "失败/可重试任务" : "Failed / Retryable Work"}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {schedulerFailedWork.slice(0, 4).map((item) => (
                    <div key={item.id} className="grid gap-2 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5 md:grid-cols-[minmax(140px,0.7fr)_auto_minmax(160px,1fr)] md:items-center">
                      <p className="truncate text-[11px] font-semibold text-slate-300">{actionKindLabel(item.stepKind, language)}</p>
                      <BattleBadge tone={item.retryable ? "amber" : "red"}>
                        {item.retryable ? (language === "zh" ? "可重试" : "Retryable") : (language === "zh" ? "失败" : "Failed")}
                      </BattleBadge>
                      <p className="truncate text-[11px] text-slate-500">{item.reason}</p>
                    </div>
                  ))}
                  {schedulerFailedWork.length === 0 && (
                    <p className="text-[11px] text-slate-500">
                      <BattleText en="No failed or retryable plan work in this workspace." zh="当前工作区暂无失败或待重试计划任务。" />
                    </p>
                  )}
                </div>
              </div>
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "开发指标" : "Development Metrics"}
            meta={language === "zh" ? "预览数据" : "preview data"}
            tone="emerald"
          >
            <div className="grid gap-2 p-3 sm:grid-cols-4">
              <StatCell label={language === "zh" ? "候选客户" : "Candidates"} value={metrics?.candidateCount ?? 0} tone="blue" />
              <StatCell label={language === "zh" ? "证据覆盖" : "Evidence Coverage"} value={`${Math.round((metrics?.evidenceCoverage.coverageRate || 0) * 100)}%`} tone="emerald" />
              <StatCell label={language === "zh" ? "人工修改率" : "Manual Edit Rate"} value={`${Math.round((metrics?.humanEditRate || 0) * 100)}%`} tone="amber" />
              <StatCell label={language === "zh" ? "可重试" : "Retryable"} value={metrics?.retryableFailedWorkCount ?? 0} tone={(metrics?.retryableFailedWorkCount || 0) > 0 ? "amber" : "neutral"} />
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "匹配度分布" : "Fit Distribution"}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <StatCell label={language === "zh" ? "低" : "Low"} value={metrics?.icpDistribution.low ?? 0} tone="red" />
                    <StatCell label={language === "zh" ? "中" : "Medium"} value={metrics?.icpDistribution.medium ?? 0} tone="amber" />
                    <StatCell label={language === "zh" ? "高" : "High"} value={metrics?.icpDistribution.high ?? 0} tone="emerald" />
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "确认 / 拒绝比例" : "Review Decision Rate"}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <StatCell label={language === "zh" ? "直接确认" : "Confirm Once"} value={`${Math.round((metrics?.decisionRates.approveOnce || 0) * 100)}%`} tone="emerald" />
                    <StatCell label={language === "zh" ? "拒绝" : "Reject"} value={`${Math.round((metrics?.decisionRates.reject || 0) * 100)}%`} tone="red" />
                    <StatCell label={language === "zh" ? "修改后确认" : "Edit Then Confirm"} value={`${Math.round((metrics?.decisionRates.editThenApprove || 0) * 100)}%`} tone="amber" />
                    <StatCell label={language === "zh" ? "更新规则" : "Update Policy"} value={`${Math.round((metrics?.decisionRates.updatePolicy || 0) * 100)}%`} tone="purple" />
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "回复率" : "Reply Rate"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{metrics?.replyRatePlaceholder.reason || (language === "zh" ? "等待真实复核试点后统计；当前不做外发假设。" : "Waits for a real reviewed pilot; no outbound assumption.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "误判原因" : "Misjudgment Reasons"}
                  </p>
                  <div className="mt-2 grid gap-1.5">
                    {(metrics?.misjudgmentReasonsPlaceholder || [language === "zh" ? "真实试点后会基于复核结果归纳误判原因。" : "Requires reviewed outcomes after a real pilot."]).slice(0, 3).map((item) => (
                      <p key={item} className="text-[11px] leading-4 text-slate-400">{item}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 md:col-span-2">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "失败原因" : "Failure Reasons"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(metrics?.failureReasons.length ? metrics.failureReasons : [language === "zh" ? "暂无失败原因记录。" : "No plan failure reasons recorded."]).slice(0, 8).map((item) => (
                      <BattleBadge key={item} tone={item.includes("No scheduler") ? "neutral" : "amber"}>{item}</BattleBadge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </BattlePanel>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(520px,1.25fr)_minmax(360px,0.95fr)]">
          <BattlePanel
            title={language === "zh" ? "开发流程" : "Development Flow"}
            meta={language === "zh" ? "仅预览 / 只生成草稿" : "preview only / draft only"}
            tone="emerald"
          >
            <div className="grid gap-2 p-3 lg:grid-cols-2">
              {steps.map((step, index) => (
                <div key={step.id} className="flex gap-3 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-slate-800 font-mono text-[11px] font-semibold text-slate-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-100">{prospectingStepLabel(step, language)}</p>
                    <div className="mt-1">
                      <BattleBadge tone={step.mode === "review" ? "amber" : "blue"}>{statusLabel(step.mode, language)}</BattleBadge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "决策记录" : "Decision Notes"}
            meta={language === "zh" ? "复核记录 / 不自动外发" : "reviewed notes / no automatic send"}
            tone="neutral"
            action={
              <CommandButton type="button" variant="secondary" loading={decisionLoading} onClick={() => void recordSampleDecision()}>
                <BattleText en="Record sample decision" zh="记录样例决策" />
              </CommandButton>
            }
          >
            <div className="grid gap-2 p-3">
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-400">
                  <BattleText en="Decision Notes" zh="决策记录" />
                </p>
                <BattleBadge tone="neutral"><BattleText en="Read-only until reviewed" zh="复核前只读" /></BattleBadge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <BattleBadge tone="red"><BattleText en="No automatic send" zh="不自动外发" /></BattleBadge>
                <BattleBadge tone="amber"><BattleText en="High-risk still needs review" zh="高风险仍需确认" /></BattleBadge>
                <BattleBadge tone="red"><BattleText en="Review still required" zh="仍需确认" /></BattleBadge>
                <BattleBadge tone="red"><BattleText en="Auto-send off" zh="自动外发未开放" /></BattleBadge>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "人工决策" : "Manual Decision"}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-200">{latestDecisionRecord?.decision || (language === "zh" ? "暂无人工决策记录。" : "No manual decision recorded yet.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "高风险边界" : "High-risk Boundary"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">
                    {decisionLearningMemory?.guardrailSummary || (language === "zh" ? "不会自动外发；高风险仍需复核；客户可见动作仍需确认。" : "No automatic send; high-risk still needs review; customer-facing action still requires review.")}
                  </p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "人工修改" : "Manual Edits"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestDecisionRecord?.humanEdits || (language === "zh" ? "记录决策后会显示人工修改。" : "Manual edits will appear after a decision is recorded.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "拒绝原因" : "Rejection Reason"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestDecisionRecord?.rejectionReason || (language === "zh" ? "暂无拒绝原因。" : "No rejection reason recorded.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "规则建议" : "Policy Suggestion"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestDecisionRecord?.policySuggestion || (language === "zh" ? "规则建议只作为参考，不会自动执行。" : "Policy suggestion remains suggestion-only.")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "适用范围" : "Scope"}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-200">{latestDecisionRecord?.scope || (language === "zh" ? "候选客户 / 工作区" : "candidate / workspace")}</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3 lg:col-span-2">
                  <p className="font-mono text-[11px] font-semibold uppercase text-slate-500">
                    {language === "zh" ? "撤回说明" : "Rollback Note"}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{latestDecisionRecord?.rollbackNote || (language === "zh" ? "撤回说明会解释如何移除记录，且不影响客户可见动作。" : "Rollback note explains how to remove the note without changing customer-facing decisions.")}</p>
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
        <PageCommandPanel
          page="growth"
          surface="growth"
          mode="review"
          target={latestApproval
            ? {
              type: "workflow",
              id: latestApproval.id,
              label: latestApproval.targetCustomer,
            }
            : primaryPacket
              ? {
                type: "workflow",
                id: primaryPacket.id,
                label: primaryPacket.candidate.companyName,
              }
              : { type: "none" }}
          summary={commandSummary}
          context={commandContext}
          placeholder="Ask Jaden to review growth risks, compare draft evidence, or prepare an outbound approval note"
          zhPlaceholder="让 Jaden 复核开发风险、对比草稿证据，或准备外联确认说明"
        />
      </BattlePageBody>
    </BattlePageShell>
  );
}

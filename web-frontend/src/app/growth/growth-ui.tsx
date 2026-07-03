// Stateless helpers, fallback data, and presentational sub-components for /growth.
// Extracted from page.tsx. No state, no data fetching — safe to render anywhere.
import { cx } from "@/components/battle-station/theme";
import {
  BattleBadge,
  BattlePanel,
  BattleText,
  type BattleTone,
} from "@/components/ui/BattlePage";
import type {
  AutomationMode,
  DecisionLearningOption,
  HitlPolicyDecision,
  HitlRisk,
  PolicyRule,
  ProspectingStep,
} from "./types";

export const POLICY_FALLBACK: PolicyRule[] = [
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

export const PREVIEW_FALLBACK: ProspectingStep[] = [
  { id: "discover-leads", label: "discover leads", mode: "dry-run" },
  { id: "enrich-company", label: "enrich company", mode: "dry-run" },
  { id: "score-icp-fit", label: "score ICP fit", mode: "dry-run" },
  { id: "generate-opening-angle", label: "generate opening angle", mode: "draft-only" },
  { id: "draft-personalized-email", label: "draft personalized email", mode: "draft-only" },
  { id: "draft-landing-page", label: "draft landing page", mode: "draft-only" },
  { id: "draft-video-script", label: "draft video script", mode: "draft-only" },
  { id: "request-outbound-approval", label: "request outbound approval", mode: "review" },
];

export const LEARNING_FALLBACK: DecisionLearningOption[] = [
  { action: "approve_once", label: "Confirm once", effect: "One-time confirmation." },
  { action: "edit_then_approve", label: "Edit then confirm", effect: "Manual edits before confirmation." },
  { action: "reject", label: "Reject", effect: "Stop the proposed action." },
  { action: "update_policy", label: "Update policy", effect: "Save the decision pattern later." },
];

export function decisionTone(decision: HitlPolicyDecision): BattleTone {
  if (decision === "auto") return "emerald";
  if (decision === "review") return "amber";
  return "red";
}

export function riskTone(risk: HitlRisk): BattleTone {
  if (risk === "critical") return "red";
  if (risk === "high") return "amber";
  if (risk === "medium") return "blue";
  return "emerald";
}

export function modeTone(mode: AutomationMode, active: boolean, allowed: boolean): BattleTone {
  if (!allowed) return "red";
  if (active) return "emerald";
  if (mode === "locked") return "amber";
  return "blue";
}

export function modeLabel(mode: AutomationMode, language: "en" | "zh") {
  const labels: Record<AutomationMode, { en: string; zh: string }> = {
    observe: { en: "Observe", zh: "观察建议" },
    assist: { en: "Assist", zh: "草稿协助" },
    autopilot: { en: "Auto-send", zh: "自动外发" },
    locked: { en: "Locked", zh: "全部锁定" },
  };
  return labels[mode][language];
}

export function modeAvailabilityLabel(active: boolean, allowed: boolean, language: "en" | "zh") {
  if (active) return language === "zh" ? "当前模式" : "Current";
  if (allowed) return language === "zh" ? "可切换" : "Available";
  return language === "zh" ? "未开放" : "Not open";
}

export function decisionLabel(decision: HitlPolicyDecision, language: "en" | "zh") {
  const labels: Record<HitlPolicyDecision, { en: string; zh: string }> = {
    auto: { en: "Auto", zh: "可自动处理" },
    review: { en: "Review", zh: "需要确认" },
    blocked: { en: "Blocked", zh: "已拦截" },
  };
  return labels[decision][language];
}

export function riskLabel(risk: HitlRisk, language: "en" | "zh") {
  const labels: Record<HitlRisk, { en: string; zh: string }> = {
    low: { en: "Low", zh: "低" },
    medium: { en: "Medium", zh: "中" },
    high: { en: "High", zh: "高" },
    critical: { en: "Critical", zh: "极高" },
  };
  return labels[risk][language];
}

export function actionKindLabel(value: string, language: "en" | "zh") {
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

export function statusLabel(value: string | undefined, language: "en" | "zh") {
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

export function flagLabel(value: string, language: "en" | "zh") {
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

export function prospectingStepLabel(step: ProspectingStep, language: "en" | "zh") {
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

export function ModeCard({
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

export function LoadingPanel() {
  return (
    <BattlePanel title="Loading" meta="control-center" tone="neutral">
      <div className="p-4 text-sm text-slate-400">
        <BattleText en="Loading growth controls..." zh="正在加载增长控制台..." />
      </div>
    </BattlePanel>
  );
}

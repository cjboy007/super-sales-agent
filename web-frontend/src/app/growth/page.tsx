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
  const [error, setError] = useState("");
  const [accessIssue, setAccessIssue] = useState<AccessRequiredIssue | "none">("none");

  const load = useCallback(async () => {
    setError("");
    const response = await apiFetch("/api/growth/control-center", { cache: "no-store" });
    if (response.status === 401) {
      setAccessIssue("beta_required");
      return;
    }
    if (response.status === 403) {
      setAccessIssue("workspace_denied");
      return;
    }
    const json = await response.json();
    if (!response.ok || !json.success) {
      setError(language === "zh" ? "增长控制台暂不可用" : "Growth control center is unavailable");
      return;
    }
    setAccessIssue("none");
    setData(json.data as ControlCenterData);
  }, [apiFetch, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const policy = data?.policyMatrix?.length ? data.policyMatrix : POLICY_FALLBACK;
  const reviewQueue = data?.reviewQueue;
  const steps = data?.prospectingPreview?.steps?.length ? data.prospectingPreview.steps : PREVIEW_FALLBACK;
  const learning = data?.decisionLearning?.actions?.length ? data.decisionLearning.actions : LEARNING_FALLBACK;
  const activeMode = data?.automationMode || "assist";
  const allowedModes = useMemo(() => new Set(data?.readiness?.allowedModes || ["observe", "assist", "locked"]), [data?.readiness?.allowedModes]);

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
        <BattleBadge tone="red">autopilot disabled</BattleBadge>
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

          <BattlePanel title="Decision Learning" meta="read-only policy memory" tone="neutral">
            <div className="grid gap-2 p-3">
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2">
                <p className="font-mono text-[11px] font-semibold uppercase text-slate-400">
                  <BattleText en="Learning Write" zh="策略沉淀" />
                </p>
                <BattleBadge tone={data?.decisionLearning?.readOnly === false ? "amber" : "neutral"}>read-only</BattleBadge>
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

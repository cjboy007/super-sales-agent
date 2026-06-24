"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { battleStationI18n, type ActiveAgent } from "@/lib/battle-station-data";
import { resolveFocusCase } from "@/lib/battle-station-focus";
import { useProject } from "@/lib/project";
import { useSSE } from "@/hooks/useSSE";
import FocusMode from "@/components/battle-station/FocusMode";
import JadenTaskDrawer from "@/components/battle-station/JadenTaskDrawer";
import QuickCommandBar from "@/components/battle-station/QuickCommandBar";
import StatusBadge from "@/components/battle-station/StatusBadge";
import TopStatusBar from "@/components/battle-station/TopStatusBar";
import { useTheme } from "@/components/ui/ThemeProvider";
import { cx, toneClasses } from "@/components/battle-station/theme";
import type { ApprovalRequest, BattleTone, DomainAccount, TimelineEvent } from "@/lib/battle-station-data";

interface DashboardOverview {
  stats?: {
    activeLeads?: number;
    todayEmails?: number;
    pendingQuotations?: number;
    conversionRate?: number;
  };
}

const SAMPLE_STATS = {
  activeLeads: 128,
  todayEmails: 34,
  pendingQuotations: 6,
  conversionRate: 18.7,
};

const APPROVAL_COPY = {
  approved: "approved-by-wilson",
  saved: "draft-saved",
  regenerated: "ai-regenerated",
  rejected: "rejected-by-wilson",
};

function statusToApprovalState(status: string): string {
  if (status === "approved") return APPROVAL_COPY.approved;
  if (status === "rejected") return APPROVAL_COPY.rejected;
  return "waiting-human";
}

interface AgentSummary {
  id?: string;
  name: string;
  role: string;
  tasksCompletedToday: number;
  tasksFailedToday: number;
  activeTasks: number;
  approvalGated: number;
}

const BACKGROUND_PROGRESS_COPY = {
  en: {
    "lead-research": {
      name: "Lead Research",
      role: "Prospect research and CRM import",
      active: (count: number) => `${count} lead task(s) running`,
      approval: (count: number) => `${count} item(s) waiting for review`,
      failed: (count: number) => `${count} lead task(s) need attention`,
      idle: "ready for customer research",
    },
    "outreach-drafts": {
      name: "Outreach Drafts",
      role: "Inbox triage and cold-email drafts",
      active: (count: number) => `${count} outreach draft(s) running`,
      approval: (count: number) => `${count} draft(s) waiting for review`,
      failed: (count: number) => `${count} outreach task(s) need attention`,
      idle: "ready for inbox and outreach work",
    },
    "quote-docs": {
      name: "Quotes and Ship Docs",
      role: "Quotations, PI export, and CI/PL follow-up files",
      active: (count: number) => `${count} quote/shipping-file task(s) running`,
      approval: (count: number) => `${count} file action(s) waiting for review`,
      failed: (count: number) => `${count} quote/file task(s) need attention`,
      idle: "ready for quotes and CI/PL files",
    },
    "follow-up-plan": {
      name: "Follow-up Plan",
      role: "Follow-up cadence and reminders",
      active: (count: number) => `${count} follow-up task(s) running`,
      approval: (count: number) => `${count} follow-up item(s) waiting for review`,
      failed: (count: number) => `${count} follow-up task(s) need attention`,
      idle: "ready for next-step planning",
    },
    "approval-gates": {
      name: "Review Items",
      role: "Customer-facing action checks",
      active: (count: number) => `${count} review check(s) active`,
      approval: (count: number) => `${count} item(s) waiting for review`,
      failed: (count: number) => `${count} review issue(s) need attention`,
      idle: "no blocked customer-facing actions",
    },
    "jaden-runtime": {
      name: "Task Progress",
      role: "Automated planning and task execution",
      active: (count: number) => `${count} automated task(s) running`,
      approval: (count: number) => `${count} item(s) waiting for review`,
      failed: (count: number) => `${count} task(s) need attention`,
      idle: "all automated tasks are clear",
    },
  },
  zh: {
    "lead-research": {
      name: "线索搜索",
      role: "客户资料与 CRM 导入",
      active: (count: number) => `${count} 项线索任务运行中`,
      approval: (count: number) => `${count} 项线索结果待复核`,
      failed: (count: number) => `${count} 项线索任务需要处理`,
      idle: "可接收客户搜索任务",
    },
    "outreach-drafts": {
      name: "开发信草稿",
      role: "邮件复核与开发信起草",
      active: (count: number) => `${count} 项开发信任务运行中`,
      approval: (count: number) => `${count} 封开发信待确认`,
      failed: (count: number) => `${count} 项开发信任务需要处理`,
      idle: "可处理邮件复核与开发信",
    },
    "quote-docs": {
      name: "报价与单证",
      role: "报价、PI、CI/PL 后续单证",
      active: (count: number) => `${count} 项报价/单证任务运行中`,
      approval: (count: number) => `${count} 项文件动作待复核`,
      failed: (count: number) => `${count} 项报价/单证任务需要处理`,
      idle: "可处理报价与单证",
    },
    "follow-up-plan": {
      name: "跟进安排",
      role: "跟进节奏与下一步提醒",
      active: (count: number) => `${count} 项跟进任务运行中`,
      approval: (count: number) => `${count} 项跟进安排待复核`,
      failed: (count: number) => `${count} 项跟进任务需要处理`,
      idle: "可安排下一步跟进",
    },
    "approval-gates": {
      name: "确认事项",
      role: "客户可见动作确认",
      active: (count: number) => `${count} 项确认检查运行中`,
      approval: (count: number) => `${count} 项待确认`,
      failed: (count: number) => `${count} 项确认事项需要处理`,
      idle: "暂无被拦截的客户可见动作",
    },
    "jaden-runtime": {
      name: "任务进度",
      role: "自动规划与任务执行",
      active: (count: number) => `${count} 项自动任务运行中`,
      approval: (count: number) => `${count} 项待确认`,
      failed: (count: number) => `${count} 项自动任务需要处理`,
      idle: "自动任务已处理完",
    },
  },
} as const;

const WORKBENCH_COPY = {
  en: {
    title: "Workbench Overview",
    subtitle: "Start with the items that need a decision, then review automated work and priority accounts.",
    primaryAction: "Review pending items",
    progressAction: "View task progress",
    currentFocus: "Current priority",
    currentFocusMeta: "Selected account context",
    sections: {
      pending: "Needs Review",
      progress: "Automated Task Progress",
      customers: "Priority Accounts",
      recent: "Recent Activity",
    },
    metrics: {
      pending: "Needs review",
      running: "Active tasks",
      customers: "Priority accounts",
      emails: "Emails today",
      quotes: "Quotes pending",
    },
    emptyPending: "No customer-facing item needs review right now.",
    emptyProgress: "No automated task needs attention.",
    continueProcessing: "Continue",
    viewDetails: "View details",
    value: "Value",
    risk: "Risk",
    due: "Due",
    nextAction: "Next action",
    noQueue: "0 tasks",
    taskUnit: "tasks",
  },
  zh: {
    title: "工作台概览",
    subtitle: "先处理需要判断的客户动作，再查看自动任务、重点客户和近期动态。",
    primaryAction: "查看待确认",
    progressAction: "查看任务进度",
    currentFocus: "当前重点",
    currentFocusMeta: "已选客户上下文",
    sections: {
      pending: "待确认事项",
      progress: "自动任务进度",
      customers: "重点客户",
      recent: "近期动态",
    },
    metrics: {
      pending: "待确认",
      running: "运行中任务",
      customers: "重点客户",
      emails: "今日邮件",
      quotes: "报价待处理",
    },
    emptyPending: "当前没有需要确认的客户动作。",
    emptyProgress: "当前没有需要关注的自动任务。",
    continueProcessing: "继续处理",
    viewDetails: "查看详情",
    value: "金额",
    risk: "风险",
    due: "截止",
    nextAction: "下一步",
    noQueue: "0 项任务",
    taskUnit: "项",
  },
} as const;

interface MetricCardProps {
  label: string;
  value: string | number;
  helper: string;
  tone: BattleTone;
}

interface SectionTitleProps {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}

interface PendingActionCardProps {
  approval: ApprovalRequest;
  stateLabel: string;
  copy: typeof WORKBENCH_COPY.en | typeof WORKBENCH_COPY.zh;
  onOpen: (dealId: string) => void;
}

interface TaskProgressRowProps {
  agent: ActiveAgent;
  taskUnit: string;
}

interface PriorityCustomerCardProps {
  account: DomainAccount;
  selected: boolean;
  copy: typeof WORKBENCH_COPY.en | typeof WORKBENCH_COPY.zh;
  onSelect: (dealId: string) => void;
  onOpen: (dealId: string) => void;
}

interface RecentEventRowProps {
  event: TimelineEvent;
  copy: typeof WORKBENCH_COPY.en | typeof WORKBENCH_COPY.zh;
  onSelect: (dealId: string) => void;
  onOpen: (dealId: string) => void;
}

function priorityScore(account: DomainAccount): number {
  const statusWeight: Record<DomainAccount["status"], number> = {
    pending: 120,
    risk: 95,
    active: 70,
    monitoring: 45,
    won: 10,
  };

  return statusWeight[account.status] + account.confidence;
}

function SectionTitle({ title, meta, action }: SectionTitleProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {meta && <p className="mt-1 text-xs text-slate-500">{meta}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricCard({ label, value, helper, tone }: MetricCardProps) {
  const toneClass = toneClasses[tone];
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/55 p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <strong className="text-2xl font-semibold text-slate-100">{value}</strong>
        <span className={cx("h-2 w-2 rounded-full", toneClass.dot)} />
      </div>
      <p className="mt-2 line-clamp-1 text-xs text-slate-500">{helper}</p>
    </article>
  );
}

function PendingActionCard({ approval, stateLabel, copy, onOpen }: PendingActionCardProps) {
  return (
    <article className="rounded-lg border border-amber-500/25 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-300">{approval.account}</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-100">{approval.title}</h3>
        </div>
        <StatusBadge tone="pending" pulse className="normal-case">
          {stateLabel}
        </StatusBadge>
      </div>
      <dl className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
        <div>
          <dt>{copy.value}</dt>
          <dd className="mt-1 font-semibold text-slate-200">{approval.value}</dd>
        </div>
        <div>
          <dt>{copy.risk}</dt>
          <dd className="mt-1 font-semibold text-amber-300">{approval.risk}</dd>
        </div>
        <div>
          <dt>{copy.due}</dt>
          <dd className="mt-1 font-semibold text-slate-200">{approval.due}</dd>
        </div>
      </dl>
      <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-400">{approval.recommendation}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-xs text-slate-500">{approval.guardrail}</p>
        <button
          type="button"
          onClick={() => onOpen(approval.dealId)}
          className="h-9 shrink-0 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500"
        >
          {copy.continueProcessing}
        </button>
      </div>
    </article>
  );
}

function TaskProgressRow({ agent, taskUnit }: TaskProgressRowProps) {
  const tone = toneClasses[agent.tone];
  return (
    <article className="border-b border-slate-800/70 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-100">{agent.name}</h3>
          <p className="mt-1 truncate text-xs text-slate-500">{agent.role}</p>
        </div>
        <StatusBadge tone={agent.tone} className="normal-case">
          {agent.status}
        </StatusBadge>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{agent.currentTask}</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div className={cx("h-full rounded-full", tone.progress)} style={{ width: `${agent.load}%` }} />
        </div>
        <span className="shrink-0 text-xs text-slate-500">{agent.queue} {taskUnit}</span>
      </div>
    </article>
  );
}

function PriorityCustomerCard({ account, selected, copy, onSelect, onOpen }: PriorityCustomerCardProps) {
  const tone = toneClasses[account.tone];
  const canContinue = account.status === "pending";
  return (
    <article
      className={cx(
        "rounded-lg border bg-slate-950/55 p-4 transition",
        selected ? cx(tone.border, tone.glow) : "border-slate-800 hover:border-slate-700"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cx("truncate text-sm font-semibold", tone.text)}>{account.account}</h3>
          <p className="mt-1 truncate text-xs text-slate-500">{account.product}</p>
        </div>
        <StatusBadge tone={account.tone} pulse={account.status === "pending" || account.status === "risk"} className="normal-case">
          {account.statusLabel}
        </StatusBadge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-slate-500">{copy.value}</dt>
          <dd className="mt-1 font-semibold text-slate-200">{account.value}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{copy.risk}</dt>
          <dd className={cx("mt-1 font-semibold", tone.softText)}>{account.risk}</dd>
        </div>
      </dl>
      <p className="mt-4 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-slate-400">{account.nextAction}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="truncate text-xs text-slate-500">{account.lastTouch}</span>
        <button
          type="button"
          onClick={() => {
            onSelect(account.id);
            if (canContinue) onOpen(account.id);
          }}
          className={cx(
            "h-8 shrink-0 rounded-md px-3 text-xs font-semibold transition",
            canContinue
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-slate-100"
          )}
        >
          {canContinue ? copy.continueProcessing : copy.viewDetails}
        </button>
      </div>
    </article>
  );
}

function RecentEventRow({ event, copy, onSelect, onOpen }: RecentEventRowProps) {
  const tone = toneClasses[event.tone];
  return (
    <article className="flex gap-3 border-b border-slate-800/70 py-3 last:border-b-0">
      <div className={cx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{event.title}</h3>
          <span className="shrink-0 text-xs text-slate-500">{event.time}</span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{event.account}</p>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{event.body}</p>
        {event.dealId && (
          <button
            type="button"
            onClick={() => {
              onSelect(event.dealId as string);
              if (event.approvalId) onOpen(event.dealId as string);
            }}
            className="mt-3 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
          >
            {event.approvalId ? copy.continueProcessing : copy.viewDetails}
          </button>
        )}
      </div>
    </article>
  );
}

function statusToAgentTone(summary: AgentSummary): ActiveAgent["tone"] {
  if (summary.approvalGated > 0) return "pending";
  if (summary.tasksFailedToday > 0) return "risk";
  if (summary.activeTasks > 0) return "processing";
  return "safe";
}

function summaryToAgentCard(summary: AgentSummary, language: keyof typeof BACKGROUND_PROGRESS_COPY): ActiveAgent {
  const tone = statusToAgentTone(summary);
  const queue = summary.activeTasks + summary.approvalGated + summary.tasksFailedToday;
  const load = Math.min(100, summary.activeTasks * 20 + summary.approvalGated * 25 + summary.tasksFailedToday * 30);
  const key = summary.id || summary.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const localized = BACKGROUND_PROGRESS_COPY[language][key as keyof typeof BACKGROUND_PROGRESS_COPY[typeof language]];
  const status = summary.approvalGated > 0
    ? (language === "zh" ? "待确认" : "waiting review")
    : summary.tasksFailedToday > 0
      ? (language === "zh" ? "需处理" : "error")
      : summary.activeTasks > 0
        ? (language === "zh" ? "运行中" : "running")
        : (language === "zh" ? "待命" : "idle");
  const currentTask = summary.approvalGated > 0
    ? (localized?.approval(summary.approvalGated) ?? `${summary.role} awaiting review`)
    : summary.tasksFailedToday > 0
      ? (localized?.failed(summary.tasksFailedToday) ?? `${summary.tasksFailedToday} task(s) need attention`)
      : summary.activeTasks > 0
        ? (localized?.active(summary.activeTasks) ?? `${summary.activeTasks} active task(s)`)
        : (localized?.idle ?? (language === "zh" ? "暂无自动任务" : "idle"));

  return {
    id: key,
    name: localized?.name ?? summary.name,
    role: localized?.role ?? summary.role,
    status,
    tone,
    load,
    currentTask,
    queue,
  };
}

export default function BattleStationPage() {
  const { apiUrl, apiFetch } = useProject();
  const { language } = useTheme();
  const { eventHistory, isConnected, eventCount } = useSSE(apiUrl("/api/events"));

  const [selectedDealId, setSelectedDealId] = useState("amphenol");
  const [focusDealId, setFocusDealId] = useState<string | null>(null);
  const [stats, setStats] = useState(SAMPLE_STATS);
  const [command, setCommand] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [commandStatus, setCommandStatus] = useState<"idle" | "sending" | "queued" | "error">("idle");
  const [commandReceipt, setCommandReceipt] = useState("");
  const [commandThreadId, setCommandThreadId] = useState<string | undefined>();
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const station = battleStationI18n[language];
  const { copy } = station;
  const workbenchCopy = WORKBENCH_COPY[language];
  const [approvalState, setApprovalState] = useState<Record<string, string>>({
    "amphenol-counter": "waiting-human",
    "molex-retention": "needs-strategy",
    "te-tier-two": "ready-after-copper",
  });
  const [liveApprovals, setLiveApprovals] = useState(station.approvalRequests);
  const [liveAgents, setLiveAgents] = useState(station.activeAgents);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function fetchOverview() {
      try {
        const response = await apiFetch("/api/dashboard/overview");
        if (!response.ok) return;
        const json = await response.json();
        const data = json?.data as DashboardOverview | undefined;
        if (!json?.success || !data?.stats || cancelled) return;

        setStats({
          activeLeads: data.stats.activeLeads ?? SAMPLE_STATS.activeLeads,
          todayEmails: data.stats.todayEmails ?? SAMPLE_STATS.todayEmails,
          pendingQuotations: data.stats.pendingQuotations ?? SAMPLE_STATS.pendingQuotations,
          conversionRate: data.stats.conversionRate ?? SAMPLE_STATS.conversionRate,
        });
      } catch {
        // The battle station stays operational with local Farreach sample data if the API is offline.
      }
    }

    fetchOverview();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  const selectedDeal = useMemo(
    () => station.domainAccounts.find((account) => account.id === selectedDealId) ?? station.domainAccounts[0],
    [selectedDealId, station.domainAccounts]
  );

  const displayApprovals = useMemo(
    () => liveApprovals.map((approval) => station.approvalRequests.find((item) => item.id === approval.id) ?? approval),
    [liveApprovals, station.approvalRequests]
  );
  const displayAgents = useMemo(
    () => liveAgents.map((agent) => {
      const localized = station.activeAgents.find((item) => item.id === agent.id);
      if (!localized) return agent;
      const currentTask = agent.queue > 0
        ? localized.currentTask
        : localized.currentTask || agent.currentTask;
      return {
        ...agent,
        name: localized.name,
        role: localized.role,
        status: localized.status,
        currentTask,
      };
    }),
    [liveAgents, station.activeAgents]
  );

  const focusCase = useMemo(() => {
    if (!focusDealId) return null;

    return resolveFocusCase({
      dealId: focusDealId,
      language,
      accounts: station.domainAccounts,
      approvals: displayApprovals,
      events: station.timelineEvents,
      focusCases: station.focusCases,
    });
  }, [displayApprovals, focusDealId, language, station.domainAccounts, station.focusCases, station.timelineEvents]);
  const focusApprovalTemplate = useMemo(
    () => (focusCase ? displayApprovals.find((approval) => approval.id === focusCase.approvalId) ?? null : null),
    [displayApprovals, focusCase]
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchApprovals() {
      try {
        const response = await apiFetch("/api/approvals");
        const json = await response.json();
        if (cancelled || !json?.success || !Array.isArray(json.data) || json.data.length === 0) return;

        const mappedApprovals = json.data.map((approval: Record<string, unknown>) => ({
          id: String(approval.id || ""),
          dealId: String(approval.dealId || approval.deal_id || ""),
          account: String(approval.account || ""),
          title: String(approval.title || ""),
          value: String(approval.value || ""),
          risk: String(approval.risk || ""),
          due: String(approval.due || ""),
          recommendation: String(approval.recommendation || ""),
          guardrail: String(approval.guardrail || ""),
        }));

        setLiveApprovals(mappedApprovals);
        setApprovalState((current) => {
          const next = { ...current };
          for (const approval of json.data as Array<Record<string, unknown>>) {
            const id = String(approval.id || "");
            if (!id) continue;
            next[id] = statusToApprovalState(String(approval.status || "pending"));
          }
          return next;
        });
      } catch {
        // Keep the workbench usable with local sample data when the approvals API is offline.
      }
    }

    fetchApprovals();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAgents() {
      try {
        const response = await apiFetch("/api/agent-state?limit=20");
        const json = await response.json();
        if (cancelled || !json?.success || !json.data?.agents || !Array.isArray(json.data.agents)) return;

        const live = (json.data.agents as AgentSummary[]).map((summary) => summaryToAgentCard(summary, language));
        if (live.length > 0) setLiveAgents(live);
      } catch {
        // Keep sample agent cards if the SSA agent-state API is unavailable.
      }
    }

    fetchAgents();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, language]);

  useEffect(() => {
    if (!focusCase || !focusApprovalTemplate) return;
    const approvalTemplate = focusApprovalTemplate;

    let cancelled = false;

    async function syncApprovalRecord() {
      try {
        const lookup = await apiFetch(`/api/approvals?id=${encodeURIComponent(approvalTemplate.id)}`);
        const lookupJson = await lookup.json();
        if (cancelled) return;

        if (lookupJson?.success && Array.isArray(lookupJson.data) && lookupJson.data.length > 0) return;

        await apiFetch("/api/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: approvalTemplate.id,
            dealId: approvalTemplate.dealId,
            account: approvalTemplate.account,
            title: approvalTemplate.title,
            triggerType: "manual",
            value: approvalTemplate.value,
            risk: approvalTemplate.risk,
            due: approvalTemplate.due,
            recommendation: approvalTemplate.recommendation,
            guardrail: approvalTemplate.guardrail,
            metadata: {
              source: "battle-station-focus",
              dealId: approvalTemplate.dealId,
              approvalId: approvalTemplate.id,
            },
          }),
        });
      } catch {
        // Keep the workbench usable even if review sync is temporarily unavailable.
      }
    }

    syncApprovalRecord();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, focusApprovalTemplate, focusCase]);

  const openFocus = useCallback((dealId: string) => {
    const nextFocusCase = resolveFocusCase({
      dealId,
      language,
      accounts: station.domainAccounts,
      approvals: displayApprovals,
      events: station.timelineEvents,
      focusCases: station.focusCases,
    });
    if (!nextFocusCase) return;

    setSelectedDealId(dealId);
    setFocusDealId(dealId);
  }, [displayApprovals, language, station.domainAccounts, station.focusCases, station.timelineEvents]);

  const updateApproval = useCallback(
    async (state: string, decisionNote?: string) => {
      if (!focusCase) return;
      setApprovalState((current) => ({
        ...current,
        [focusCase.approvalId]: state,
      }));

      const mappedStatus = state === APPROVAL_COPY.approved
        ? "approved"
        : state === APPROVAL_COPY.rejected
          ? "rejected"
          : "pending";

      try {
        await apiFetch("/api/approvals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: focusCase.approvalId,
            status: mappedStatus,
            decisionBy: "SSA",
            decisionNote: decisionNote || state,
          }),
        });
      } catch {
        // Local approval state already updated.
      }
    },
    [apiFetch, focusCase]
  );

  const recentEvents = useMemo(() => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return eventHistory.filter((event) => new Date(event.timestamp).getTime() > fiveMinutesAgo).length;
  }, [eventHistory]);

  const priorityAccounts = useMemo(
    () => [...station.domainAccounts].sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, 4),
    [station.domainAccounts]
  );

  const visibleAgents = useMemo(
    () => {
      const active = displayAgents.filter((agent) => agent.queue > 0 || agent.tone === "pending" || agent.tone === "risk" || agent.tone === "processing");
      return (active.length > 0 ? active : displayAgents).slice(0, 4);
    },
    [displayAgents]
  );

  const runningTaskCount = useMemo(
    () => displayAgents.reduce((total, agent) => total + agent.queue, 0),
    [displayAgents]
  );

  const recentKeyEvents = useMemo(
    () => station.timelineEvents.slice(0, 4),
    [station.timelineEvents]
  );

  const submitCommand = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed || commandStatus === "sending") return;

    setCommandStatus("sending");
    setCommandReceipt("");
    setTaskDrawerOpen(false);

    const target = selectedDeal
      ? { type: "customer", id: selectedDeal.id, label: selectedDeal.account }
      : { type: "none" };

    try {
      const response = await apiFetch("/api/operator-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "battle-station",
          surface: "battle-station",
          mode: "global_command",
          message: trimmed,
          target: target,
          context: {
            selectedDeal,
            selectedDealId,
            visibleApprovals: displayApprovals.slice(0, 5),
            activeAgents: visibleAgents,
            recentEvents: recentKeyEvents,
            stats,
            runningTaskCount,
            recentEventCount: recentEvents,
          },
        }),
      });
      const json = await response.json().catch(() => null);

      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || json?.message || "Command failed");
      }

      const data = json?.data || {};
      const queuedTasks = Number(data?.queuedTasks || 0);
      const workflows = Array.isArray(data?.validatedPlan?.workflows)
        ? data.validatedPlan.workflows.join(", ")
        : "";
      const receipt = queuedTasks > 0
        ? `${queuedTasks} task${queuedTasks === 1 ? "" : "s"} queued${workflows ? `: ${workflows}` : ""}`
        : (data?.validatedPlan?.needsHumanReview ? "Plan needs review" : "Command planned");

      setLastCommand(trimmed);
      setCommand("");
      setCommandStatus("queued");
      setCommandReceipt(receipt);
      setCommandThreadId(typeof data?.commandThreadId === "string" ? data.commandThreadId : undefined);
    } catch (error) {
      setCommandStatus("error");
      setCommandReceipt(error instanceof Error ? error.message : "Command failed");
    }
  }, [
    apiFetch,
    command,
    commandStatus,
    displayApprovals,
    recentEvents,
    recentKeyEvents,
    runningTaskCount,
    selectedDeal,
    selectedDealId,
    stats,
    visibleAgents,
  ]);

  const heroHelper = displayApprovals[0]?.title || selectedDeal?.nextAction || workbenchCopy.emptyPending;
  const selectedTone = toneClasses[selectedDeal?.tone ?? "neutral"];

  if (focusCase) {
    const draftKey = `${language}:${focusCase.dealId}`;
    const draft = drafts[draftKey] ?? focusCase.draft;
    const subject = subjects[draftKey] ?? focusCase.subject;

    return (
      <FocusMode
        focusCase={focusCase}
        copy={copy.focus}
        draft={draft}
        subject={subject}
        approvalState={copy.approvalStates[approvalState[focusCase.approvalId] ?? "waiting-human"]}
        onDraftChange={(nextDraft) =>
          setDrafts((current) => ({
            ...current,
            [draftKey]: nextDraft,
          }))
        }
        onSubjectChange={(nextSubject) =>
          setSubjects((current) => ({
            ...current,
            [draftKey]: nextSubject,
          }))
        }
        onBack={() => setFocusDealId(null)}
        onApprove={() => { void updateApproval(APPROVAL_COPY.approved, "Confirmed in workbench review"); }}
        onSave={() => { void updateApproval(APPROVAL_COPY.saved, "Draft saved in workbench review"); }}
        onRegenerate={() => {
          setDrafts((current) => ({
            ...current,
            [draftKey]: `${focusCase.draft}\n\n${copy.regeneratedNote}`,
          }));
          void updateApproval(APPROVAL_COPY.regenerated, "Regenerated in workbench review");
        }}
        onReject={() => { void updateApproval(APPROVAL_COPY.rejected, "Rejected in workbench review"); }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200 battle-grid">
      <TopStatusBar
        copy={copy.topBar}
        activeAgents={displayAgents.length}
        connected={isConnected}
        activeEvents={eventCount + recentEvents}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
            <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-slate-100">{workbenchCopy.title}</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{workbenchCopy.subtitle}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href="/reviews"
                    className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500"
                  >
                    {workbenchCopy.primaryAction}
                  </a>
                  <a
                    href="/agent-status"
                    className="inline-flex h-9 items-center rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
                  >
                    {workbenchCopy.progressAction}
                  </a>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  label={workbenchCopy.metrics.pending}
                  value={displayApprovals.length}
                  helper={heroHelper}
                  tone={displayApprovals.length > 0 ? "pending" : "safe"}
                />
                <MetricCard
                  label={workbenchCopy.metrics.running}
                  value={runningTaskCount}
                  helper={visibleAgents[0]?.currentTask || workbenchCopy.emptyProgress}
                  tone={runningTaskCount > 0 ? "processing" : "safe"}
                />
                <MetricCard
                  label={workbenchCopy.metrics.customers}
                  value={priorityAccounts.length}
                  helper={priorityAccounts[0]?.account || selectedDeal?.account || "-"}
                  tone="intel"
                />
                <MetricCard
                  label={workbenchCopy.metrics.emails}
                  value={stats.todayEmails || SAMPLE_STATS.todayEmails}
                  helper={copy.commandCenter.statLabels.emails}
                  tone="processing"
                />
                <MetricCard
                  label={workbenchCopy.metrics.quotes}
                  value={stats.pendingQuotations || SAMPLE_STATS.pendingQuotations}
                  helper={copy.commandCenter.statLabels.quotes}
                  tone="pending"
                />
              </div>
            </div>

            {selectedDeal && (
              <aside className="rounded-lg border border-slate-800 bg-slate-900/45 p-5 shadow-sm">
                <SectionTitle title={workbenchCopy.currentFocus} meta={workbenchCopy.currentFocusMeta} />
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={cx("truncate text-lg font-semibold", selectedTone.text)}>{selectedDeal.account}</h2>
                    <p className="mt-1 truncate text-xs text-slate-500">{selectedDeal.product}</p>
                  </div>
                  <StatusBadge tone={selectedDeal.tone} pulse={selectedDeal.status === "pending" || selectedDeal.status === "risk"} className="normal-case">
                    {selectedDeal.statusLabel}
                  </StatusBadge>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <dt className="text-slate-500">{workbenchCopy.value}</dt>
                    <dd className="mt-1 font-semibold text-slate-200">{selectedDeal.value}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{workbenchCopy.risk}</dt>
                    <dd className={cx("mt-1 font-semibold", selectedTone.softText)}>{selectedDeal.risk}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-sm leading-relaxed text-slate-400">{selectedDeal.nextAction}</p>
                <button
                  type="button"
                  onClick={() => selectedDeal.status === "pending" ? openFocus(selectedDeal.id) : setSelectedDealId(selectedDeal.id)}
                  className="mt-5 h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
                >
                  {selectedDeal.status === "pending" ? workbenchCopy.continueProcessing : workbenchCopy.viewDetails}
                </button>
              </aside>
            )}
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-5">
              <SectionTitle
                title={workbenchCopy.sections.pending}
                meta={displayApprovals.length > 0 ? `${displayApprovals.length} ${copy.commandCenter.open}` : workbenchCopy.emptyPending}
              />
              <div className="mt-4 grid gap-3">
                {displayApprovals.length > 0 ? displayApprovals.map((approval) => {
                  const state = approvalState[approval.id] || "waiting-human";
                  return (
                    <PendingActionCard
                      key={approval.id}
                      approval={approval}
                      stateLabel={copy.approvalStates[state] ?? state}
                      copy={workbenchCopy}
                      onOpen={openFocus}
                    />
                  );
                }) : (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-5 text-sm text-slate-500">
                    {workbenchCopy.emptyPending}
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-lg border border-slate-800 bg-slate-900/45 p-5">
              <SectionTitle
                title={workbenchCopy.sections.progress}
                meta={runningTaskCount > 0 ? `${runningTaskCount} ${workbenchCopy.taskUnit}` : workbenchCopy.emptyProgress}
              />
              <div className="mt-2">
                {visibleAgents.length > 0 ? visibleAgents.map((agent) => (
                  <TaskProgressRow key={agent.id} agent={agent} taskUnit={workbenchCopy.taskUnit} />
                )) : (
                  <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/55 p-4 text-sm text-slate-500">
                    {workbenchCopy.emptyProgress}
                  </p>
                )}
              </div>
            </aside>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
            <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-5">
              <SectionTitle title={workbenchCopy.sections.customers} meta={copy.domain.monitoredDomains(station.domainAccounts.length)} />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {priorityAccounts.map((account) => (
                  <PriorityCustomerCard
                    key={account.id}
                    account={account}
                    selected={account.id === selectedDealId}
                    copy={workbenchCopy}
                    onSelect={setSelectedDealId}
                    onOpen={openFocus}
                  />
                ))}
              </div>
            </div>

            <aside className="rounded-lg border border-slate-800 bg-slate-900/45 p-5">
              <SectionTitle title={workbenchCopy.sections.recent} meta={copy.timeline.eventsVisible(recentKeyEvents.length)} />
              <div className="mt-2">
                {recentKeyEvents.map((event) => (
                  <RecentEventRow
                    key={event.id}
                    event={event}
                    copy={workbenchCopy}
                    onSelect={setSelectedDealId}
                    onOpen={openFocus}
                  />
                ))}
              </div>
            </aside>
          </section>
        </main>
      </div>

      <QuickCommandBar
        copy={copy.quickCommand}
        moduleLinks={station.moduleLinks}
        command={command}
        lastCommand={lastCommand}
        status={commandStatus}
        receipt={commandReceipt}
        tasksAvailable={Boolean(commandThreadId)}
        onCommandChange={setCommand}
        onSubmit={submitCommand}
        onOpenTasks={() => setTaskDrawerOpen(true)}
      />
      <JadenTaskDrawer
        open={taskDrawerOpen}
        threadId={commandThreadId}
        onClose={() => setTaskDrawerOpen(false)}
      />
    </div>
  );
}

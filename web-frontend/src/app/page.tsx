"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { battleStationI18n, type ActiveAgent } from "@/lib/battle-station-data";
import { useProject } from "@/lib/project";
import { useSSE } from "@/hooks/useSSE";
import CommandCenter from "@/components/battle-station/CommandCenter";
import DomainRadar from "@/components/battle-station/DomainRadar";
import FocusMode from "@/components/battle-station/FocusMode";
import LiveTimeline, { type TimelineFilter } from "@/components/battle-station/LiveTimeline";
import QuickCommandBar from "@/components/battle-station/QuickCommandBar";
import TopStatusBar from "@/components/battle-station/TopStatusBar";
import { useTheme } from "@/components/ui/ThemeProvider";
import { cx } from "@/components/battle-station/theme";

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

type CockpitPanel = "radar" | "timeline" | "command";

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
  name: string;
  role: string;
  tasksCompletedToday: number;
  tasksFailedToday: number;
  activeTasks: number;
  approvalGated: number;
}

function statusToAgentTone(summary: AgentSummary): ActiveAgent["tone"] {
  if (summary.approvalGated > 0) return "pending";
  if (summary.tasksFailedToday > 0) return "risk";
  if (summary.activeTasks > 0) return "processing";
  return "safe";
}

function summaryToAgentCard(summary: AgentSummary): ActiveAgent {
  const tone = statusToAgentTone(summary);
  const queue = summary.activeTasks + summary.approvalGated + summary.tasksFailedToday;
  const load = Math.min(100, summary.activeTasks * 20 + summary.approvalGated * 25 + summary.tasksFailedToday * 30);
  const status = summary.approvalGated > 0
    ? "waiting approval"
    : summary.tasksFailedToday > 0
      ? "error"
      : summary.activeTasks > 0
        ? "running"
        : "idle";

  return {
    id: summary.name,
    name: summary.name,
    role: summary.role,
    status,
    tone,
    load,
    currentTask: summary.approvalGated > 0
      ? `${summary.role} awaiting approval`
      : summary.activeTasks > 0
        ? `${summary.activeTasks} active task(s)`
        : "idle",
    queue,
  };
}

export default function BattleStationPage() {
  const { apiUrl } = useProject();
  const { language } = useTheme();
  const { eventHistory, isConnected, eventCount } = useSSE(apiUrl("/api/events"));

  const [selectedDealId, setSelectedDealId] = useState("amphenol");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [focusDealId, setFocusDealId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [stats, setStats] = useState(SAMPLE_STATS);
  const [command, setCommand] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [mobilePanel, setMobilePanel] = useState<CockpitPanel>("timeline");
  const station = battleStationI18n[language];
  const { copy } = station;
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
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchOverview() {
      try {
        const response = await fetch(apiUrl("/api/dashboard/overview"));
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
  }, [apiUrl]);

  const selectedDeal = useMemo(
    () => station.domainAccounts.find((account) => account.id === selectedDealId) ?? station.domainAccounts[0],
    [selectedDealId, station.domainAccounts]
  );

  const focusCase = focusDealId ? station.focusCases[focusDealId] : null;
  const focusApprovalTemplate = useMemo(
    () => (focusCase ? liveApprovals.find((approval) => approval.id === focusCase.approvalId) ?? null : null),
    [focusCase, liveApprovals]
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchApprovals() {
      try {
        const response = await fetch(apiUrl("/api/approvals"));
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
        // Keep the cockpit usable with local sample data when the approvals API is offline.
      }
    }

    fetchApprovals();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAgents() {
      try {
        const response = await fetch(apiUrl("/api/agent-state?limit=20"));
        const json = await response.json();
        if (cancelled || !json?.success || !json.data?.agents || !Array.isArray(json.data.agents)) return;

        const live = (json.data.agents as AgentSummary[]).map(summaryToAgentCard);
        if (live.length > 0) setLiveAgents(live);
      } catch {
        // Keep sample agent cards if the SSA agent-state API is unavailable.
      }
    }

    fetchAgents();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    if (!focusCase || !focusApprovalTemplate) return;
    const approvalTemplate = focusApprovalTemplate;

    let cancelled = false;

    async function syncApprovalRecord() {
      try {
        const lookup = await fetch(apiUrl(`/api/approvals?id=${encodeURIComponent(approvalTemplate.id)}`));
        const lookupJson = await lookup.json();
        if (cancelled) return;

        if (lookupJson?.success && Array.isArray(lookupJson.data) && lookupJson.data.length > 0) return;

        await fetch(apiUrl("/api/approvals"), {
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
        // Keep the cockpit usable even if approval sync is temporarily unavailable.
      }
    }

    syncApprovalRecord();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, focusApprovalTemplate, focusCase]);

  const openFocus = useCallback((dealId: string) => {
    if (!station.focusCases[dealId]) return;
    setSelectedDealId(dealId);
    setFocusDealId(dealId);
  }, [station.focusCases]);

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
        await fetch(apiUrl("/api/approvals"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: focusCase.approvalId,
            status: mappedStatus,
            decisionBy: "JadenOS",
            decisionNote: decisionNote || state,
          }),
        });
      } catch {
        // Local approval state already updated.
      }
    },
    [apiUrl, focusCase]
  );

  const submitCommand = useCallback(() => {
    const trimmed = command.trim();
    if (!trimmed) return;
    setLastCommand(trimmed);
    setCommand("");
  }, [command]);

  const recentEvents = useMemo(() => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return eventHistory.filter((event) => new Date(event.timestamp).getTime() > fiveMinutesAgo).length;
  }, [eventHistory]);

  const cockpitTabs: Array<{ id: CockpitPanel; label: string }> = [
    { id: "radar", label: copy.domain.title },
    { id: "timeline", label: copy.timeline.title },
    { id: "command", label: copy.commandCenter.title },
  ];

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
        onApprove={() => { void updateApproval(APPROVAL_COPY.approved, "Approved in Focus Mode"); }}
        onSave={() => { void updateApproval(APPROVAL_COPY.saved, "Draft saved in Focus Mode"); }}
        onRegenerate={() => {
          setDrafts((current) => ({
            ...current,
            [draftKey]: `${focusCase.draft}\n\n${copy.regeneratedNote}`,
          }));
          void updateApproval(APPROVAL_COPY.regenerated, "Regenerated in Focus Mode");
        }}
        onReject={() => { void updateApproval(APPROVAL_COPY.rejected, "Rejected in Focus Mode"); }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200 battle-grid">
      <TopStatusBar
        copy={copy.topBar}
        activeAgents={station.activeAgents.length}
        connected={isConnected}
        currentTime={currentTime}
        activeEvents={eventCount + recentEvents}
      />

      <div className="cockpit-layout flex min-h-0 flex-1 flex-col">
        <div className="grid grid-cols-3 gap-1 border-b border-slate-800 bg-slate-950/90 px-2 py-1.5 min-[900px]:hidden">
          {cockpitTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={mobilePanel === tab.id}
              data-cockpit-panel-tab={tab.id}
              onClick={() => setMobilePanel(tab.id)}
              className={cx(
                "min-h-8 rounded border px-2 text-[10px] font-semibold leading-tight transition",
                mobilePanel === tab.id
                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                  : "border-slate-600 bg-slate-900/85 text-slate-200 hover:border-slate-500 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden min-[900px]:grid-cols-[280px_minmax(360px,1fr)_300px] min-[1280px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <DomainRadar
          copy={copy.domain}
          accounts={station.domainAccounts}
          selectedDealId={selectedDealId}
          onSelectDeal={setSelectedDealId}
          onOpenFocus={openFocus}
          className={cx(mobilePanel !== "radar" && "max-[899px]:hidden")}
        />
        <LiveTimeline
          copy={copy.timeline}
          events={station.timelineEvents}
          selectedDealId={selectedDealId}
          filter={timelineFilter}
          onFilterChange={setTimelineFilter}
          onSelectDeal={setSelectedDealId}
          onOpenFocus={openFocus}
          approvalState={approvalState}
          approvalStateLabels={copy.approvalStates}
          className={cx(mobilePanel !== "timeline" && "max-[899px]:hidden")}
        />
        <CommandCenter
          copy={copy.commandCenter}
          approvalStateLabels={copy.approvalStates}
          approvals={liveApprovals}
          agents={liveAgents}
          selectedDeal={selectedDeal}
          approvalState={approvalState}
          stats={stats}
          onOpenFocus={openFocus}
          className={cx(mobilePanel !== "command" && "max-[899px]:hidden")}
        />
      </div>
      </div>

      <QuickCommandBar
        copy={copy.quickCommand}
        moduleLinks={station.moduleLinks}
        command={command}
        lastCommand={lastCommand}
        onCommandChange={setCommand}
        onSubmit={submitCommand}
      />
    </div>
  );
}

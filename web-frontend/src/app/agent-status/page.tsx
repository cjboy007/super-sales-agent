"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge, PanelSection, type Tone } from "@/components/ui/BattleTokens";
import { CommandButton } from "@/components/ui/CommandControls";
import { useProject } from "@/lib/project";
import { useSSE } from "@/hooks/useSSE";

interface AgentTask {
  id: string;
  description: string;
  status: "completed" | "running" | "failed" | "pending";
  startedAt: string;
  duration?: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: "online" | "offline" | "busy" | "error";
  lastActive: string;
  tasksCompleted: number;
  tasksRunning: number;
  tasks: AgentTask[];
}

type ActivityEntry = {
  id: string;
  time: string;
  type: string;
  label: string;
  detail: string;
};

function formatRelative(iso: string): string {
  if (!iso) return "NA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusTone(status: string): Tone {
  if (status === "online") return "emerald";
  if (status === "busy") return "amber";
  if (status === "error") return "red";
  return "neutral";
}

function taskTone(status: string): Tone {
  if (status === "completed") return "emerald";
  if (status === "running") return "blue";
  if (status === "failed") return "red";
  if (status === "pending") return "amber";
  return "neutral";
}

function formatDuration(start?: string, end?: string): string | undefined {
  if (!start || !end) return undefined;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) return undefined;
  const minutes = Math.max(1, Math.round((endTime - startTime) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function mapRuntimeTask(task: Record<string, unknown>): AgentTask {
  const status = String(task.status || "pending");
  const startedAt = String(task.started_at || task.updated_at || task.completed_at || new Date().toISOString());
  const completedAt = task.completed_at ? String(task.completed_at) : undefined;
  const updatedAt = task.updated_at ? String(task.updated_at) : undefined;
  return {
    id: String(task.id || ""),
    description: String(task.title || task.current_step || task.output_summary || task.id || "Task"),
    status: status === "completed" || status === "failed" || status === "running" ? status : "pending",
    startedAt,
    duration: formatDuration(startedAt, completedAt || updatedAt),
  };
}

function mapRuntimeAgent(summary: {
  name: string;
  role: string;
  tasksCompletedToday: number;
  tasksFailedToday: number;
  activeTasks: number;
  approvalGated: number;
}, tasks: AgentTask[]): Agent {
  const hasRunning = summary.activeTasks > 0 || summary.approvalGated > 0;
  const status: Agent["status"] = summary.tasksFailedToday > 0
    ? "error"
    : hasRunning
      ? "busy"
      : summary.tasksCompletedToday > 0
        ? "online"
        : "offline";
  const latestTask = tasks[0];
  return {
    id: summary.name,
    name: summary.name,
    role: summary.role,
    status,
    lastActive: latestTask?.startedAt || new Date().toISOString(),
    tasksCompleted: summary.tasksCompletedToday,
    tasksRunning: summary.activeTasks + summary.approvalGated,
    tasks,
  };
}

const statusLabels: Record<string, string> = {
  online: "online",
  offline: "offline",
  busy: "busy",
  error: "error",
  completed: "completed",
  running: "running",
  failed: "failed",
  pending: "pending",
};

function LiveTimeline({ events, connected }: { events: ActivityEntry[]; connected: boolean }) {
  return (
    <PanelSection title="Live Event Stream" action={<Badge tone={connected ? "emerald" : "amber"} pulse={connected}>{connected ? "SSE" : "polling"}</Badge>}>
      <div className="max-h-[360px] overflow-y-auto p-3">
        {events.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-500">Waiting for agent activity</div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="grid grid-cols-[76px_1fr] gap-3 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                <span className="font-mono text-[10px] text-slate-600">{formatRelative(event.time)}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-semibold text-slate-200">{event.label}</p>
                    <Badge tone="blue">{event.type}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelSection>
  );
}

export default function AgentStatusPage() {
  const { apiUrl, projectId } = useProject();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);
  const { lastEvent, eventHistory, isConnected } = useSSE(apiUrl("/api/events"));

  const fetchAgents = useCallback(async () => {
    const fetchId = ++fetchRef.current;
    if (fetchId === 1) setLoading(true);
    setError(null);
    try {
      const runtimeRes = await fetch(apiUrl("/api/agent-state?limit=50"));
      const runtimeJson = await runtimeRes.json();
      if (runtimeRes.ok && runtimeJson?.success && runtimeJson?.data?.agents && Array.isArray(runtimeJson.data.agents) && runtimeJson.data.agents.length > 0) {
        const runtimeTasks = Array.isArray(runtimeJson.data.tasks) ? runtimeJson.data.tasks as Array<Record<string, unknown>> : [];
        const mappedAgents = (runtimeJson.data.agents as Array<{
          name: string;
          role: string;
          tasksCompletedToday: number;
          tasksFailedToday: number;
          activeTasks: number;
          approvalGated: number;
        }>).map((summary) => {
          const agentTasks = runtimeTasks
            .filter((task) => String(task.agent || "") === summary.name)
            .map(mapRuntimeTask)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .slice(0, 8);
          return mapRuntimeAgent(summary, agentTasks);
        });
        if (fetchId === fetchRef.current) setAgents(mappedAgents);
        return;
      }

      const fallbackRes = await fetch(apiUrl("/api/agents"));
      if (!fallbackRes.ok) throw new Error(`Request failed (${fallbackRes.status})`);
      const data = await fallbackRes.json();
      if (fetchId === fetchRef.current) setAgents(Array.isArray(data.data) ? data.data : []);
    } catch (e: unknown) {
      if (fetchId === fetchRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fetchId === fetchRef.current) setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);
  useEffect(() => { setSelectedAgent(null); fetchAgents(); }, [fetchAgents, projectId]);
  useEffect(() => {
    const timer = window.setInterval(fetchAgents, 30_000);
    return () => window.clearInterval(timer);
  }, [fetchAgents]);
  useEffect(() => {
    if (lastEvent?.type === "agent-update") setAgents((prev) => [...prev]);
  }, [lastEvent]);

  const timelineEntries: ActivityEntry[] = useMemo(() => {
    const entries: ActivityEntry[] = [];
    for (const event of eventHistory) {
      const data = event.data as Record<string, unknown>;
      if (event.type === "agent-update" && data?.label === "heartbeat") {
        const lastEmail = data.lastEmail as { company?: string; subject?: string } | null;
        entries.push({
          id: `heartbeat-${event.timestamp}`,
          time: event.timestamp,
          type: "heartbeat",
          label: "Agent heartbeat",
          detail: lastEmail?.company ? `Last email: ${lastEmail.company} / ${lastEmail.subject || ""}` : "Runtime heartbeat received",
        });
        continue;
      }
      if (event.type === "email-sent") {
        const detail = data as { company?: string; subject?: string };
        entries.push({
          id: `${event.type}-${event.timestamp}`,
          time: event.timestamp,
          type: "email",
          label: `Email event / ${detail.company || "unknown"}`,
          detail: detail.subject || "",
        });
        continue;
      }
      if (event.type === "email-progress") {
        const detail = data as { entries?: Array<{ company: string; subject: string }> };
        entries.push({
          id: `${event.type}-${event.timestamp}`,
          time: event.timestamp,
          type: "progress",
          label: `Email progress / ${detail.entries?.length || 0} records`,
          detail: detail.entries?.[0] ? `${detail.entries[0].company} / ${detail.entries[0].subject}` : "Progress update",
        });
        continue;
      }
      entries.push({
        id: `${event.type}-${event.timestamp}`,
        time: event.timestamp,
        type: event.type,
        label: event.type.replace(/-/g, " "),
        detail: JSON.stringify(data).slice(0, 120),
      });
    }
    const seen = new Set<string>();
    return entries
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      })
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 20);
  }, [eventHistory]);

  const selected = agents.find((agent) => agent.id === selectedAgent) || agents[0] || null;
  const totalCompleted = agents.reduce((sum, agent) => sum + (agent.tasksCompleted || 0), 0);
  const totalRunning = agents.reduce((sum, agent) => sum + (agent.tasksRunning || 0), 0);
  const onlineCount = agents.filter((agent) => agent.status === "online" || agent.status === "busy").length;

  return (
    <PageShell>
      <PageHeader title="Agent Runtime" meta={`${projectId} / ${onlineCount}-${agents.length} active / standalone SSA state`}>
        <CommandButton variant="ghost" size="xs" onClick={fetchAgents} disabled={loading}>Refresh</CommandButton>
        <Badge tone={isConnected ? "emerald" : "amber"} pulse={isConnected}>{isConnected ? "live" : "reconnect"}</Badge>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
        <section className="min-h-0 border-r border-slate-800 bg-slate-900/35 lg:col-span-3">
          <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Agent List</h2>
            <p className="mt-0.5 font-mono text-[10px] text-slate-600">{agents.length} tracked workers</p>
          </div>
          <div className="h-full overflow-y-auto p-3 pb-14">
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[
                ["Online", onlineCount, "emerald" as Tone],
                ["Running", totalRunning, "blue" as Tone],
                ["Done", totalCompleted, "purple" as Tone],
              ].map(([label, value, tone]) => (
                <div key={label as string} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-200">{loading ? "..." : value}</p>
                  <Badge tone={tone as Tone}>{tone as string}</Badge>
                </div>
              ))}
            </div>
            {error ? (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">{error}</div>
            ) : agents.length === 0 ? (
              <div className="rounded-md border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-500">No agent records</div>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left ${selected?.id === agent.id ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-200">{agent.name}</p>
                        <p className="truncate text-[10px] text-slate-600">{agent.role}</p>
                      </div>
                      <Badge tone={statusTone(agent.status)}>{statusLabels[agent.status]}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-600">
                      <span>{formatRelative(agent.lastActive)}</span>
                      <span>{agent.tasksCompleted} tasks</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="min-h-0 border-r border-slate-800 bg-slate-950/65 lg:col-span-5">
          <div className="h-full overflow-y-auto p-3">
            <LiveTimeline events={timelineEntries} connected={isConnected} />
          </div>
        </section>

        <section className="min-h-0 bg-slate-900/35 lg:col-span-4">
          <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Agent Detail</h2>
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">{selected?.id || "none"}</p>
          </div>
          <div className="h-full overflow-y-auto p-3 pb-14">
            {!selected ? (
              <PanelSection title="No Agent Selected">
                <div className="p-8 text-center text-xs text-slate-500">Select an agent to inspect runtime state.</div>
              </PanelSection>
            ) : (
              <div className="space-y-3">
                <PanelSection title={selected.name} action={<Badge tone={statusTone(selected.status)}>{selected.status}</Badge>}>
                  <div className="grid grid-cols-3 divide-x divide-slate-800 border-b border-slate-800">
                    <div className="px-3 py-3 text-center">
                      <p className="font-mono text-lg font-semibold text-slate-100">{selected.tasksCompleted}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-600">done</p>
                    </div>
                    <div className="px-3 py-3 text-center">
                      <p className="font-mono text-lg font-semibold text-blue-400">{selected.tasksRunning}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-600">running</p>
                    </div>
                    <div className="px-3 py-3 text-center">
                      <p className="font-mono text-xs font-semibold text-slate-300">{formatRelative(selected.lastActive)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-600">active</p>
                    </div>
                  </div>
                  <div className="px-3 py-2 text-xs leading-relaxed text-slate-400">{selected.role}</div>
                </PanelSection>

                <PanelSection title="Task Records">
                  <div className="divide-y divide-slate-800">
                    {selected.tasks?.length ? selected.tasks.map((task) => (
                      <div key={task.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs text-slate-200">{task.description}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                            {task.startedAt ? `${formatRelative(task.startedAt)} start` : "queued"}
                            {task.duration ? ` / ${task.duration}` : ""}
                          </p>
                        </div>
                        <Badge tone={taskTone(task.status)}>{statusLabels[task.status]}</Badge>
                      </div>
                    )) : (
                      <div className="p-8 text-center text-xs text-slate-500">No task records</div>
                    )}
                  </div>
                </PanelSection>
              </div>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

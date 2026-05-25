import type { Agent } from "@/lib/agents";

export interface RuntimeAgentSummary {
  name: string;
  role: string;
  tasksCompletedToday: number;
  tasksFailedToday: number;
  activeTasks: number;
  approvalGated: number;
}

export interface RuntimeAgentTaskRow {
  id: string;
  agent: string;
  status: string;
  title: string;
  started_at?: string;
  updated_at?: string;
  completed_at?: string;
  progress?: number;
  current_step?: string;
  error?: string;
  output_summary?: string;
}

const FRIENDLY_NAMES: Record<string, string> = {
  shadow: "影刃 Shadow",
  iron: "铁腕 Iron",
  warden: "基石 Warden",
  oracle: "天眼 Oracle",
  phoenix: "凤凰 Phoenix",
};

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

function mapTask(row: RuntimeAgentTaskRow): Agent["tasks"][number] {
  const startedAt = row.started_at || row.updated_at || row.completed_at || new Date().toISOString();
  const completedAt = row.completed_at || row.updated_at;
  const status = row.status === "completed" || row.status === "failed" || row.status === "running"
    ? row.status
    : "pending";

  return {
    id: row.id,
    description: row.title || row.current_step || row.output_summary || row.id,
    status,
    startedAt,
    duration: formatDuration(startedAt, completedAt),
    agentId: row.agent,
  };
}

function mapAgent(summary: RuntimeAgentSummary, tasks: RuntimeAgentTaskRow[]): Agent {
  const orderedTasks = tasks
    .filter((task) => task.agent === summary.name)
    .sort((a, b) => {
      const left = new Date(b.started_at || b.updated_at || b.completed_at || 0).getTime();
      const right = new Date(a.started_at || a.updated_at || a.completed_at || 0).getTime();
      return left - right;
    })
    .slice(0, 6)
    .map(mapTask);

  const tasksRunning = summary.activeTasks + summary.approvalGated;
  const status: Agent["status"] = summary.tasksFailedToday > 0
    ? "error"
    : tasksRunning > 0
      ? "busy"
      : summary.tasksCompletedToday > 0
        ? "online"
        : "offline";

  const lastActiveTask = orderedTasks[0];

  return {
    id: summary.name,
    name: FRIENDLY_NAMES[summary.name] || summary.name,
    role: summary.role,
    status,
    lastActive: lastActiveTask?.startedAt || new Date().toISOString(),
    tasksCompleted: summary.tasksCompletedToday,
    tasksRunning,
    tasks: orderedTasks,
  };
}

export function mapRuntimeAgentStateToAgents(
  summaries: RuntimeAgentSummary[],
  tasks: RuntimeAgentTaskRow[]
): Agent[] {
  return summaries.map((summary) => mapAgent(summary, tasks));
}

export function mapRuntimeAgentStateToAgent(
  summary: RuntimeAgentSummary | undefined,
  tasks: RuntimeAgentTaskRow[]
): Agent | null {
  if (!summary) return null;
  return mapAgent(summary, tasks);
}

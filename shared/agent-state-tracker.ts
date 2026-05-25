// ── Agent State Tracker for SSA Battle Station ──
// Tracks lifecycle of Shadow, Iron, Warden, Oracle tasks.
// Reference: Hermes kanban pattern (SQLite-backed, WebSocket real-time push).

export type AgentName = "shadow" | "iron" | "warden" | "oracle" | "phoenix";
export type TaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "approval_gated";

export interface AgentTask {
  id: string;          // e.g. "shadow-20260523-001"
  agent: AgentName;
  status: TaskStatus;
  title: string;       // human-readable summary
  dealId?: string;     // linked deal/account
  startedAt: string;   // ISO 8601
  updatedAt?: string;   // ISO 8601
  completedAt?: string;
  // Progress: 0-100 for running tasks
  progress: number;
  // Current step description for running tasks
  currentStep?: string;
  // Error message if failed
  error?: string;
  // Output summary when completed
  outputSummary?: string;
  // Metadata for audit/debugging
  metadata?: Record<string, unknown>;
}

export interface AgentStatus {
  name: AgentName;
  role: string;
  currentTaskId?: string;
  status: "idle" | "busy" | "error" | "approval_gated";
  tasksCompletedToday: number;
  tasksFailedToday: number;
  queueLength: number;
  lastHeartbeat: string; // ISO 8601
}

// ── Agent Role Definitions ──
export const AGENT_ROLES: Record<AgentName, string> = {
  shadow: "Customer intel and background research",
  iron: "Email triage, drafts, and customer outreach",
  warden: "Product specs and knowledge base maintenance",
  oracle: "Market trends and pricing intelligence",
  phoenix: "System health and safety review",
};

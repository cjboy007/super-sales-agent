/**
 * In-memory event bus for real-time SSE push.
 * Server-side only — safe for Edge/Node runtime.
 */

export type AgentEventType =
  | "agent-update"
  | "email-progress"
  | "new-lead"
  | "email-sent"
  | "research-complete"
  | "operator-command";

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  timestamp: string; // ISO
  data: Record<string, unknown>;
}

// ── Event Bus (singleton) ──

type Listener = (event: AgentEvent) => void;

const listeners = new Set<Listener>();

export function publish(event: Omit<AgentEvent, "id" | "timestamp">): AgentEvent {
  const fullEvent: AgentEvent = {
    ...event,
    id: `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  Array.from(listeners).forEach((fn) => {
    try {
      fn(fullEvent);
    } catch {
      // ignore listener errors
    }
  });
  return fullEvent;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Get a snapshot of recent events (up to `limit`).
 * Used by SSE route to send initial state to new clients.
 */
const recentEvents: AgentEvent[] = [];
const MAX_RECENT = 50;

export function publishAndRemember(event: Omit<AgentEvent, "id" | "timestamp">): AgentEvent {
  const full = publish(event);
  recentEvents.unshift(full);
  if (recentEvents.length > MAX_RECENT) recentEvents.length = MAX_RECENT;
  return full;
}

export function getRecentEvents(limit = 20): AgentEvent[] {
  return recentEvents.slice(0, limit);
}

/**
 * Seed recent sent-log entries as "email-sent" events on first call.
 * This ensures new SSE clients see historical context.
 */
let seeded = false;

export function seedSentLogEvents(): AgentEvent[] {
  if (seeded) return getRecentEvents();
  seeded = true;

  try {
    // Dynamic import for server-side only
    const fs = require("fs");
    const { ssaDataPath } = require("./ssa-data-paths");
    const logPath = ssaDataPath("mail", "sent-log.json");
    if (!fs.existsSync(logPath)) return getRecentEvents();

    const entries = JSON.parse(fs.readFileSync(logPath, "utf-8")) as Array<{
      email: string;
      company: string;
      sent_at: string;
      subject: string;
      tracking_id?: string;
    }>;

    // Seed the most recent 20 entries as events (oldest first for chronological order)
    entries
      .slice(-20)
      .forEach((e) => {
        const evt: AgentEvent = {
          id: `seed-${e.tracking_id || e.email}-${Date.now()}`,
          type: "email-sent",
          timestamp: e.sent_at,
          data: {
            company: e.company,
            email: e.email,
            subject: e.subject,
          },
        };
        recentEvents.push(evt);
      });

    // Sort by timestamp descending
    recentEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (recentEvents.length > MAX_RECENT) recentEvents.length = MAX_RECENT;
  } catch {
    // silently ignore — sent-log may not exist or be malformed
  }

  return getRecentEvents();
}

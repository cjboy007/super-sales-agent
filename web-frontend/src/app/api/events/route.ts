import { NextRequest } from "next/server";
import { subscribe, getRecentEvents, seedSentLogEvents } from "@/lib/events";
import { createSalesRuntime } from "@/lib/runtime";
import { publicAgentEvent } from "@/lib/runtime/activity-stream";
import { requireWorkspaceSession, type WorkspaceAccessSession } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function scopedWorkspaces(session: WorkspaceAccessSession): string[] {
  return session.workspaces.includes("*") ? [] : session.workspaces;
}

function canSeeEvent(session: WorkspaceAccessSession, event: { data?: unknown }): boolean {
  const workspaces = scopedWorkspaces(session);
  if (workspaces.length === 0) return true;
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
  const scope = typeof data.workspaceScope === "string" ? data.workspaceScope : "";
  return !scope || workspaces.includes(scope);
}

function removeEventScope<T extends { data?: unknown }>(event: T): T {
  if (!event.data || typeof event.data !== "object") return event;
  const { workspaceScope: _workspaceScope, ...data } = event.data as Record<string, unknown>;
  return { ...event, data } as T;
}

function getActivitySnapshot(session: WorkspaceAccessSession, limit = 20) {
  const runtime = createSalesRuntime();
  const workspaces = scopedWorkspaces(session);
  const runtimeEvents = workspaces.length
    ? workspaces.flatMap((workspaceId) => runtime.listActivityEvents(limit, workspaceId))
    : runtime.listActivityEvents(limit);
  const liveEvents = getRecentEvents(limit);
  const seen = new Set<string>();
  return [...runtimeEvents, ...liveEvents]
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit)
    .map(publicAgentEvent)
    .filter((event) => canSeeEvent(session, event))
    .map(removeEventScope);
}

function getSentLogSnapshot(session: WorkspaceAccessSession, limit = 10) {
  const runtime = createSalesRuntime();
  const workspaces = scopedWorkspaces(session);
  return workspaces.length
    ? workspaces.flatMap((workspaceId) => runtime.getSentLogSnapshot(limit, workspaceId))
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
      .slice(0, limit)
    : runtime.getSentLogSnapshot(limit);
}

function seedScopedSentLogEvents(session: WorkspaceAccessSession) {
  const workspaces = scopedWorkspaces(session);
  if (workspaces.length === 0) {
    seedSentLogEvents();
    return;
  }
  for (const workspaceId of workspaces) seedSentLogEvents(workspaceId);
}

export async function GET(request: NextRequest) {
  const auth = requireWorkspaceSession(request);
  if (!auth.ok) return auth.response;

  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    unsubscribe();
  }

  function send(
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: string,
    data: unknown
  ) {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(sseMessage(event, data)));
    } catch {
      cleanup();
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      // Seed historical events on first call
      seedScopedSentLogEvents(auth.session);

      // Send initial snapshot — recent sent-log entries
      const sentLog = getSentLogSnapshot(auth.session);
      if (sentLog.length > 0) {
        send(controller, "email-progress", {
          label: "recent-emails",
          entries: sentLog.map((entry) => ({
            email: entry.email,
            company: entry.company || "",
            sentAt: entry.sent_at,
            subject: entry.subject,
          })),
          total: sentLog.length,
        });
      }

      // Send initial agent state snapshot
      const recentEvents = getActivitySnapshot(auth.session, 20);
      send(controller, "agent-update", {
        label: "activity-stream",
        events: recentEvents,
      });

      // Subscribe to live events and push them
      unsubscribe = subscribe((event) => {
        const publicEvent = publicAgentEvent(event);
        if (!canSeeEvent(auth.session, publicEvent)) return;
        send(controller, publicEvent.type, removeEventScope(publicEvent));
      });

      // Periodic heartbeat — push current agent state every 5s
      heartbeat = setInterval(() => {
        const sentLog = getSentLogSnapshot(auth.session);
        send(controller, "agent-update", {
          label: "heartbeat",
          timestamp: new Date().toISOString(),
          totalEmailsSent: sentLog.length,
          lastEmail: sentLog[0]
            ? {
              email: sentLog[0].email,
              company: sentLog[0].company || "",
              sentAt: sentLog[0].sent_at,
              subject: sentLog[0].subject,
            }
            : null,
        });
      }, 5_000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

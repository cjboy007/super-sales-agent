import { NextRequest } from "next/server";
import { subscribe, getRecentEvents, seedSentLogEvents } from "@/lib/events";
import { createSalesRuntime } from "@/lib/runtime";
import { requireBetaAuth } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function getActivitySnapshot(limit = 20) {
  const runtimeEvents = createSalesRuntime().listActivityEvents(limit);
  const liveEvents = getRecentEvents(limit);
  const seen = new Set<string>();
  return [...runtimeEvents, ...liveEvents]
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  const auth = requireBetaAuth(request);
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
      seedSentLogEvents();

      // Send initial snapshot — recent sent-log entries
      const sentLog = createSalesRuntime().getSentLogSnapshot();
      if (sentLog.length > 0) {
        send(controller, "email-progress", {
          label: "recent-emails",
          entries: sentLog,
          total: sentLog.length,
        });
      }

      // Send initial agent state snapshot
      const recentEvents = getActivitySnapshot(20);
      send(controller, "agent-update", {
        label: "activity-stream",
        events: recentEvents,
      });

      // Subscribe to live events and push them
      unsubscribe = subscribe((event) => {
        send(controller, event.type, event);
      });

      // Periodic heartbeat — push current agent state every 5s
      heartbeat = setInterval(() => {
        const sentLog = createSalesRuntime().getSentLogSnapshot();
        send(controller, "agent-update", {
          label: "heartbeat",
          timestamp: new Date().toISOString(),
          totalEmailsSent: sentLog.length,
          lastEmail: sentLog[0] || null,
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

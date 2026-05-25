import { subscribe, getRecentEvents, seedSentLogEvents } from "@/lib/events";
import fs from "fs";
import { paths } from "@/lib/ssa-paths";

export const dynamic = "force-dynamic";

// Read sent-log.json and return recent entries as SSE event data
function getSentLogSnapshot() {
  const logPath = paths.heroSentLog;
  try {
    if (!fs.existsSync(logPath)) return [];
    const entries = JSON.parse(fs.readFileSync(logPath, "utf-8")) as Array<{
      email: string;
      company: string;
      sent_at: string;
      subject: string;
    }>;
    return entries.slice(-10).reverse(); // most recent first
  } catch {
    return [];
  }
}

const encoder = new TextEncoder();

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        request.signal.removeEventListener("abort", close);
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseMessage(event, data)));
        } catch {
          close();
        }
      };

      cleanup = close;
      request.signal.addEventListener("abort", close, { once: true });

      // Seed historical events on first call
      seedSentLogEvents();

      // Send initial snapshot — recent sent-log entries
      const sentLog = getSentLogSnapshot();
      if (sentLog.length > 0) {
        send("email-progress", {
          label: "recent-emails",
          entries: sentLog,
          total: sentLog.length,
        });
      }

      // Send initial agent state snapshot
      const recentEvents = getRecentEvents(20);
      send("agent-update", {
        label: "activity-stream",
        events: recentEvents,
      });

      // Subscribe to live events and push them
      unsubscribe = subscribe((event) => send(event.type, event));

      // Periodic heartbeat — push current agent state every 5s
      heartbeat = setInterval(() => {
        const sentLog = getSentLogSnapshot();
        send("agent-update", {
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

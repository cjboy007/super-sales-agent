import fs from "fs";
import type { AgentEvent, AgentEventType } from "../events";
import type { RuntimeEvent } from "./types";
import { ssaCompanyDataPath } from "../ssa-data-paths";

type PublicActivityStatus = "queued" | "running" | "completed" | "failed" | "blocked" | "sent" | "received" | "updated";

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function eventTypeForRuntimeEvent(event: RuntimeEvent): AgentEventType {
  if (event.type === "operator.command.queued") return "operator-command";
  if (event.type.includes("email")) return "email-progress";
  if (event.type.includes("lead")) return "new-lead";
  if (event.type.includes("research")) return "research-complete";
  return "agent-update";
}

function eventLabel(event: RuntimeEvent): string {
  if (event.type === "operator.command.queued") return "operator-command";
  if (event.type === "side_effect.requested") return "side-effect-request";
  if (event.type === "workflow.completed") return "workflow-completed";
  if (event.type === "llm.task.completed") return "llm-task";
  return event.type;
}

function publicTitleForRuntimeEvent(event: RuntimeEvent): string {
  if (event.type.includes("inbox") || event.type.includes("email")) return "Mailbox activity";
  if (event.type.includes("lead")) return "Customer import";
  if (event.type.includes("company_intel")) return "Customer background check";
  if (event.type.includes("side_effect") || event.type.includes("crm.write")) return "Action review";
  if (event.type.includes("operator.command")) return "Operator request";
  if (event.type.includes("order")) return "Order update";
  if (event.type.includes("config")) return "Settings update";
  if (event.type.includes("worker")) return "Worker activity";
  return "System activity";
}

function publicStatusForRuntimeEvent(event: RuntimeEvent): PublicActivityStatus {
  const status = stringValue(event.payload.status).toLowerCase();
  if (status.includes("fail")) return "failed";
  if (status.includes("reject") || status.includes("blocked")) return "blocked";
  if (status.includes("sent")) return "sent";
  if (status.includes("received")) return "received";
  if (status.includes("complete") || status.includes("executed") || status.includes("approved")) return "completed";
  if (status.includes("running") || status.includes("processing")) return "running";
  if (status.includes("queue") || status.includes("pending")) return "queued";
  if (event.type.includes("failed")) return "failed";
  if (event.type.includes("requested") || event.type.includes("queued")) return "queued";
  if (event.type.includes("completed") || event.type.includes("executed") || event.type.includes("synced")) return "completed";
  if (event.type.includes("received")) return "received";
  return "updated";
}

function publicActivityId(timestamp: string, indexKey: string): string {
  const hash = Math.abs(Array.from(indexKey).reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0));
  const compactTime = timestamp.replace(/[^0-9]/g, "").slice(0, 14) || "activity";
  return `activity-${compactTime}-${hash.toString(36)}`;
}

function publicSummaryForRuntimeEvent(event: RuntimeEvent): string {
  const payload = event.payload;
  if (event.type === "operator.command.queued") {
    const page = stringValue(payload.page, "current page");
    return `Request accepted from ${page}. Customer-facing actions remain gated for review.`;
  }
  if (event.type.includes("lead")) {
    const customer = stringValue(payload.companyName || payload.customerName || payload.customer, "customer");
    return `Customer record updated for ${customer}.`;
  }
  if (event.type.includes("company_intel")) {
    const customer = stringValue(payload.companyName || payload.customerName || payload.customer, "customer");
    return `Background check activity updated for ${customer}.`;
  }
  if (event.type.includes("inbox") || event.type.includes("email")) {
    const customer = stringValue(payload.customerName || payload.company || payload.email, "mailbox");
    return `Mailbox activity recorded for ${customer}.`;
  }
  if (event.type.includes("side_effect") || event.type.includes("crm.write")) {
    const reason = stringValue(payload.reason);
    return reason || "External action is waiting for review or execution result.";
  }
  if (event.type.includes("worker")) return "Worker health or queue activity changed.";
  if (event.type.includes("config")) return "Settings were updated.";
  return "Recent system activity was recorded.";
}

export function runtimeEventToAgentEvent(event: RuntimeEvent): AgentEvent {
  return {
    id: event.id,
    type: eventTypeForRuntimeEvent(event),
    timestamp: event.createdAt,
    data: {
      label: eventLabel(event),
      runtimeEventId: event.id,
      runtimeEventType: event.type,
      workspaceId: event.workspaceId,
      createdAt: event.createdAt,
      ...event.payload,
    },
  };
}

export function runtimeEventsToAgentEvents(events: RuntimeEvent[], limit = 20): AgentEvent[] {
  return events.slice(0, limit).map(runtimeEventToAgentEvent);
}

export function runtimeEventToPublicAgentEvent(event: RuntimeEvent): AgentEvent {
  return {
    id: publicActivityId(event.createdAt, event.id),
    type: eventTypeForRuntimeEvent(event),
    timestamp: event.createdAt,
    data: {
      title: publicTitleForRuntimeEvent(event),
      summary: publicSummaryForRuntimeEvent(event),
      status: publicStatusForRuntimeEvent(event),
      createdAt: event.createdAt,
    },
  };
}

export function runtimeEventsToPublicAgentEvents(events: RuntimeEvent[], limit = 20): AgentEvent[] {
  return events.slice(0, limit).map(runtimeEventToPublicAgentEvent);
}

export function publicAgentEvent(event: AgentEvent): AgentEvent {
  const data = event.data || {};
  const title = stringValue(data.title)
    || (event.type === "operator-command" ? "Operator request"
      : event.type === "email-progress" || event.type === "email-sent" ? "Mailbox activity"
        : event.type === "new-lead" ? "Customer import"
          : event.type === "research-complete" ? "Customer background check"
            : "System activity");
  const page = stringValue(data.page);
  const summary = stringValue(data.summary)
    || (event.type === "operator-command" && page ? `Request accepted from ${page}. Customer-facing actions remain gated for review.` : "")
    || (event.type !== "operator-command" ? stringValue(data.message) : "")
    || stringValue(data.subject)
    || (event.type === "operator-command" ? "Request accepted. Customer-facing actions remain gated for review." : "Recent activity was recorded.");
  const rawStatus = stringValue(data.status, event.type === "email-sent" ? "sent" : "updated").toLowerCase();
  const status = rawStatus.includes("fail") ? "failed"
    : rawStatus.includes("queue") || rawStatus.includes("pending") ? "queued"
      : rawStatus.includes("sent") ? "sent"
        : rawStatus.includes("complete") || rawStatus.includes("executed") ? "completed"
          : "updated";

  return {
    id: publicActivityId(event.timestamp, event.id),
    type: event.type,
    timestamp: event.timestamp,
    data: {
      title,
      summary,
      status,
      createdAt: event.timestamp,
      workspaceScope: stringValue(data.workspaceId),
    },
  };
}

export function publicAgentEvents(events: AgentEvent[], limit = 20): AgentEvent[] {
  return events.slice(0, limit).map(publicAgentEvent);
}

export interface SentLogSnapshotEntry {
  email: string;
  company?: string;
  sent_at: string;
  subject: string;
}

export function getSentLogSnapshot(limit = 10, workspaceId = "farreach"): SentLogSnapshotEntry[] {
  try {
    const logPath = ssaCompanyDataPath(workspaceId, "mail", "sent-log.json");
    if (!fs.existsSync(logPath)) return [];
    const entries = JSON.parse(fs.readFileSync(logPath, "utf-8")) as SentLogSnapshotEntry[];
    return entries.slice(-limit).reverse();
  } catch {
    return [];
  }
}

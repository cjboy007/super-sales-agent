import fs from "fs";
import type { AgentEvent, AgentEventType } from "../events";
import type { RuntimeEvent } from "./types";
import { ssaCompanyDataPath } from "../ssa-data-paths";

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

export interface SentLogSnapshotEntry {
  email: string;
  company?: string;
  sent_at: string;
  subject: string;
}

export function getSentLogSnapshot(limit = 10): SentLogSnapshotEntry[] {
  try {
    const logPath = ssaCompanyDataPath("farreach", "mail", "sent-log.json");
    if (!fs.existsSync(logPath)) return [];
    const entries = JSON.parse(fs.readFileSync(logPath, "utf-8")) as SentLogSnapshotEntry[];
    return entries.slice(-limit).reverse();
  } catch {
    return [];
  }
}

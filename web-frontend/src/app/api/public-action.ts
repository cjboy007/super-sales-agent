import type { SideEffectDecision } from "@/lib/runtime";

export interface PublicActionView {
  actionId: string;
  title: string;
  status: SideEffectDecision["status"];
  blocked: boolean;
  canRetry: boolean;
  requestedAt: string;
  updatedAt?: string;
  reason: string;
}

interface InternalCrmSyncSummary {
  workspaceId?: unknown;
  received?: unknown;
  newActivities?: unknown;
  orderActivities?: unknown;
  customersUpserted?: unknown;
  companyIntelQueued?: unknown;
  lifecycleStatuses?: unknown;
}

interface PublicCrmSyncSummary {
  received: number;
  timelineActivities: number;
  orderActivities: number;
  customersUpdated: number;
  lifecycleUpdates: number;
}

export function cleanPublicText(value: string): string {
  const text = value
    .replace(/\/Users\/[^\s"'`]+/g, "the local runtime")
    .replace(/\.ssa\/[^\s"'`]+/g, "the local runtime")
    .replace(/\bprovider\b/gi, "service")
    .replace(/\bSSA_ENABLE_REAL_[A-Z_]+=true\b/g, "explicit enablement")
    .replace(/\bSSA_ENABLE_[A-Z_]+=true\b/g, "explicit enablement")
    .replace(/\bside effects?\b/gi, "external action")
    .slice(0, 260);
  if (/Real execution blocked by default/i.test(text)) {
    return "External action is blocked by default and needs explicit approval plus explicit enablement before it can run.";
  }
  return text;
}

function titleForAction(kind: SideEffectDecision["kind"]): string {
  if (kind === "email.send") return "Customer email send";
  if (kind === "crm.write") return "CRM update";
  if (kind === "imap.fetch") return "Mailbox sync";
  if (kind === "document.generate") return "Document generation";
  if (kind === "document.preview") return "Document preview";
  if (kind === "price.discount") return "Price adjustment";
  if (kind === "data.read") return "Data access";
  if (kind === "bank.read") return "Bank data check";
  if (kind === "payment.write") return "Payment update";
  if (kind === "feishu.notify") return "Team notification";
  return "External action";
}

function canRetry(decision: SideEffectDecision): boolean {
  if (decision.status === "retry_requested") return true;
  if (decision.execution?.status === "failed") return decision.execution.canRetry !== false;
  return decision.status === "blocked" || decision.status === "execution_failed";
}

export function publicActionView(decision: SideEffectDecision): PublicActionView {
  return {
    actionId: decision.id,
    title: titleForAction(decision.kind),
    status: decision.status,
    blocked: decision.status === "blocked" || decision.status === "rejected" || decision.status === "execution_failed",
    canRetry: canRetry(decision),
    requestedAt: decision.createdAt,
    updatedAt: decision.updatedAt || decision.execution?.executedAt || decision.execution?.failedAt,
    reason: cleanPublicText(decision.execution?.error || decision.reason),
  };
}

export function withPublicAction<T extends { sideEffect?: SideEffectDecision }>(result: T): Omit<T, "sideEffect"> & {
  action?: PublicActionView;
  crm?: PublicCrmSyncSummary;
} {
  const { sideEffect, ...rest } = result as T & { crm?: InternalCrmSyncSummary };
  return {
    ...rest,
    crm: rest.crm ? {
      received: Number(rest.crm.received || 0),
      timelineActivities: Number(rest.crm.newActivities || 0),
      orderActivities: Number(rest.crm.orderActivities || 0),
      customersUpdated: Number(rest.crm.customersUpserted || 0),
      lifecycleUpdates: Number(rest.crm.lifecycleStatuses || 0),
    } : undefined,
    action: sideEffect ? publicActionView(sideEffect) : undefined,
  };
}

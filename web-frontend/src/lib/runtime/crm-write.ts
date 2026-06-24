import fs from "fs";
import path from "path";
import {
  appendCustomerActivity,
  appendCustomerOrderActivity,
  type CustomerActivityRecord,
} from "./customer-activity";
import { ssaCompanyDataPath } from "../ssa-data-paths";
import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision, WorkspaceId } from "./types";

export interface CrmWriteInput {
  workspaceId: WorkspaceId;
  customerId?: unknown;
  customerName?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  subject?: unknown;
  summary?: unknown;
  occurredAt?: unknown;
  decisionId?: unknown;
  orderNumber?: unknown;
  orderType?: unknown;
  productType?: unknown;
  amount?: unknown;
  lifecycleStage?: unknown;
  paymentStatus?: unknown;
  fulfillmentStatus?: unknown;
  status?: unknown;
  summaryExplicit?: unknown;
}

export interface CrmWriteRequestView {
  decisionId: string;
  kind: "crm.write";
  status: SideEffectDecision["status"];
  realExecutionEnabled: boolean;
  reason: string;
  customerName: string;
  subject: string;
}

export interface CrmWriteExecutionView {
  status: "executed";
  customerId: string;
  customerName: string;
  subject: string;
  activityType: "Follow-up" | "Order";
  occurredAt: string;
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function domainFromEmail(value: string): string {
  return value.includes("@") ? (value.split("@").pop() || "").replace(/^www\./i, "") : "";
}

function customerIdFromInput(input: CrmWriteInput): string {
  return cleanText(input.customerId)
    || domainFromEmail(cleanText(input.contactEmail))
    || cleanText(input.customerName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    || "unknown-customer";
}

function customerNameFromInput(input: CrmWriteInput): string {
  return cleanText(input.customerName, cleanText(input.contactEmail, "Unknown customer"));
}

function subjectFromInput(input: CrmWriteInput): string {
  return cleanText(input.subject, "CRM follow-up");
}

function summaryFromInput(input: CrmWriteInput): string {
  return cleanText(input.summary, subjectFromInput(input));
}

function crmFlagEnabled(): boolean {
  return process.env.SSA_ENABLE_REAL_CRM_WRITE === "true";
}

function crmPayload(input: CrmWriteInput): Record<string, unknown> {
  return {
    customerId: customerIdFromInput(input),
    customerName: customerNameFromInput(input),
    contactName: cleanText(input.contactName),
    contactEmail: cleanText(input.contactEmail),
    subject: subjectFromInput(input),
    summary: summaryFromInput(input),
    summaryExplicit: typeof input.summaryExplicit === "boolean" ? input.summaryExplicit : Boolean(cleanText(input.summary)),
    occurredAt: cleanText(input.occurredAt, new Date().toISOString()),
    orderNumber: cleanText(input.orderNumber),
    orderType: cleanText(input.orderType),
    productType: cleanText(input.productType),
    amount: cleanText(input.amount),
    lifecycleStage: cleanText(input.lifecycleStage),
    paymentStatus: cleanText(input.paymentStatus),
    fulfillmentStatus: cleanText(input.fulfillmentStatus),
    status: cleanText(input.status),
  };
}

function executionFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "CRM write execution failed.");
}

function recordCrmExecutionFailure(runtime: SalesRuntime, decisionId: string, error: unknown): never {
  runtime.recordSideEffectFailed(decisionId, {
    error: executionFailureMessage(error),
    canRetry: true,
  });
  throw error;
}

function restoreFileSnapshot(filePath: string, snapshot: string | null) {
  if (snapshot === null) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, snapshot, "utf-8");
}

function withCrmExecutionRollback<T>(workspaceId: WorkspaceId, action: () => T): T {
  const files = [
    ssaCompanyDataPath(workspaceId, "customers", "activity.json"),
    ssaCompanyDataPath(workspaceId, "memory", "records.json"),
    ssaCompanyDataPath(workspaceId, "events", "events.json"),
  ];
  const snapshots = files.map((filePath) => ({
    filePath,
    content: fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null,
  }));

  try {
    return action();
  } catch (error) {
    for (const snapshot of snapshots) {
      restoreFileSnapshot(snapshot.filePath, snapshot.content);
    }
    throw error;
  }
}

function decisionPayload(decision: SideEffectDecision): CrmWriteInput {
  return {
    workspaceId: decision.workspaceId,
    customerId: decision.payload.customerId,
    customerName: decision.payload.customerName,
    contactName: decision.payload.contactName,
    contactEmail: decision.payload.contactEmail,
    subject: decision.payload.subject,
    summary: decision.payload.summary,
    occurredAt: decision.payload.occurredAt,
    orderNumber: decision.payload.orderNumber,
    orderType: decision.payload.orderType,
    productType: decision.payload.productType,
    amount: decision.payload.amount,
    lifecycleStage: decision.payload.lifecycleStage,
    paymentStatus: decision.payload.paymentStatus,
    fulfillmentStatus: decision.payload.fulfillmentStatus,
    status: decision.payload.status,
    summaryExplicit: decision.payload.summaryExplicit,
  };
}

function executeOrderCrmWrite(
  runtime: SalesRuntime,
  decision: SideEffectDecision,
  payload: Record<string, unknown>,
  occurredAt: string
): CrmWriteExecutionView {
  const activity = appendCustomerOrderActivity({
    workspaceId: decision.workspaceId,
    customerId: payload.customerId,
    customerName: payload.customerName,
    contactName: payload.contactName,
    contactEmail: payload.contactEmail,
    orderNumber: payload.orderNumber,
    orderType: payload.orderType,
    productType: payload.productType,
    amount: payload.amount,
    lifecycleStage: payload.lifecycleStage,
    paymentStatus: payload.paymentStatus,
    fulfillmentStatus: payload.fulfillmentStatus,
    status: payload.status,
    summary: payload.summaryExplicit ? payload.summary : "",
    occurredAt,
    source: "crm-write",
  });
  runtime.writeMemory({
    workspaceId: decision.workspaceId,
    kind: "episode",
    customerId: activity.customerId,
    customerName: activity.customerName,
    subject: activity.subject,
    title: `CRM order update: ${activity.customerName}`,
    body: activity.summary,
    tags: ["crm-write", "customer-activity", "order-status"],
    source: {
      type: "approval",
      id: decision.id,
    },
    confidence: 0.9,
    metadata: {
      contactEmail: activity.contactEmail,
      contactName: activity.contactName,
      occurredAt: activity.occurredAt,
      sideEffects: "approved-crm-write",
    },
    idempotencyKey: `${decision.workspaceId}:crm-write:${decision.id}`,
  });
  runtime.recordEvent("crm.write.executed", decision.workspaceId, {
    customerName: activity.customerName,
    subject: activity.subject,
    activityType: "Order",
    sideEffects: "approved-crm-write",
  });

  const result: CrmWriteExecutionView = {
    status: "executed",
    customerId: activity.customerId,
    customerName: activity.customerName,
    subject: String(payload.subject),
    activityType: "Order",
    occurredAt: activity.occurredAt,
  };
  runtime.recordSideEffectExecuted(decision.id, {
    result: { ...result },
  });
  return result;
}

function executeFollowUpCrmWrite(
  runtime: SalesRuntime,
  decision: SideEffectDecision,
  payload: Record<string, unknown>,
  occurredAt: string
): CrmWriteExecutionView {
  const activity: CustomerActivityRecord = {
    id: `crm:${decision.id}`,
    workspaceId: decision.workspaceId,
    customerId: String(payload.customerId),
    customerName: String(payload.customerName),
    kind: "crm_note",
    occurredAt,
    createdAt: new Date().toISOString(),
    contactName: String(payload.contactName || ""),
    contactEmail: String(payload.contactEmail || ""),
    subject: String(payload.subject),
    summary: String(payload.summary),
    status: "executed",
    source: "crm-write",
    metadata: {
      approvalStatus: decision.status,
      approvedBy: decision.approvedBy || null,
      executedAt: new Date().toISOString(),
    },
  };
  appendCustomerActivity(decision.workspaceId, activity);
  runtime.writeMemory({
    workspaceId: decision.workspaceId,
    kind: "episode",
    customerId: activity.customerId,
    customerName: activity.customerName,
    subject: activity.subject,
    title: `CRM follow-up: ${activity.subject}`,
    body: activity.summary,
    tags: ["crm-write", "customer-activity", "follow-up"],
    source: {
      type: "approval",
      id: decision.id,
    },
    confidence: 0.9,
    metadata: {
      contactEmail: activity.contactEmail,
      contactName: activity.contactName,
      occurredAt: activity.occurredAt,
      sideEffects: "approved-crm-write",
    },
    idempotencyKey: `${decision.workspaceId}:crm-write:${decision.id}`,
  });
  runtime.recordEvent("crm.write.executed", decision.workspaceId, {
    customerName: activity.customerName,
    subject: activity.subject,
    sideEffects: "approved-crm-write",
  });

  const result: CrmWriteExecutionView = {
    status: "executed",
    customerId: activity.customerId,
    customerName: activity.customerName,
    subject: activity.subject,
    activityType: "Follow-up",
    occurredAt: activity.occurredAt,
  };
  runtime.recordSideEffectExecuted(decision.id, {
    result: { ...result },
  });
  return result;
}

export function requestCrmWrite(runtime: SalesRuntime, input: CrmWriteInput): CrmWriteRequestView {
  const workspace = runtime.getWorkspace(input.workspaceId);
  const payload = crmPayload({ ...input, workspaceId: workspace.id });
  const decision = runtime.requestSideEffect({
    kind: "crm.write",
    workspaceId: workspace.id,
    summary: `Write CRM follow-up for ${payload.customerName}: ${payload.subject}`,
    payload,
    idempotencyKey: `${workspace.id}:crm-write:${payload.customerId}:${payload.subject}:${payload.occurredAt}`,
  });

  runtime.recordEvent("crm.write.requested", workspace.id, {
    decisionId: decision.id,
    customerName: payload.customerName,
    subject: payload.subject,
    status: decision.status,
    sideEffects: "confirmation-required",
  });

  return {
    decisionId: decision.id,
    kind: "crm.write",
    status: decision.status,
    realExecutionEnabled: decision.realExecutionEnabled,
    reason: decision.reason,
    customerName: String(payload.customerName),
    subject: String(payload.subject),
  };
}

export function executeCrmWrite(runtime: SalesRuntime, input: CrmWriteInput): CrmWriteExecutionView {
  const decisionId = cleanText(input.decisionId);
  if (!decisionId) throw Object.assign(new Error("CRM write decision id is required."), { status: 400 });

  const decision = runtime.getSideEffect(decisionId);
  if (!decision || decision.kind !== "crm.write") {
    throw Object.assign(new Error("CRM write approval record was not found."), { status: 404 });
  }
  runtime.getWorkspace(decision.workspaceId);

  const isApprovedForExecution = decision.status === "approved" ||
    (decision.status === "execution_failed" && Boolean(decision.approvedBy));
  if (!isApprovedForExecution) {
    const message = "CRM write requires an approved side-effect decision.";
    runtime.recordSideEffectFailed(decision.id, {
      error: message,
      canRetry: decision.status !== "rejected",
    });
    throw Object.assign(new Error(message), { status: 403 });
  }
  if (!crmFlagEnabled()) {
    const message = "CRM write blocked. Real CRM writing requires explicit enablement; retry after confirmation.";
    runtime.recordSideEffectFailed(decision.id, {
      error: message,
      canRetry: true,
    });
    throw Object.assign(new Error(message), { status: 403 });
  }

  const payload = crmPayload(decisionPayload(decision));
  const occurredAt = String(payload.occurredAt);
  const isOrderActivity = Boolean(payload.orderType || payload.productType || payload.lifecycleStage || payload.paymentStatus || payload.fulfillmentStatus || payload.orderNumber);

  try {
    return withCrmExecutionRollback(decision.workspaceId, () => {
      if (isOrderActivity) {
        return executeOrderCrmWrite(runtime, decision, payload, occurredAt);
      }
      return executeFollowUpCrmWrite(runtime, decision, payload, occurredAt);
    });
  } catch (error) {
    return recordCrmExecutionFailure(runtime, decision.id, error);
  }
}

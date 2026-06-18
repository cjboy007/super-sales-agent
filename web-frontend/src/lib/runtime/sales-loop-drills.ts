import { syncInboxEmailsToCustomers } from "./customer-activity";
import type { SalesRuntime } from "./sales-runtime";
import { buildSalesWorldModel, type SalesWorldFact } from "./sales-world-model";
import type { SideEffectDecision, WorkspaceId } from "./types";

export type SalesLoopDrillId = "email_to_reply" | "rfq_to_pi" | "order_lifecycle";

export interface SalesLoopDrillInput {
  workspaceId: WorkspaceId;
  drillId: SalesLoopDrillId;
  now?: string;
}

export interface SalesLoopDrillTraceStep {
  id: string;
  label: string;
  status: "completed";
  detail: string;
}

export interface SalesLoopDrillResult {
  success: true;
  drillId: SalesLoopDrillId;
  workspaceId: WorkspaceId;
  trace: SalesLoopDrillTraceStep[];
  sideEffects: SideEffectDecision[];
  facts: SalesWorldFact[];
  realExecutionAttempted: boolean;
}

function now(input?: string) {
  return input || new Date().toISOString();
}

function trace(id: string, label: string, detail: string): SalesLoopDrillTraceStep {
  return { id, label, status: "completed", detail };
}

function realExecutionAttempted(sideEffects: SideEffectDecision[]) {
  return sideEffects.some((decision) => decision.status === "executed" || decision.execution?.status === "executed");
}

async function runEmailToReplyDrill(runtime: SalesRuntime, workspaceId: WorkspaceId, timestamp: string): Promise<SalesLoopDrillResult> {
  const sideEffects: SideEffectDecision[] = [];
  const traceSteps: SalesLoopDrillTraceStep[] = [];
  const emailId = "drill-email-reply-001";
  const customerEmail = "buyer@drill-a.example";

  const synced = syncInboxEmailsToCustomers(runtime, workspaceId, [{
    id: emailId,
    from_email: customerEmail,
    from_name: "Ava Buyer",
    subject: "RFQ and lead time for USB-C cable",
    body_text: "Please quote 2000 pcs USB-C cable and confirm lead time.",
    received_at: timestamp,
    status: "pending_decision",
    analysis: {
      intent: "inquiry_rfq",
      confidence: 0.88,
      urgency: "high",
      sentiment: "positive",
      key_points: ["quote 2000 pcs", "confirm lead time"],
      customer_level: "Buyer",
      tags: [],
    },
  }], {
    now: timestamp,
    source: "sales-loop-drill",
  });
  traceSteps.push(trace("inbox", "New email ingested", `${synced.newActivities} customer activity record(s) written.`));

  const draft = await runtime.runLlm({
    task: "draft",
    workspaceId,
    input: "Draft a reply confirming RFQ receipt and manual review before any customer-facing send.",
    context: { source: "sales-loop-drill", emailId },
  });
  traceSteps.push(trace("draft", "Reply draft prepared", `Draft source: ${draft.source}; confidence: ${draft.confidence}.`));

  const sendRequest = await runtime.sendInboxReply({
    workspaceId,
    emailId,
    to: customerEmail,
    subject: "Re: RFQ and lead time for USB-C cable",
    body: draft.text,
  });
  sideEffects.push(sendRequest.sideEffect);
  traceSteps.push(trace("approval", "Email send approval requested", `Decision ${sendRequest.sideEffect.id} is ${sendRequest.sideEffect.status}.`));

  const model = buildSalesWorldModel(runtime, workspaceId);
  traceSteps.push(trace("facts", "Canonical facts refreshed", `${model.coverage.factCount} fact(s) available.`));

  runtime.recordEvent("sales_loop_drill.completed", workspaceId, {
    drillId: "email_to_reply",
    sideEffectDecisionIds: sideEffects.map((decision) => decision.id),
    realExecutionAttempted: realExecutionAttempted(sideEffects),
  });

  return {
    success: true,
    drillId: "email_to_reply",
    workspaceId,
    trace: traceSteps,
    sideEffects,
    facts: model.facts,
    realExecutionAttempted: realExecutionAttempted(sideEffects),
  };
}

async function runRfqToPiDrill(runtime: SalesRuntime, workspaceId: WorkspaceId, timestamp: string): Promise<SalesLoopDrillResult> {
  const sideEffects: SideEffectDecision[] = [];
  const traceSteps: SalesLoopDrillTraceStep[] = [];

  const synced = syncInboxEmailsToCustomers(runtime, workspaceId, [{
    id: "drill-rfq-pi-001",
    from_email: "rfq@drill-b.example",
    from_name: "Rina RFQ",
    subject: "RFQ for HDMI adapter PI",
    body_text: "Please quote 5000 pcs HDMI adapters and prepare PI after price confirmation.",
    received_at: timestamp,
    status: "pending_decision",
    analysis: {
      intent: "inquiry_rfq",
      confidence: 0.91,
      urgency: "high",
      sentiment: "positive",
      key_points: ["5000 pcs HDMI adapters", "prepare PI"],
      customer_level: "Buyer",
      tags: [],
    },
  }], {
    now: timestamp,
    source: "sales-loop-drill",
  });
  traceSteps.push(trace("rfq", "RFQ captured", `${synced.newActivities} customer activity record(s) written.`));

  const quote = await runtime.generateQuotationDocuments({
    workspaceId,
    type: "PI",
    customer: "Drill B",
    items: [{
      name: "HDMI adapter",
      description: "USB-C to HDMI adapter",
      qty: 5000,
      unitPrice: 1.85,
    }],
    terms: "FOB Shanghai, T/T before shipment",
    notes: "Dry-run only; files require document side-effect approval.",
  });
  sideEffects.push(quote.sideEffect);
  traceSteps.push(trace("document-request", "PI generation approval requested", `Decision ${quote.sideEffect.id} is ${quote.sideEffect.status}.`));

  const model = buildSalesWorldModel(runtime, workspaceId);
  traceSteps.push(trace("facts", "Canonical facts refreshed", `${model.coverage.factCount} fact(s) available.`));
  traceSteps.push(trace("guardrail", "External document generation blocked", "No file generation is attempted without approval and the explicit runtime flag."));

  runtime.recordEvent("sales_loop_drill.completed", workspaceId, {
    drillId: "rfq_to_pi",
    sideEffectDecisionIds: sideEffects.map((decision) => decision.id),
    realExecutionAttempted: realExecutionAttempted(sideEffects),
  });

  return {
    success: true,
    drillId: "rfq_to_pi",
    workspaceId,
    trace: traceSteps,
    sideEffects,
    facts: model.facts,
    realExecutionAttempted: realExecutionAttempted(sideEffects),
  };
}

async function runOrderLifecycleDrill(runtime: SalesRuntime, workspaceId: WorkspaceId, timestamp: string): Promise<SalesLoopDrillResult> {
  const sideEffects: SideEffectDecision[] = [];
  const traceSteps: SalesLoopDrillTraceStep[] = [];

  const synced = syncInboxEmailsToCustomers(runtime, workspaceId, [{
    id: "drill-order-lifecycle-001",
    from_email: "ops@drill-c.example",
    from_name: "Omar Ops",
    subject: "Payment received and shipment exception for PI-DRILL-C-001",
    body_text: "Payment received for PI-DRILL-C-001. HDMI adapter order USD 9250.00 shipped by DHL, but customs hold created a shipment exception.",
    received_at: timestamp,
    status: "pending_decision",
    analysis: {
      intent: "logistics",
      confidence: 0.9,
      urgency: "high",
      sentiment: "negative",
      key_points: ["payment received", "shipped by DHL", "customs hold"],
      customer_level: "Operations",
      tags: [],
    },
  }], {
    now: timestamp,
    source: "sales-loop-drill",
  });
  traceSteps.push(trace("order-email", "Order lifecycle signal captured", `${synced.orderActivities} order activity record(s) written.`));

  const milestone = runtime.requestSideEffect({
    kind: "payment.write",
    workspaceId,
    summary: "Record payment/shipment milestone for PI-DRILL-C-001",
    payload: {
      orderNo: "PI-DRILL-C-001",
      paymentStatus: "paid",
      fulfillmentStatus: "exception",
      evidence: "Dry-run email signal from sales loop drill.",
    },
    idempotencyKey: `${workspaceId}:drill:order-lifecycle:PI-DRILL-C-001`,
  });
  sideEffects.push(milestone);
  traceSteps.push(trace("approval", "Payment/order milestone approval requested", `Decision ${milestone.id} is ${milestone.status}.`));

  const recommendation = await runtime.runLlm({
    task: "recommend",
    workspaceId,
    input: "Recommend next step for paid order with shipment exception. Do not claim external action execution.",
    context: { source: "sales-loop-drill", orderNo: "PI-DRILL-C-001" },
  });
  traceSteps.push(trace("next-step", "Next step recommendation prepared", `Recommendation source: ${recommendation.source}; confidence: ${recommendation.confidence}.`));

  const model = buildSalesWorldModel(runtime, workspaceId);
  traceSteps.push(trace("facts", "Canonical facts refreshed", `${model.coverage.factCount} fact(s) available.`));

  runtime.recordEvent("sales_loop_drill.completed", workspaceId, {
    drillId: "order_lifecycle",
    sideEffectDecisionIds: sideEffects.map((decision) => decision.id),
    realExecutionAttempted: realExecutionAttempted(sideEffects),
  });

  return {
    success: true,
    drillId: "order_lifecycle",
    workspaceId,
    trace: traceSteps,
    sideEffects,
    facts: model.facts,
    realExecutionAttempted: realExecutionAttempted(sideEffects),
  };
}

export async function runSalesLoopDrill(runtime: SalesRuntime, input: SalesLoopDrillInput): Promise<SalesLoopDrillResult> {
  const workspace = runtime.getWorkspace(input.workspaceId);
  const timestamp = now(input.now);

  if (input.drillId === "email_to_reply") return runEmailToReplyDrill(runtime, workspace.id, timestamp);
  if (input.drillId === "rfq_to_pi") return runRfqToPiDrill(runtime, workspace.id, timestamp);
  return runOrderLifecycleDrill(runtime, workspace.id, timestamp);
}

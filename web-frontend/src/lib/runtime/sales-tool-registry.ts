import type { SideEffectKind } from "./types";

export type SalesToolApprovalRequirement =
  | "not_required"
  | "operator_approval_required";

export interface SalesToolSchema {
  type: "object";
  required?: string[];
  properties: Record<string, Record<string, unknown>>;
  additionalProperties?: boolean;
}

export interface SalesToolDefinition {
  id: string;
  name: string;
  description: string;
  inputSchema: SalesToolSchema;
  outputSchema: SalesToolSchema;
  requiredPermissions: string[];
  sideEffectKind: SideEffectKind | null;
  approvalRequired: boolean;
  approvalRequirement: SalesToolApprovalRequirement;
  idempotencyStrategy: string;
  failureRetryBehavior: string;
}

function objectSchema(
  properties: SalesToolSchema["properties"],
  required: string[] = []
): SalesToolSchema {
  return {
    type: "object",
    required,
    properties,
    additionalProperties: false,
  };
}

function sideEffectTool(input: Omit<SalesToolDefinition, "approvalRequired" | "approvalRequirement">): SalesToolDefinition {
  return {
    ...input,
    approvalRequired: true,
    approvalRequirement: "operator_approval_required",
  };
}

function localTool(input: Omit<SalesToolDefinition, "approvalRequired" | "approvalRequirement" | "sideEffectKind">): SalesToolDefinition {
  return {
    ...input,
    sideEffectKind: null,
    approvalRequired: false,
    approvalRequirement: "not_required",
  };
}

const WORKSPACE = { type: "string", description: "SSA workspace id." };

const SALES_TOOLS: SalesToolDefinition[] = [
  sideEffectTool({
    id: "ingest.inbound_email",
    name: "Ingest inbound email",
    description: "Fetch or accept inbound mailbox messages and normalize them into local inbox/customer activity.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      mailbox: { type: "string" },
      messageId: { type: "string" },
      source: { type: "string", enum: ["local", "imap", "bridge"] },
    }, ["workspaceId", "source"]),
    outputSchema: objectSchema({
      emailId: { type: "string" },
      customerId: { type: "string" },
      activityIds: { type: "array", items: { type: "string" } },
      sideEffectDecisionId: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "mailbox.read", "customer.write_local"],
    sideEffectKind: "imap.fetch",
    idempotencyStrategy: "Use workspaceId + mailbox + provider message uid before creating inbox/customer activity records.",
    failureRetryBehavior: "Retry through a side-effect decision retry record; never mark a message processed until local activity write succeeds.",
  }),
  sideEffectTool({
    id: "crm.update_customer",
    name: "Update customer CRM",
    description: "Request or execute an approved CRM/customer account update.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      customerId: { type: "string" },
      patch: { type: "object" },
      reason: { type: "string" },
    }, ["workspaceId", "customerId", "patch"]),
    outputSchema: objectSchema({
      customerId: { type: "string" },
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "crm.write"],
    sideEffectKind: "crm.write",
    idempotencyStrategy: "Use workspaceId + customerId + normalized patch hash.",
    failureRetryBehavior: "Retry through a side-effect decision retry record and preserve the previous customer state for audit.",
  }),
  localTool({
    id: "memory.search_customer",
    name: "Search customer memory",
    description: "Retrieve local customer facts and episodes for grounding sales work.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      customerId: { type: "string" },
      customerName: { type: "string" },
      query: { type: "string" },
      limit: { type: "number" },
    }, ["workspaceId", "query"]),
    outputSchema: objectSchema({
      hits: { type: "array", items: { type: "object" } },
      retrieval: { type: "object" },
    }),
    requiredPermissions: ["workspace.read", "memory.read"],
    idempotencyStrategy: "Read-only lookup; callers should cache by workspaceId + query + customer scope when needed.",
    failureRetryBehavior: "No external retry; return an empty hit set with an operator-visible retrieval error.",
  }),
  localTool({
    id: "email.draft_reply",
    name: "Draft email reply",
    description: "Create a grounded reply draft without sending it.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      emailId: { type: "string" },
      customerId: { type: "string" },
      tone: { type: "string" },
      language: { type: "string" },
    }, ["workspaceId", "emailId"]),
    outputSchema: objectSchema({
      subject: { type: "string" },
      body: { type: "string" },
      llmSource: { type: "string" },
      requiresHumanReview: { type: "boolean" },
    }),
    requiredPermissions: ["workspace.read", "inbox.read", "memory.read", "llm.use"],
    idempotencyStrategy: "Use workspaceId + emailId + promptVersion + selected style.",
    failureRetryBehavior: "Retry as a draft generation only; never convert a draft failure into a send action.",
  }),
  sideEffectTool({
    id: "email.request_send",
    name: "Request email send",
    description: "Create an approval-gated request to send a customer-facing email.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      emailId: { type: "string" },
      to: { type: "string" },
      subject: { type: "string" },
      body: { type: "string" },
    }, ["workspaceId", "to", "subject", "body"]),
    outputSchema: objectSchema({
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
      verification: { type: "object" },
    }),
    requiredPermissions: ["workspace.read", "email.send.request"],
    sideEffectKind: "email.send",
    idempotencyStrategy: "Use workspaceId + source email id + normalized recipient + subject.",
    failureRetryBehavior: "Retry through a side-effect decision retry record after approval, address verification, and adapter errors are visible.",
  }),
  sideEffectTool({
    id: "document.generate_quotation_pi",
    name: "Generate quotation or PI",
    description: "Generate quotation/PI files only after document side-effect approval.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      documentType: { type: "string", enum: ["QT", "PI", "SPL"] },
      customer: { type: "string" },
      items: { type: "array", items: { type: "object" } },
      terms: { type: "string" },
    }, ["workspaceId", "documentType", "customer"]),
    outputSchema: objectSchema({
      documentNo: { type: "string" },
      files: { type: "array", items: { type: "object" } },
      sideEffectDecisionId: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "document.generate.request"],
    sideEffectKind: "document.generate",
    idempotencyStrategy: "Use workspaceId + document type + customer + normalized line items/terms.",
    failureRetryBehavior: "Retry through a side-effect decision retry record and record generation failure on the same approved decision.",
  }),
  sideEffectTool({
    id: "document.request_generation",
    name: "Request document generation",
    description: "Create a document generation approval request without generating files.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      documentType: { type: "string" },
      customer: { type: "string" },
      payload: { type: "object" },
    }, ["workspaceId", "documentType", "customer"]),
    outputSchema: objectSchema({
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "document.generate.request"],
    sideEffectKind: "document.generate",
    idempotencyStrategy: "Use caller-provided idempotency key or workspaceId + documentType + customer.",
    failureRetryBehavior: "Retry through a side-effect decision retry record; no files are generated by this tool.",
  }),
  sideEffectTool({
    id: "company_intel.queue",
    name: "Queue company intelligence",
    description: "Queue enrichment of company intelligence, including gated external data reads when configured.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      companyName: { type: "string" },
      website: { type: "string" },
      force: { type: "boolean" },
    }, ["workspaceId", "companyName"]),
    outputSchema: objectSchema({
      jobId: { type: "string" },
      status: { type: "string" },
      sideEffectDecisionId: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "intelligence.queue", "data.read.request"],
    sideEffectKind: "data.read",
    idempotencyStrategy: "Use workspaceId + company slug + requested source set.",
    failureRetryBehavior: "Retry through a side-effect decision retry record and keep partial dossier status visible.",
  }),
  localTool({
    id: "follow_up.create_plan",
    name: "Create follow-up plan",
    description: "Create local next-step recommendations without contacting customers.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      customerId: { type: "string" },
      context: { type: "string" },
      dueDate: { type: "string" },
    }, ["workspaceId", "customerId"]),
    outputSchema: objectSchema({
      planId: { type: "string" },
      nextSteps: { type: "array", items: { type: "string" } },
      requiresApprovalForExternalAction: { type: "boolean" },
    }),
    requiredPermissions: ["workspace.read", "customer.read", "memory.write_local"],
    idempotencyStrategy: "Use workspaceId + customerId + due date + normalized context.",
    failureRetryBehavior: "Retry locally; external actions proposed by the plan must be separate side-effect decisions.",
  }),
  sideEffectTool({
    id: "order.record_milestone",
    name: "Record order milestone",
    description: "Record payment, shipment, refund, or exception milestones through an approval-gated business action.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      customerId: { type: "string" },
      orderNo: { type: "string" },
      milestoneType: { type: "string", enum: ["payment", "shipment", "refund", "after_sales", "exception"] },
      evidence: { type: "string" },
    }, ["workspaceId", "orderNo", "milestoneType", "evidence"]),
    outputSchema: objectSchema({
      milestoneId: { type: "string" },
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "order.write.request", "payment.write.request"],
    sideEffectKind: "payment.write",
    idempotencyStrategy: "Use workspaceId + orderNo + milestone type + evidence hash.",
    failureRetryBehavior: "Retry through a side-effect decision retry record and keep payment/shipment state unchanged until execution is recorded.",
  }),
];

export function listSalesTools(): SalesToolDefinition[] {
  return SALES_TOOLS.map((tool) => ({ ...tool }));
}

export function getSalesTool(id: string): SalesToolDefinition | null {
  const tool = SALES_TOOLS.find((item) => item.id === id);
  return tool ? { ...tool } : null;
}

export function listSideEffectSalesTools(): SalesToolDefinition[] {
  return listSalesTools().filter((tool) => Boolean(tool.sideEffectKind));
}

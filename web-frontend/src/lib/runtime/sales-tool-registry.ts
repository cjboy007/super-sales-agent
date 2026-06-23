import type { SideEffectKind, SideEffectToolAudit } from "./types";

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

export interface SalesToolEnforcementInput {
  toolId?: string;
  sideEffectKind: SideEffectKind;
  workspaceId: string;
  input: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface SalesToolEnforcementResult {
  tool: SalesToolDefinition;
  audit: SideEffectToolAudit;
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
    }, ["workspaceId"]),
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
    }, ["workspaceId"]),
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
    id: "email.test_smtp",
    name: "Test SMTP connection",
    description: "Request a gated SMTP connection test without sending customer mail.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      source: { type: "string" },
      verifyOnly: { type: "boolean" },
    }, ["workspaceId"]),
    outputSchema: objectSchema({
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "email.send.request"],
    sideEffectKind: "email.send",
    idempotencyStrategy: "Use workspaceId + connection-test + SMTP kind.",
    failureRetryBehavior: "Retry through a side-effect decision retry record; no customer email is sent by this tool.",
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
    }, ["workspaceId"]),
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
    }, ["workspaceId"]),
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
    id: "document.preview_file",
    name: "Preview generated document",
    description: "Request a gated local document preview/conversion without publishing or sending the file.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      path: { type: "string" },
      extension: { type: "string" },
      source: { type: "string" },
    }, ["workspaceId", "path"]),
    outputSchema: objectSchema({
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
      previewAvailable: { type: "boolean" },
    }),
    requiredPermissions: ["workspace.read", "document.preview.request"],
    sideEffectKind: "document.preview",
    idempotencyStrategy: "Use workspaceId + resolved file path before running local preview conversion.",
    failureRetryBehavior: "Retry through a side-effect decision retry record; never publish or send preview output.",
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
    }, ["workspaceId"]),
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
  sideEffectTool({
    id: "data.read_external",
    name: "Request external data read",
    description: "Request a gated read from an external data source without writing customer-visible records.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      source: { type: "string" },
      endpoint: { type: "string" },
      path: { type: "string" },
      reason: { type: "string" },
    }, ["workspaceId", "source"]),
    outputSchema: objectSchema({
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "data.read.request"],
    sideEffectKind: "data.read",
    idempotencyStrategy: "Use workspaceId + source + endpoint/path.",
    failureRetryBehavior: "Retry through a side-effect decision retry record and keep partial data-read failures visible.",
  }),
  sideEffectTool({
    id: "bank.read_statement",
    name: "Read bank statement",
    description: "Request a gated bank data read for payment reconciliation.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      accountRef: { type: "string" },
      dateRange: { type: "string" },
      reason: { type: "string" },
    }, ["workspaceId", "reason"]),
    outputSchema: objectSchema({
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "bank.read.request"],
    sideEffectKind: "bank.read",
    idempotencyStrategy: "Use workspaceId + account reference + date range + reason.",
    failureRetryBehavior: "Retry through a side-effect decision retry record only after operator confirms bank access scope.",
  }),
  sideEffectTool({
    id: "price.request_discount",
    name: "Request price adjustment",
    description: "Request review of a price discount or adjustment without changing customer-visible pricing.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      customerId: { type: "string" },
      customerName: { type: "string" },
      product: { type: "string" },
      requestedPrice: { type: "number" },
      reason: { type: "string" },
    }, ["workspaceId"]),
    outputSchema: objectSchema({
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "price.discount.request"],
    sideEffectKind: "price.discount",
    idempotencyStrategy: "Use workspaceId + customer/product + requested price + reason.",
    failureRetryBehavior: "Retry through a side-effect decision retry record only after margin and authorization are reviewed.",
  }),
  sideEffectTool({
    id: "feishu.request_notify",
    name: "Request team notification",
    description: "Request a gated Feishu/team notification for operator review.",
    inputSchema: objectSchema({
      workspaceId: WORKSPACE,
      channel: { type: "string" },
      message: { type: "string" },
      reason: { type: "string" },
    }, ["workspaceId", "message"]),
    outputSchema: objectSchema({
      sideEffectDecisionId: { type: "string" },
      status: { type: "string" },
    }),
    requiredPermissions: ["workspace.read", "feishu.notify.request"],
    sideEffectKind: "feishu.notify",
    idempotencyStrategy: "Use workspaceId + channel + message hash.",
    failureRetryBehavior: "Retry through a side-effect decision retry record after operator review.",
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
    }, ["workspaceId", "orderNo", "evidence"]),
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

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function selectSalesToolIdForSideEffect(kind: SideEffectKind, input: Record<string, unknown> = {}): string | null {
  if (kind === "email.send" && input.verifyOnly === true) return "email.test_smtp";
  if (kind === "email.send") return "email.request_send";
  if (kind === "crm.write") return "crm.update_customer";
  if (kind === "document.preview") return "document.preview_file";
  if (kind === "payment.write") return "order.record_milestone";
  if (kind === "bank.read") return "bank.read_statement";
  if (kind === "price.discount") return "price.request_discount";
  if (kind === "feishu.notify") return "feishu.request_notify";
  if (kind === "imap.fetch") return "ingest.inbound_email";
  if (kind === "data.read" && cleanText(input.companyName)) return "company_intel.queue";
  if (kind === "data.read") return "data.read_external";
  if (kind === "document.generate") {
    return cleanText(input.documentType) || Array.isArray(input.items)
      ? "document.generate_quotation_pi"
      : "document.request_generation";
  }
  return null;
}

function valueMatchesType(value: unknown, type: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && !Array.isArray(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  return true;
}

function assertInputSchema(tool: SalesToolDefinition, input: Record<string, unknown>) {
  const required = new Set(tool.inputSchema.required || []);
  for (const field of required) {
    if (input[field] === undefined || input[field] === null || input[field] === "") {
      throw new Error(`Sales tool registry rejected ${tool.id}: missing required input ${field}.`);
    }
  }
  for (const [field, schema] of Object.entries(tool.inputSchema.properties)) {
    if (!valueMatchesType(input[field], schema.type)) {
      throw new Error(`Sales tool registry rejected ${tool.id}: invalid input ${field}.`);
    }
  }
}

function auditForTool(tool: SalesToolDefinition): SideEffectToolAudit {
  if (!tool.sideEffectKind) throw new Error(`Sales tool registry rejected ${tool.id}: tool has no side-effect kind.`);
  return {
    toolId: tool.id,
    name: tool.name,
    sideEffectKind: tool.sideEffectKind,
    approvalRequired: tool.approvalRequired,
    approvalRequirement: tool.approvalRequirement,
    requiredPermissions: [...tool.requiredPermissions],
    idempotencyStrategy: tool.idempotencyStrategy,
    failureRetryBehavior: tool.failureRetryBehavior,
  };
}

export function enforceSalesToolForSideEffect(input: SalesToolEnforcementInput): SalesToolEnforcementResult {
  const toolId = cleanText(input.toolId) || selectSalesToolIdForSideEffect(input.sideEffectKind, input.input);
  if (!toolId) {
    throw new Error(`Sales tool registry enforcement failed for ${input.sideEffectKind}: no registered tool was selected.`);
  }
  const tool = getSalesTool(toolId);
  if (!tool) {
    throw new Error(`Sales tool registry enforcement failed: unknown tool ${toolId}.`);
  }
  if (tool.sideEffectKind !== input.sideEffectKind) {
    throw new Error(`Sales tool registry rejected ${tool.id}: side-effect kind mismatch.`);
  }
  if (!tool.approvalRequired || tool.approvalRequirement !== "operator_approval_required") {
    throw new Error(`Sales tool registry rejected ${tool.id}: high-risk side-effect tools require operator approval.`);
  }
  if (!input.idempotencyKey) {
    throw new Error(`Sales tool registry rejected ${tool.id}: idempotency key is required.`);
  }
  const toolInput = { ...input.input, workspaceId: input.workspaceId };
  assertInputSchema(tool, toolInput);
  return {
    tool,
    audit: auditForTool(tool),
  };
}

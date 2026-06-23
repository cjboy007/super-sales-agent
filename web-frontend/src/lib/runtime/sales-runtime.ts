import fs from "fs";
import crypto from "crypto";
import type {
  LlmRequest,
  LlmResult,
  RuntimeEvent,
  SalesRuntimeSnapshot,
  SideEffectDecision,
  SideEffectRequest,
  WorkspaceAdapter,
  WorkspaceId,
  WorkspaceInput,
  DocumentGenerationRequest,
  MemorySearchInput,
  MemoryWriteInput,
  OperatorCommandInput,
  OperatorCommandRecord,
} from "./types";
import {
  runAssistantQuery,
  type AssistantQueryInput,
  type AssistantQueryResult,
  type AssistantRouterOptions,
} from "./assistant-router";
import type { SettingsInput } from "./configuration";
import {
  getMaskedSettings,
  importSettings as importRuntimeSettings,
  updateSettings as updateRuntimeSettings,
} from "./configuration";
import { getDashboardOverview } from "./dashboard";
import { executeCrmWrite, requestCrmWrite, type CrmWriteInput } from "./crm-write";
import {
  generateQuotationDocuments,
  generateTradeDocuments,
  listPiRecords,
  listTradeDocuments,
  requestDocumentGeneration,
  type QuotationGenerationInput,
  type TradeDocumentGenerationInput,
} from "./documents";
import { synthesizeIntakeDocuments, type SynthesizeIntakeInput } from "./document-synthesis";
import { testEmailConnection, type EmailConnectionTestInput } from "./email-connection";
import { sendEmailThroughRuntime, type EmailSendInput } from "./email-send";
import { openRuntimeFile, previewRuntimeFile, serveRuntimeFile } from "./files";
import {
  draftRuntimeInboxReply,
  getRuntimeInbox,
  getRuntimeInboxEmail,
  selectRuntimeInboxReplyStyle,
  sendRuntimeInboxReply,
  type InboxReplyInput,
  type InboxSendInput,
} from "./inbox";
import { refreshIntelligenceFeeds } from "./intelligence-collector";
import { listIntakeSessions, processIntake, type IntakeInput } from "./intake";
import {
  collectCompanyIntelEnrichment,
  queueCompanyIntel,
  readCompanyIntel,
  writeCompanyIntelDossier,
  type CompanyIntelEnrichment,
  type CompanyIntelLeadInput,
} from "./company-intel";
import { importWorkspaceLeads, type LeadImportInput } from "./lead-import";
import { runLlmTask } from "./llm";
import { listLlmTaskPolicies, getLlmTaskPolicy } from "./llm-policy";
import { getSalesRuntimeManifest } from "./manifest";
import { rebuildMemoryIndex } from "./memory-index";
import { createOperatorCommand } from "./operator-commands";
import { getSentLogSnapshot, runtimeEventsToAgentEvents } from "./activity-stream";
import { createSalesMemory, type SalesMemory } from "./sales-memory";
import { listSalesPacks } from "./sales-packs";
import { buildSalesWorldModel } from "./sales-world-model";
import { getSalesTool, listSalesTools, selectSalesToolIdForSideEffect } from "./sales-tool-registry";
import { runSalesLoopDrill, type SalesLoopDrillInput } from "./sales-loop-drills";
import {
  approveSideEffectDecision,
  getSideEffectDecision,
  listSideEffectDecisions,
  recordSideEffectExecutionFailure,
  recordSideEffectExecutionSuccess,
  rejectSideEffectDecision,
  requestSideEffect,
  retrySideEffectDecision,
} from "./side-effect-gate";
import { WorkflowEngine } from "./workflow";
import { getWorkspaceAdapter, listWorkspaceAdapters, registerWorkspaceAdapter } from "./workspaces";
import { ensureSsaCompanyDataPath, readJsonFile, ssaDataPath } from "../ssa-data-paths";

function eventsPath(workspaceId: WorkspaceId) {
  return ensureSsaCompanyDataPath(workspaceId, "events", "events.json");
}

function stableSideEffectIdempotencyKey(request: SideEffectRequest, workspaceId: WorkspaceId): string {
  if (request.idempotencyKey) return request.idempotencyKey;
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      kind: request.kind,
      workspaceId,
      summary: request.summary,
      payload: request.payload,
    }))
    .digest("hex")
    .slice(0, 16);
  return `${workspaceId}:${request.kind}:${hash}`;
}

function documentToolInputCustomer(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["company_name", "companyName", "name", "email"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
    }
  }
  return "Unknown customer";
}

function readEvents(workspaceId: WorkspaceId): RuntimeEvent[] {
  return readJsonFile<RuntimeEvent[]>(eventsPath(workspaceId), []);
}

function writeEvents(workspaceId: WorkspaceId, events: RuntimeEvent[]) {
  fs.writeFileSync(eventsPath(workspaceId), JSON.stringify(events, null, 2), "utf-8");
}

function discoverEventWorkspaces(): WorkspaceId[] {
  const ids = new Set<WorkspaceId>(listWorkspaceAdapters().map((workspace) => workspace.id));
  const companiesDir = ssaDataPath("companies");
  try {
    if (fs.existsSync(companiesDir)) {
      for (const entry of fs.readdirSync(companiesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) ids.add(entry.name);
      }
    }
  } catch {
    // Missing or unreadable company folders are treated as empty.
  }
  return Array.from(ids);
}

function makeEventId(type: string) {
  return `${type.replace(/[^a-zA-Z0-9._-]/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class SalesRuntime {
  readonly memory: SalesMemory;
  readonly workflows: WorkflowEngine;

  constructor(memory = createSalesMemory()) {
    this.memory = memory;
    this.workflows = new WorkflowEngine(this);
  }

  listWorkspaces(): WorkspaceAdapter[] {
    return listWorkspaceAdapters();
  }

  getWorkspace(id?: WorkspaceId | null): WorkspaceAdapter {
    return getWorkspaceAdapter(id);
  }

  registerWorkspace(input: WorkspaceInput): WorkspaceAdapter {
    const workspace = registerWorkspaceAdapter(input);
    this.recordEvent("workspace.registered", workspace.id, {
      name: workspace.name,
      packs: workspace.packs,
    });
    return workspace;
  }

  listPacks() {
    return listSalesPacks();
  }

  manifest() {
    return getSalesRuntimeManifest();
  }

  getSalesWorldModel(workspaceId: WorkspaceId) {
    const workspace = this.getWorkspace(workspaceId);
    return buildSalesWorldModel(this, workspace.id);
  }

  listSalesTools() {
    return listSalesTools();
  }

  getSalesTool(id: string) {
    return getSalesTool(id);
  }

  listLlmTaskPolicies() {
    return listLlmTaskPolicies();
  }

  getLlmTaskPolicy(task: LlmRequest["task"]) {
    return getLlmTaskPolicy(task);
  }

  runSalesLoopDrill(input: SalesLoopDrillInput) {
    return runSalesLoopDrill(this, input);
  }

  getMaskedSettings() {
    return getMaskedSettings();
  }

  updateSettings(input: SettingsInput) {
    const result = updateRuntimeSettings(input);
    this.recordEvent("config.updated", this.getWorkspace(null).id, result.audit);
    return result.masked;
  }

  importSettings(input: SettingsInput) {
    const result = importRuntimeSettings(input);
    this.recordEvent("config.imported", this.getWorkspace(null).id, result.audit);
    return result.masked;
  }

  writeMemory(input: MemoryWriteInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    const record = this.memory.writeMemory({ ...input, workspaceId: workspace.id });
    this.recordEvent("memory.written", workspace.id, {
      memoryId: record.id,
      kind: record.kind,
      customerId: record.customerId || null,
      customerName: record.customerName || null,
      source: record.source,
      sideEffects: "local-only",
    });
    return record;
  }

  searchMemory(input: MemorySearchInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return this.memory.searchMemory({ ...input, workspaceId: workspace.id });
  }

  rebuildMemoryIndex(workspaceId: WorkspaceId) {
    const workspace = this.getWorkspace(workspaceId);
    const result = rebuildMemoryIndex(workspace.id);
    this.recordEvent("memory.index.rebuilt", workspace.id, {
      recordsIndexed: result.recordsIndexed,
      updatedAt: result.updatedAt,
    });
    return result;
  }

  getMemoryTimeline(input: MemorySearchInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return this.memory.getMemoryTimeline({ ...input, workspaceId: workspace.id });
  }

  getCustomerMemoryContext(input: MemorySearchInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return this.memory.getCustomerMemoryContext({ ...input, workspaceId: workspace.id });
  }

  getDashboardOverview(project: string) {
    return getDashboardOverview(this, project);
  }

  sendEmail(input: EmailSendInput) {
    return sendEmailThroughRuntime(this, {
      ...input,
      workspaceId: this.getWorkspace(input.workspaceId).id,
    });
  }

  requestCrmWrite(input: CrmWriteInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return requestCrmWrite(this, { ...input, workspaceId: workspace.id });
  }

  executeCrmWrite(input: CrmWriteInput) {
    return executeCrmWrite(this, input);
  }

  testEmailConnection(input: EmailConnectionTestInput) {
    return testEmailConnection(this, {
      ...input,
      workspaceId: this.getWorkspace(input.workspaceId).id,
    });
  }

  async runLlm(request: LlmRequest): Promise<LlmResult> {
    const workspace = this.getWorkspace(request.workspaceId);
    const result = await runLlmTask({ ...request, workspaceId: workspace.id });
    this.recordEvent("llm.task.completed", workspace.id, {
      task: request.task,
      provider: result.provider,
      source: result.source,
      confidence: result.confidence,
    });
    return result;
  }

  async runAssistantQuery(
    input: AssistantQueryInput,
    options: AssistantRouterOptions = {}
  ): Promise<AssistantQueryResult> {
    const workspace = this.getWorkspace(input.workspaceId);
    const result = await runAssistantQuery(this, { ...input, workspaceId: workspace.id }, options);
    this.recordEvent("assistant.query.completed", workspace.id, {
      taskType: result.intent.taskType,
      localEvidence: result.evidence.local.length,
      webEvidence: result.evidence.web.length,
      usedWeb: result.routing.usedWeb,
      webSearchStatus: result.routing.webSearchStatus,
      blockedSideEffect: result.safety.blockedSideEffect,
      confidence: result.confidence,
      sideEffects: "blocked-by-default",
    });
    return result;
  }

  requestSideEffect(request: SideEffectRequest): SideEffectDecision {
    const workspace = this.getWorkspace(request.workspaceId);
    const idempotencyKey = stableSideEffectIdempotencyKey(request, workspace.id);
    const toolId = request.toolId || selectSalesToolIdForSideEffect(request.kind, request.payload);
    const decision = requestSideEffect({
      ...request,
      workspaceId: workspace.id,
      idempotencyKey,
      toolId: toolId || request.toolId,
      toolInput: {
        ...(request.payload || {}),
        ...(request.toolInput || {}),
        workspaceId: workspace.id,
      },
    });
    this.recordEvent("side_effect.requested", workspace.id, {
      decisionId: decision.id,
      kind: decision.kind,
      status: decision.status,
      reason: decision.reason,
      toolId: decision.tool?.toolId,
    });
    return decision;
  }

  listSideEffects(limit = 50): SideEffectDecision[] {
    return listSideEffectDecisions(limit);
  }

  getSideEffect(id: string): SideEffectDecision | null {
    return getSideEffectDecision(id);
  }

  approveSideEffect(id: string, input: { by?: string; note?: string } = {}): SideEffectDecision {
    const decision = approveSideEffectDecision(id, input);
    this.recordEvent("side_effect.approved", decision.workspaceId, {
      decisionId: decision.id,
      kind: decision.kind,
      approvedBy: decision.approvedBy,
      realExecutionEnabled: decision.realExecutionEnabled,
    });
    return decision;
  }

  rejectSideEffect(id: string, input: { by?: string; note?: string } = {}): SideEffectDecision {
    const decision = rejectSideEffectDecision(id, input);
    this.recordEvent("side_effect.rejected", decision.workspaceId, {
      decisionId: decision.id,
      kind: decision.kind,
      rejectedBy: decision.rejectedBy,
    });
    return decision;
  }

  retrySideEffect(id: string): SideEffectDecision {
    const decision = retrySideEffectDecision(id);
    this.recordEvent("side_effect.retry_requested", decision.workspaceId, {
      decisionId: decision.id,
      retryOf: decision.retryOf,
      kind: decision.kind,
      status: decision.status,
      realExecutionEnabled: decision.realExecutionEnabled,
    });
    return decision;
  }

  recordSideEffectExecuted(id: string, input: { result?: Record<string, unknown> } = {}): SideEffectDecision {
    const decision = recordSideEffectExecutionSuccess(id, input);
    this.recordEvent("side_effect.executed", decision.workspaceId, {
      decisionId: decision.id,
      kind: decision.kind,
      status: decision.status,
    });
    return decision;
  }

  recordSideEffectFailed(id: string, input: { error: string; canRetry?: boolean }): SideEffectDecision {
    const decision = recordSideEffectExecutionFailure(id, input);
    this.recordEvent("side_effect.execution_failed", decision.workspaceId, {
      decisionId: decision.id,
      kind: decision.kind,
      status: decision.status,
      canRetry: decision.execution?.canRetry ?? true,
    });
    return decision;
  }

  requestDocumentGeneration(request: DocumentGenerationRequest): SideEffectDecision {
    const workspace = this.getWorkspace(request.workspaceId);
    const decision = this.requestSideEffect({
      kind: "document.generate",
      workspaceId: workspace.id,
      summary: `Generate ${request.documentType} document for ${request.customer}`,
      payload: {
        documentType: request.documentType,
        customer: request.customer,
        ...request.payload,
      },
      idempotencyKey: request.idempotencyKey,
      toolId: request.documentType === "QT" || request.documentType === "PI" || request.documentType === "SPL"
        ? "document.generate_quotation_pi"
        : "document.request_generation",
      toolInput: {
        workspaceId: workspace.id,
        documentType: request.documentType,
        payload: request.payload,
        ...request.payload,
        customer: documentToolInputCustomer(request.customer),
      },
    });
    this.recordEvent("document.generate.requested", workspace.id, {
      decisionId: decision.id,
      documentType: request.documentType,
      customer: request.customer,
      status: decision.status,
      reason: decision.reason,
    });
    return decision;
  }

  generateQuotationDocuments(input: QuotationGenerationInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return generateQuotationDocuments(this, { ...input, workspaceId: workspace.id });
  }

  generateTradeDocuments(input: TradeDocumentGenerationInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return generateTradeDocuments(this, { ...input, workspaceId: workspace.id });
  }

  listPiRecords(workspaceId = "farreach", query = "") {
    const workspace = this.getWorkspace(workspaceId);
    return listPiRecords(workspace.id, query);
  }

  listTradeDocuments(workspaceId = "farreach") {
    const workspace = this.getWorkspace(workspaceId);
    return listTradeDocuments(workspace.id);
  }

  previewFile(input: { path: string | null; workspaceId: string }) {
    const workspace = this.getWorkspace(input.workspaceId);
    return previewRuntimeFile(this, { ...input, workspaceId: workspace.id });
  }

  openFile(input: { path: string | null; workspaceId?: string }) {
    const workspaceId = input.workspaceId ? this.getWorkspace(input.workspaceId).id : undefined;
    return openRuntimeFile(input.path, workspaceId);
  }

  serveFile(input: { path: string | null; workspaceId?: string; download?: boolean }) {
    return serveRuntimeFile(input.path, input.download, input.workspaceId);
  }

  getInbox(workspaceId: string, limit: number) {
    const workspace = this.getWorkspace(workspaceId);
    return getRuntimeInbox(this, workspace.id, limit);
  }

  getInboxEmail(workspaceId: string, emailId: string) {
    const workspace = this.getWorkspace(workspaceId);
    return getRuntimeInboxEmail(this, workspace.id, emailId);
  }

  draftInboxReply(input: InboxReplyInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return draftRuntimeInboxReply(this, { ...input, workspaceId: workspace.id });
  }

  sendInboxReply(input: InboxSendInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return sendRuntimeInboxReply(this, { ...input, workspaceId: workspace.id });
  }

  selectInboxReplyStyle(input: { workspaceId: string; emailId: string; style?: unknown }) {
    const workspace = this.getWorkspace(input.workspaceId);
    return selectRuntimeInboxReplyStyle(this, { ...input, workspaceId: workspace.id });
  }

  listIntakeSessions(workspaceId = "farreach") {
    const workspace = this.getWorkspace(workspaceId);
    return listIntakeSessions(workspace.id);
  }

  processIntake(input: IntakeInput) {
    const workspace = this.getWorkspace(input.project);
    return processIntake(this, { ...input, project: workspace.id });
  }

  synthesizeIntake(input: SynthesizeIntakeInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return synthesizeIntakeDocuments(this, { ...input, workspaceId: workspace.id });
  }

  async refreshIntelligence(workspaceId = "farreach") {
    const workspace = this.getWorkspace(workspaceId);
    const result = await refreshIntelligenceFeeds(workspace.id);
    this.recordEvent("intelligence.refreshed", workspace.id, {
      success: result.success,
      newsCount: result.newsCount,
      competitorCount: result.competitorCount,
      sourcesOk: result.sources.filter((source) => source.ok).length,
      sourcesTotal: result.sources.length,
      error: result.error || null,
    });
    return result;
  }

  importLeads(input: LeadImportInput) {
    const workspace = this.getWorkspace(input.workspaceId);
    return importWorkspaceLeads(this, { ...input, workspaceId: workspace.id });
  }

  queueCompanyIntel(input: { workspaceId: string; lead: CompanyIntelLeadInput; force?: boolean; source?: string }) {
    const workspace = this.getWorkspace(input.workspaceId);
    return queueCompanyIntel(this, workspace.id, input.lead, {
      force: input.force,
      source: input.source,
    });
  }

  getCompanyIntel(input: { workspaceId: string; lead: CompanyIntelLeadInput }) {
    const workspace = this.getWorkspace(input.workspaceId);
    return readCompanyIntel(this, workspace.id, input.lead);
  }

  async collectCompanyIntel(input: { workspaceId: string; lead: CompanyIntelLeadInput }) {
    this.getWorkspace(input.workspaceId);
    return collectCompanyIntelEnrichment(input.lead);
  }

  completeCompanyIntel(input: { workspaceId: string; lead: CompanyIntelLeadInput; jobId?: string; note?: string; enrichment?: CompanyIntelEnrichment }) {
    const workspace = this.getWorkspace(input.workspaceId);
    return writeCompanyIntelDossier(this, workspace.id, input.lead, {
      jobId: input.jobId,
      note: input.note,
      enrichment: input.enrichment,
    });
  }

  createOperatorCommand(input: OperatorCommandInput): OperatorCommandRecord {
    return createOperatorCommand(this, input);
  }

  recordEvent(type: string, workspaceId: WorkspaceId, payload: Record<string, unknown>): RuntimeEvent {
    const workspace = this.getWorkspace(workspaceId);
    const event: RuntimeEvent = {
      id: makeEventId(type),
      type,
      workspaceId: workspace.id,
      payload,
      createdAt: new Date().toISOString(),
    };
    const events = readEvents(workspace.id);
    events.unshift(event);
    writeEvents(workspace.id, events.slice(0, 1000));
    return event;
  }

  listEvents(limit = 50, workspaceId?: WorkspaceId): RuntimeEvent[] {
    const workspaceIds = workspaceId ? [this.getWorkspace(workspaceId).id] : discoverEventWorkspaces();
    return workspaceIds
      .flatMap((workspace) => readEvents(workspace))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  listActivityEvents(limit = 20, workspaceId?: WorkspaceId) {
    return runtimeEventsToAgentEvents(this.listEvents(limit, workspaceId), limit);
  }

  getSentLogSnapshot(limit = 10, workspaceId?: WorkspaceId) {
    return getSentLogSnapshot(limit, workspaceId);
  }

  snapshot(): SalesRuntimeSnapshot {
    return {
      workspaces: this.listWorkspaces(),
      packs: this.listPacks(),
      jobs: this.workflows.listJobs(50),
      sideEffects: listSideEffectDecisions(50),
      events: this.listEvents(50),
    };
  }
}

export function createSalesRuntime(): SalesRuntime {
  return new SalesRuntime();
}

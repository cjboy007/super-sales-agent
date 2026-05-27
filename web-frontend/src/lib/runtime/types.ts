export type WorkspaceId = string;

export type SalesPackId =
  | "email-reply"
  | "follow-up"
  | "quotation"
  | "product-catalog"
  | "payment-collection"
  | "export-b2b";

export interface WorkspaceAdapter {
  id: WorkspaceId;
  name: string;
  brandName: string;
  industry: string;
  identity: {
    senderName: string;
    senderEmail: string;
    companyName: string;
    signature: string;
  };
  capabilities: {
    emailSync: boolean;
    quotations: boolean;
    crm: "none" | "mock" | "okki" | "csv";
    documents: boolean;
  };
  data: {
    leadsPath?: string;
    productCatalogPath?: string;
    templatesPath?: string;
    rulesPath?: string;
  };
  packs: SalesPackId[];
}

export interface WorkspaceInput {
  id: WorkspaceId;
  name?: string;
  brandName?: string;
  industry?: string;
  identity?: Partial<WorkspaceAdapter["identity"]>;
  capabilities?: Partial<WorkspaceAdapter["capabilities"]>;
  data?: Partial<WorkspaceAdapter["data"]>;
  packs?: SalesPackId[];
}

export interface SalesPack {
  id: SalesPackId;
  name: string;
  description: string;
  workflows: RuntimeWorkflowType[];
  sideEffects: SideEffectKind[];
}

export type LlmTask =
  | "classify"
  | "extract"
  | "draft"
  | "summarize"
  | "translate"
  | "recommend";

export interface LlmRequest {
  task: LlmTask;
  input: string;
  workspaceId?: WorkspaceId;
  context?: Record<string, unknown>;
}

export interface LlmResult {
  provider: string;
  source: "mock" | "provider";
  text: string;
  confidence: number;
  structured?: Record<string, unknown>;
}

export type SideEffectKind =
  | "email.send"
  | "crm.write"
  | "data.read"
  | "imap.fetch"
  | "feishu.notify"
  | "payment.write"
  | "bank.read"
  | "document.generate"
  | "document.preview";

export interface SideEffectRequest {
  kind: SideEffectKind;
  workspaceId: WorkspaceId;
  summary: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface SideEffectDecision {
  id: string;
  kind: SideEffectKind;
  workspaceId: WorkspaceId;
  status: "blocked" | "allowed" | "approved" | "rejected" | "retry_requested";
  reason: string;
  realExecutionEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
  approvedBy?: string;
  approvalNote?: string;
  rejectedBy?: string;
  rejectionNote?: string;
  retryOf?: string;
  retryCount?: number;
  payload: Record<string, unknown>;
}

export interface DocumentGenerationRequest {
  workspaceId: WorkspaceId;
  documentType: "QT" | "PI" | "PN" | "SPL" | "CI" | "PL" | "ALL" | string;
  customer: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface RuntimeEvent {
  id: string;
  type: string;
  workspaceId: WorkspaceId;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type RuntimeWorkflowType =
  | "lead.import"
  | "email.reply"
  | "follow_up.plan"
  | "quotation.prepare"
  | "operator.command"
  | "side_effect.request";

export type RuntimeJobStatus = "queued" | "running" | "completed" | "failed";

export interface RuntimeWorkflowStep {
  id: string;
  kind: "llm" | "memory" | "side_effect" | "event";
  status: RuntimeJobStatus;
  summary: string;
  output?: Record<string, unknown>;
  error?: string;
}

export interface RuntimeJob {
  id: string;
  workspaceId: WorkspaceId;
  workflow: RuntimeWorkflowType;
  status: RuntimeJobStatus;
  input: Record<string, unknown>;
  steps: RuntimeWorkflowStep[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface SalesRuntimeSnapshot {
  workspaces: WorkspaceAdapter[];
  packs: SalesPack[];
  jobs: RuntimeJob[];
  sideEffects: SideEffectDecision[];
  events: RuntimeEvent[];
}

export interface SalesRuntimeManifestCapability {
  id: string;
  openclawEquivalent: string;
  ssaPrimitive: string;
  status: "implemented" | "partial" | "planned";
  notes: string;
}

export interface SalesRuntimeManifest {
  id: "ssa-sales-os";
  name: string;
  positioning: string;
  runtimeBoundary: {
    standalone: boolean;
    requiresOpenClaw: boolean;
    requiresHermes: boolean;
    dataRoot: string;
    sideEffectsBlockedByDefault: boolean;
  };
  operatorSurfaces: string[];
  capabilities: SalesRuntimeManifestCapability[];
  salesPacks: SalesPack[];
  workflowTypes: RuntimeWorkflowType[];
  sideEffectKinds: SideEffectKind[];
  llmTasks: LlmTask[];
  dataContracts: string[];
  nextGaps: string[];
}

export type MemoryRecordKind = "fact" | "episode";
export type MemoryAuthority = "authoritative" | "imported" | "suggested";

export interface MemorySource {
  type:
    | "operator"
    | "lead"
    | "email"
    | "quotation"
    | "document"
    | "approval"
    | "workflow"
    | "intake"
    | "system"
    | "llm"
    | "openclaw"
    | "hermes"
    | "external-memory";
  id?: string;
  path?: string;
  url?: string;
}

export interface MemoryWriteInput {
  workspaceId: WorkspaceId;
  kind?: MemoryRecordKind;
  customerId?: string;
  customerName?: string;
  subject?: string;
  title: string;
  body: string;
  tags?: string[];
  source?: MemorySource;
  authority?: MemoryAuthority;
  confidence?: number;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface MemoryRecord {
  id: string;
  workspaceId: WorkspaceId;
  kind: MemoryRecordKind;
  customerId?: string;
  customerName?: string;
  subject?: string;
  title: string;
  body: string;
  tags: string[];
  source: MemorySource;
  authority: MemoryAuthority;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string;
}

export interface MemorySearchInput {
  workspaceId: WorkspaceId;
  query: string;
  customerId?: string;
  customerName?: string;
  kinds?: MemoryRecordKind[];
  authorities?: MemoryAuthority[];
  limit?: number;
}

export interface MemoryHit extends MemoryRecord {
  score: number;
  matchedTerms: string[];
  reason: string;
}

export interface MemoryTimelineSummary {
  workspaceId: WorkspaceId;
  query: string;
  customerId?: string;
  customerName?: string;
  summary: string;
  openRisks: string[];
  recommendedNextSteps: string[];
  recentRecords: MemoryRecord[];
  updatedAt: string;
}

export interface CustomerMemoryContext {
  workspaceId: WorkspaceId;
  query: string;
  customerId?: string;
  customerName?: string;
  facts: MemoryHit[];
  episodes: MemoryHit[];
  timeline: MemoryTimelineSummary;
  retrieval: {
    provider: "local-lexical";
    query: string;
    totalHits: number;
  };
}

export interface OperatorCommandInput {
  workspaceId?: WorkspaceId;
  page?: unknown;
  message?: unknown;
  context?: unknown;
  url?: unknown;
}

export interface OperatorCommandRecord {
  id: string;
  workspaceId: WorkspaceId;
  project: WorkspaceId;
  page: string;
  url: string;
  message: string;
  context: Record<string, unknown>;
  status: "queued_for_local_runtime";
  sideEffects: "blocked";
  jobId?: string;
  createdAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRecord {
  id: string;
  workspaceId: WorkspaceId;
  project: WorkspaceId;
  dealId: string;
  deal_id: string;
  account: string;
  title: string;
  triggerType: string;
  value: string;
  risk: string;
  due: string;
  recommendation: string;
  guardrail: string;
  status: ApprovalStatus;
  metadata: Record<string, unknown>;
  decisionBy?: string;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalInput {
  id?: unknown;
  workspaceId?: WorkspaceId;
  dealId?: unknown;
  deal_id?: unknown;
  account?: unknown;
  title?: unknown;
  triggerType?: unknown;
  value?: unknown;
  risk?: unknown;
  due?: unknown;
  recommendation?: unknown;
  guardrail?: unknown;
  status?: unknown;
  metadata?: unknown;
}

export interface ApprovalPatchInput {
  id?: unknown;
  status?: unknown;
  decisionBy?: unknown;
  decisionNote?: unknown;
  metadata?: unknown;
}

export interface AgentStateSummary {
  name: string;
  role: string;
  tasksCompletedToday: number;
  tasksFailedToday: number;
  activeTasks: number;
  approvalGated: number;
}

export interface AgentStateReadModel {
  agents: AgentStateSummary[];
  updatedAt: string;
}

export type IntelligenceFeedType = "alerts" | "competitors" | "insights" | "news" | "trends";

export interface IntelligenceFeedReadModel {
  success: true;
  alerts?: unknown[];
  competitors?: Array<Record<string, unknown>>;
  insights?: unknown[];
  news?: Array<Record<string, unknown>>;
  trends?: unknown[];
  updatedAt?: string | null;
  generatedAt?: string | null;
  cached?: boolean;
  _totalRaw?: number;
  _filtered?: number;
  [key: string]: unknown;
}

export interface Customer360ReadModel {
  workspaceId: WorkspaceId;
  query: string;
  customer: {
    name: string;
    email?: string;
    country?: string;
    industry?: string;
    stage: string;
    score: number;
  };
  leads: Array<Record<string, unknown>>;
  inbox: Array<Record<string, unknown>>;
  sentEmails: Array<Record<string, unknown>>;
  quotations: Array<Record<string, unknown>>;
  approvals: ApprovalRecord[];
  negotiation: {
    openRisks: string[];
    recentSubjects: string[];
    recommendedNextStep: string;
  };
  memory: CustomerMemoryContext;
  updatedAt: string;
}

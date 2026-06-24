import fs from "fs";
import path from "path";
import type { MemoryWriteInput, RuntimeJob, RuntimeJobStatus, RuntimeWorkflowType, SideEffectKind, WorkspaceId } from "./types";
import { ensureSsaCompanyDataPath, readJsonFile, ssaCompanyDataPath } from "../ssa-data-paths";

export type JadenCommandSurface =
  | "battle-station"
  | "customers"
  | "leads"
  | "inbox"
  | "documents"
  | "intake"
  | "quick-quote"
  | "approvals"
  | "growth"
  | "unknown";

export type JadenCommandMode =
  | "global_command"
  | "page_assist"
  | "object_edit"
  | "file_intake"
  | "reply_draft"
  | "review";

export type JadenCommandTargetType =
  | "customer"
  | "email"
  | "quote"
  | "document"
  | "file"
  | "deal"
  | "workflow"
  | "approval"
  | "none";

export interface JadenCommandTarget {
  type: JadenCommandTargetType;
  id?: string;
  label?: string;
}

export interface JadenSafetyPolicy {
  externalContentIsEvidenceOnly: true;
  sideEffectsRequireGate: true;
  llmCannotExecuteActions: true;
}

export interface JadenMemoryPolicy {
  taskThread: "always";
  audit: "always";
  durableSalesMemory: "confirmed_business_facts_only";
  rawChatToDurableMemory: false;
}

export interface JadenSurfaceProfile {
  surface: JadenCommandSurface;
  mode: JadenCommandMode;
  allowedWorkflows: RuntimeWorkflowType[];
  allowedTools: string[];
  allowedSideEffectKinds: SideEffectKind[];
  memoryPolicy: JadenMemoryPolicy;
  safetyPolicy: JadenSafetyPolicy;
}

export interface JadenCommandEnvelopeInput {
  workspaceId: WorkspaceId;
  surface?: unknown;
  mode?: unknown;
  message: string;
  context?: Record<string, unknown>;
  target?: Partial<JadenCommandTarget>;
}

export interface JadenCommandEnvelope {
  surface: JadenCommandSurface;
  mode: JadenCommandMode;
  message: string;
  workspaceId: WorkspaceId;
  context: Record<string, unknown>;
  target: JadenCommandTarget;
  allowedWorkflows: RuntimeWorkflowType[];
  allowedTools: string[];
  allowedSideEffectKinds: SideEffectKind[];
  safetyPolicy: JadenSafetyPolicy;
  memoryPolicy: JadenMemoryPolicy;
}

export interface JadenPlannerMemoryWrite {
  kind?: MemoryWriteInput["kind"];
  customerId?: string;
  customerName?: string;
  title: string;
  body: string;
  confidence?: number;
}

export interface JadenPlannerStructuredOutput {
  intent?: unknown;
  confidence?: unknown;
  workflows?: unknown;
  tools?: unknown;
  target?: unknown;
  needsHumanReview?: unknown;
  sideEffectKinds?: unknown;
  memoryWrites?: unknown;
  notes?: unknown;
}

export interface JadenValidatedPlan {
  source: "jaden-planner" | "llm-structured";
  intent: string;
  confidence: number;
  workflows: RuntimeWorkflowType[];
  tools: string[];
  target: JadenCommandTarget;
  needsHumanReview: boolean;
  sideEffectKinds: SideEffectKind[];
  memoryWrites: JadenPlannerMemoryWrite[];
  notes: string;
  validation: {
    acceptedWorkflows: RuntimeWorkflowType[];
    rejectedWorkflows: string[];
    acceptedTools: string[];
    rejectedTools: string[];
    acceptedSideEffectKinds: SideEffectKind[];
    rejectedSideEffectKinds: string[];
    warnings: string[];
  };
}

export interface JadenCommandThread {
  id: string;
  workspaceId: WorkspaceId;
  commandId: string;
  createdAt: string;
  envelope: JadenCommandEnvelope;
  plan: JadenValidatedPlan;
  memory: JadenMemoryPolicy;
  items: Array<{
    type: "operator.command" | "jaden.plan.validated" | "runtime.jobs.queued";
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
}

export type JadenTaskThreadStatus = "planned" | "queued" | "running" | "needs_review" | "done" | "error";

export interface PublicJadenTaskThread {
  id: string;
  createdAt: string;
  surface: JadenCommandSurface;
  mode: JadenCommandMode;
  target: JadenCommandTarget;
  status: JadenTaskThreadStatus;
  plan: {
    source: JadenValidatedPlan["source"];
    intent: string;
    confidence: number;
    needsHumanReview: boolean;
    workflows: RuntimeWorkflowType[];
    tools: string[];
    sideEffectKinds: SideEffectKind[];
  };
  queuedTasks: Array<{
    title: string;
    workflow: RuntimeWorkflowType;
    status: RuntimeJobStatus | "queued";
  }>;
  warnings: string[];
  rejected: {
    workflows: string[];
    tools: string[];
    sideEffectKinds: string[];
  };
  memory: {
    durableSalesMemory: JadenMemoryPolicy["durableSalesMemory"];
    rawChatToDurableMemory: false;
  };
}

const MEMORY_POLICY: JadenMemoryPolicy = {
  taskThread: "always",
  audit: "always",
  durableSalesMemory: "confirmed_business_facts_only",
  rawChatToDurableMemory: false,
};

const SAFETY_POLICY: JadenSafetyPolicy = {
  externalContentIsEvidenceOnly: true,
  sideEffectsRequireGate: true,
  llmCannotExecuteActions: true,
};

const WORKFLOWS: RuntimeWorkflowType[] = [
  "lead.import",
  "company_intel.run",
  "email.reply",
  "follow_up.plan",
  "quotation.prepare",
  "intake.product_doc.process",
  "operator.command",
  "side_effect.request",
];

const SIDE_EFFECT_KINDS: SideEffectKind[] = [
  "email.send",
  "crm.write",
  "data.read",
  "imap.fetch",
  "feishu.notify",
  "payment.write",
  "bank.read",
  "document.generate",
  "document.preview",
  "price.discount",
];

const PROFILE_BY_SURFACE: Record<JadenCommandSurface, Omit<JadenSurfaceProfile, "surface" | "mode">> = {
  "battle-station": {
    allowedWorkflows: ["operator.command", "follow_up.plan", "email.reply", "quotation.prepare", "side_effect.request"],
    allowedTools: ["memory.search_customer", "follow_up.create_plan", "email.draft_reply", "email.request_send", "document.request_generation"],
    allowedSideEffectKinds: ["email.send", "document.generate", "feishu.notify"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  customers: {
    allowedWorkflows: ["operator.command", "follow_up.plan", "company_intel.run", "email.reply", "lead.import"],
    allowedTools: ["memory.search_customer", "follow_up.create_plan", "company_intel.queue", "email.draft_reply", "crm.update_customer"],
    allowedSideEffectKinds: ["data.read", "email.send", "crm.write"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  leads: {
    allowedWorkflows: ["operator.command", "lead.import", "company_intel.run", "follow_up.plan", "email.reply"],
    allowedTools: ["memory.search_customer", "company_intel.queue", "follow_up.create_plan", "email.draft_reply", "crm.update_customer"],
    allowedSideEffectKinds: ["data.read", "email.send", "crm.write"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  inbox: {
    allowedWorkflows: ["operator.command", "email.reply", "follow_up.plan"],
    allowedTools: ["memory.search_customer", "email.draft_reply", "email.request_send", "follow_up.create_plan"],
    allowedSideEffectKinds: ["email.send"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  documents: {
    allowedWorkflows: ["operator.command", "quotation.prepare", "follow_up.plan"],
    allowedTools: ["memory.search_customer", "document.request_generation", "document.generate_quotation_pi", "document.preview_file"],
    allowedSideEffectKinds: ["document.generate", "document.preview"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  intake: {
    allowedWorkflows: ["operator.command", "intake.product_doc.process", "company_intel.run", "follow_up.plan"],
    allowedTools: ["memory.search_customer", "company_intel.queue", "data.read_external", "document.preview_file"],
    allowedSideEffectKinds: ["data.read", "document.preview"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  "quick-quote": {
    allowedWorkflows: ["operator.command", "quotation.prepare", "follow_up.plan"],
    allowedTools: ["memory.search_customer", "document.request_generation", "document.generate_quotation_pi", "price.request_discount"],
    allowedSideEffectKinds: ["document.generate", "price.discount"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  approvals: {
    allowedWorkflows: ["operator.command", "side_effect.request", "follow_up.plan"],
    allowedTools: ["memory.search_customer", "follow_up.create_plan", "email.request_send", "document.request_generation", "price.request_discount"],
    allowedSideEffectKinds: ["email.send", "document.generate", "price.discount", "crm.write"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  growth: {
    allowedWorkflows: ["operator.command", "company_intel.run", "follow_up.plan", "email.reply", "quotation.prepare"],
    allowedTools: ["memory.search_customer", "company_intel.queue", "follow_up.create_plan", "email.draft_reply", "email.request_send"],
    allowedSideEffectKinds: ["data.read", "email.send", "document.generate"],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
  unknown: {
    allowedWorkflows: ["operator.command"],
    allowedTools: ["memory.search_customer"],
    allowedSideEffectKinds: [],
    memoryPolicy: MEMORY_POLICY,
    safetyPolicy: SAFETY_POLICY,
  },
};

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeSurface(value: unknown): JadenCommandSurface {
  const raw = text(value).toLowerCase();
  if (raw === "cockpit" || raw === "dashboard" || raw === "home") return "battle-station";
  if (raw === "customer") return "customers";
  if (raw === "quotations" || raw === "quote") return "quick-quote";
  if (raw in PROFILE_BY_SURFACE) return raw as JadenCommandSurface;
  return "unknown";
}

function normalizeMode(value: unknown, surface: JadenCommandSurface): JadenCommandMode {
  const raw = text(value).toLowerCase();
  if (raw === "global_command" || raw === "page_assist" || raw === "object_edit" || raw === "file_intake" || raw === "reply_draft" || raw === "review") {
    return raw;
  }
  if (surface === "battle-station") return "global_command";
  if (surface === "quick-quote") return "object_edit";
  if (surface === "intake") return "file_intake";
  if (surface === "inbox") return "reply_draft";
  if (surface === "approvals" || surface === "growth") return "review";
  return "page_assist";
}

function normalizeTarget(input: unknown): JadenCommandTarget {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { type: "none" };
  const raw = input as Record<string, unknown>;
  const type = text(raw.type);
  const safeType: JadenCommandTargetType = (
    type === "customer" ||
    type === "email" ||
    type === "quote" ||
    type === "document" ||
    type === "file" ||
    type === "deal" ||
    type === "workflow" ||
    type === "approval"
  ) ? type : "none";
  return {
    type: safeType,
    id: text(raw.id) || undefined,
    label: text(raw.label) || undefined,
  };
}

function hasUnknownTargetType(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const type = text((input as Record<string, unknown>).type);
  return Boolean(type) && normalizeTarget(input).type === "none" && type !== "none";
}

function unique<T extends string>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function workflowFrom(value: string): RuntimeWorkflowType | null {
  return (WORKFLOWS as string[]).includes(value) ? value as RuntimeWorkflowType : null;
}

function sideEffectKindFrom(value: string): SideEffectKind | null {
  return (SIDE_EFFECT_KINDS as string[]).includes(value) ? value as SideEffectKind : null;
}

function confidenceFrom(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.5;
}

function memoryWritesFrom(value: unknown): JadenPlannerMemoryWrite[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const title = text(record.title);
    const body = text(record.body);
    if (!title || !body) return [];
    return [{
      kind: text(record.kind) as MemoryWriteInput["kind"] || undefined,
      customerId: text(record.customerId) || undefined,
      customerName: text(record.customerName) || undefined,
      title,
      body,
      confidence: typeof record.confidence === "number" ? record.confidence : undefined,
    }];
  });
}

function commandThreadId(commandId: string): string {
  return `thread-${commandId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function threadPath(workspaceId: WorkspaceId, threadId: string): string {
  return ensureSsaCompanyDataPath(workspaceId, "operator-commands", "threads", `${threadId}.json`);
}

function readThreadPath(workspaceId: WorkspaceId, threadId: string): string {
  const safeThreadId = text(threadId);
  if (!safeThreadId || safeThreadId !== path.basename(safeThreadId) || !/^[a-zA-Z0-9._-]+$/.test(safeThreadId)) {
    return "";
  }
  return ssaCompanyDataPath(workspaceId, "operator-commands", "threads", `${safeThreadId}.json`);
}

function threadsDir(workspaceId: WorkspaceId): string {
  return ssaCompanyDataPath(workspaceId, "operator-commands", "threads");
}

function workflowTitle(workflow: RuntimeWorkflowType): string {
  if (workflow === "email.reply") return "Email follow-up";
  if (workflow === "quotation.prepare") return "Quote or PI preparation";
  if (workflow === "lead.import") return "Customer import";
  if (workflow === "company_intel.run") return "Customer background check";
  if (workflow === "intake.product_doc.process") return "Product document intake";
  if (workflow === "operator.command") return "Operator request";
  if (workflow === "side_effect.request") return "External action approval";
  return "Background task";
}

function queuedJobsFromThread(thread: JadenCommandThread): Array<{ id?: string; workflow: RuntimeWorkflowType }> {
  const queued = thread.items.find((item) => item.type === "runtime.jobs.queued");
  const jobs = queued?.payload.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((job) => {
    if (!job || typeof job !== "object" || Array.isArray(job)) return [];
    const raw = job as Record<string, unknown>;
    const workflow = typeof raw.workflow === "string" ? workflowFrom(raw.workflow) : null;
    if (!workflow) return [];
    return [{
      id: typeof raw.id === "string" ? raw.id : undefined,
      workflow,
    }];
  });
}

function statusForThread(thread: JadenCommandThread, jobsById: Map<string, RuntimeJob>): JadenTaskThreadStatus {
  const jobs = queuedJobsFromThread(thread)
    .map((job) => job.id ? jobsById.get(job.id) : null)
    .filter((job): job is RuntimeJob => Boolean(job));
  if (jobs.some((job) => job.status === "failed")) return "error";
  if (jobs.some((job) => job.status === "running")) return "running";
  if (jobs.length > 0 && jobs.every((job) => job.status === "completed")) return "done";
  if (thread.plan.needsHumanReview) return "needs_review";
  if (queuedJobsFromThread(thread).length > 0) return "queued";
  return "planned";
}

function publicThread(thread: JadenCommandThread, jobsById: Map<string, RuntimeJob>): PublicJadenTaskThread {
  const queuedJobs = queuedJobsFromThread(thread);
  return {
    id: thread.id,
    createdAt: thread.createdAt,
    surface: thread.envelope.surface,
    mode: thread.envelope.mode,
    target: thread.envelope.target,
    status: statusForThread(thread, jobsById),
    plan: {
      source: thread.plan.source,
      intent: thread.plan.intent,
      confidence: thread.plan.confidence,
      needsHumanReview: thread.plan.needsHumanReview,
      workflows: [...thread.plan.validation.acceptedWorkflows],
      tools: [...thread.plan.validation.acceptedTools],
      sideEffectKinds: [...thread.plan.validation.acceptedSideEffectKinds],
    },
    queuedTasks: queuedJobs.map((job) => ({
      title: workflowTitle(job.workflow),
      workflow: job.workflow,
      status: (job.id ? jobsById.get(job.id)?.status : undefined) || "queued",
    })),
    warnings: [...thread.plan.validation.warnings],
    rejected: {
      workflows: [...thread.plan.validation.rejectedWorkflows],
      tools: [...thread.plan.validation.rejectedTools],
      sideEffectKinds: [...thread.plan.validation.rejectedSideEffectKinds],
    },
    memory: {
      durableSalesMemory: thread.memory.durableSalesMemory,
      rawChatToDurableMemory: false,
    },
  };
}

function readThreadFile(filePath: string): JadenCommandThread | null {
  const thread = readJsonFile<JadenCommandThread | null>(filePath, null);
  if (!thread || typeof thread !== "object" || !thread.id || !thread.envelope || !thread.plan) return null;
  return thread;
}

export function listJadenCommandThreads(input: {
  workspaceId: WorkspaceId;
  threadId?: string | null;
  limit?: number;
  jobs?: RuntimeJob[];
}): PublicJadenTaskThread[] {
  const jobsById = new Map((input.jobs || []).map((job) => [job.id, job]));
  const limit = Math.min(50, Math.max(1, input.limit || 10));
  const explicitThreadPath = input.threadId ? readThreadPath(input.workspaceId, input.threadId) : "";
  const threadFiles = input.threadId
    ? (explicitThreadPath ? [explicitThreadPath] : [])
    : (() => {
      const dir = threadsDir(input.workspaceId);
      try {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
          .filter((name) => name.endsWith(".json"))
          .map((name) => path.join(dir, name));
      } catch {
        return [];
      }
    })();

  return threadFiles
    .map(readThreadFile)
    .filter((thread): thread is JadenCommandThread => Boolean(thread))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((thread) => publicThread(thread, jobsById));
}

export function getJadenSurfaceProfile(surfaceInput: unknown, modeInput?: unknown): JadenSurfaceProfile {
  const surface = normalizeSurface(surfaceInput);
  const mode = normalizeMode(modeInput, surface);
  const profile = PROFILE_BY_SURFACE[surface];
  return {
    surface,
    mode,
    allowedWorkflows: [...profile.allowedWorkflows],
    allowedTools: [...profile.allowedTools],
    allowedSideEffectKinds: [...profile.allowedSideEffectKinds],
    memoryPolicy: { ...profile.memoryPolicy },
    safetyPolicy: { ...profile.safetyPolicy },
  };
}

export function createJadenCommandEnvelope(input: JadenCommandEnvelopeInput): JadenCommandEnvelope {
  const surface = normalizeSurface(input.surface);
  const mode = normalizeMode(input.mode, surface);
  const profile = getJadenSurfaceProfile(surface, mode);
  return {
    surface,
    mode,
    message: input.message,
    workspaceId: input.workspaceId,
    context: input.context || {},
    target: normalizeTarget(input.target),
    allowedWorkflows: [...profile.allowedWorkflows],
    allowedTools: [...profile.allowedTools],
    allowedSideEffectKinds: [...profile.allowedSideEffectKinds],
    safetyPolicy: { ...profile.safetyPolicy },
    memoryPolicy: { ...profile.memoryPolicy },
  };
}

export function createJadenCommandPlan(
  envelope: JadenCommandEnvelope,
  rawPlan: JadenPlannerStructuredOutput,
  source: JadenValidatedPlan["source"] = "llm-structured"
): JadenValidatedPlan {
  const requestedWorkflows = arrayOfStrings(rawPlan.workflows);
  const knownWorkflows = requestedWorkflows.map((item) => workflowFrom(item)).filter((item): item is RuntimeWorkflowType => Boolean(item));
  const unknownWorkflows = requestedWorkflows.filter((item) => !workflowFrom(item));
  let acceptedWorkflows = unique(knownWorkflows.filter((item) => envelope.allowedWorkflows.includes(item)));
  let rejectedWorkflows = [
    ...knownWorkflows.filter((item) => !envelope.allowedWorkflows.includes(item)),
    ...unknownWorkflows,
  ];

  const requestedTools = arrayOfStrings(rawPlan.tools);
  let acceptedTools = unique(requestedTools.filter((item) => envelope.allowedTools.includes(item)));
  let rejectedTools = requestedTools.filter((item) => !envelope.allowedTools.includes(item));

  const requestedSideEffects = arrayOfStrings(rawPlan.sideEffectKinds);
  const knownSideEffects = requestedSideEffects.map((item) => sideEffectKindFrom(item)).filter((item): item is SideEffectKind => Boolean(item));
  const unknownSideEffects = requestedSideEffects.filter((item) => !sideEffectKindFrom(item));
  let acceptedSideEffectKinds = unique(knownSideEffects.filter((item) => envelope.allowedSideEffectKinds.includes(item)));
  let rejectedSideEffectKinds = [
    ...knownSideEffects.filter((item) => !envelope.allowedSideEffectKinds.includes(item)),
    ...unknownSideEffects,
  ];

  const confidence = confidenceFrom(rawPlan.confidence);
  const plannerTarget = normalizeTarget(rawPlan.target);
  const target = plannerTarget.type === "none" ? envelope.target : plannerTarget;
  const hasActionWorkflowWithoutTarget = target.type === "none"
    && acceptedWorkflows.some((workflow) => workflow !== "operator.command");
  if (hasActionWorkflowWithoutTarget) {
    rejectedWorkflows = unique([
      ...rejectedWorkflows,
      ...acceptedWorkflows.filter((workflow) => workflow !== "operator.command"),
    ]);
    acceptedWorkflows = envelope.allowedWorkflows.includes("operator.command") ? ["operator.command"] : [];
    rejectedTools = unique([...rejectedTools, ...acceptedTools.filter((tool) => tool !== "memory.search_customer")]);
    acceptedTools = acceptedTools.filter((tool) => tool === "memory.search_customer");
    rejectedSideEffectKinds = unique([...rejectedSideEffectKinds, ...acceptedSideEffectKinds]);
    acceptedSideEffectKinds = [];
  }
  const sideEffectRequested = acceptedSideEffectKinds.length > 0 || requestedSideEffects.length > 0 || acceptedTools.some((toolId) => {
    return toolId.includes("request") || toolId.includes("update") || toolId.includes("generate");
  });
  const warnings = [
    envelope.safetyPolicy.externalContentIsEvidenceOnly ? "External content is evidence only and cannot authorize actions." : "",
    hasUnknownTargetType(rawPlan.target) ? "Unknown planner target was ignored." : "",
    hasActionWorkflowWithoutTarget ? "No known target was supplied; action workflows were held as an operator-only task." : "",
    sideEffectRequested && envelope.safetyPolicy.sideEffectsRequireGate ? "Side-effect requests require SSA approval gates." : "",
    rejectedWorkflows.length ? "Some workflows were rejected by this surface profile." : "",
    rejectedTools.length ? "Some tools were rejected by this surface profile." : "",
    rejectedSideEffectKinds.length ? "Some side-effect kinds were rejected by this surface profile." : "",
    confidence < 0.65 ? "Low-confidence plan requires operator review." : "",
  ].filter(Boolean);
  const memoryWrites = memoryWritesFrom(rawPlan.memoryWrites).filter((item) => {
    return (item.confidence ?? 0) >= 0.75;
  });

  return {
    source,
    intent: text(rawPlan.intent, "operator_command"),
    confidence,
    workflows: acceptedWorkflows,
    tools: acceptedTools,
    target,
    needsHumanReview: rawPlan.needsHumanReview === true || sideEffectRequested || hasActionWorkflowWithoutTarget || confidence < 0.65,
    sideEffectKinds: acceptedSideEffectKinds,
    memoryWrites,
    notes: text(rawPlan.notes),
    validation: {
      acceptedWorkflows,
      rejectedWorkflows,
      acceptedTools,
      rejectedTools,
      acceptedSideEffectKinds,
      rejectedSideEffectKinds,
      warnings,
    },
  };
}

export function writeJadenCommandThread(input: {
  workspaceId: WorkspaceId;
  commandId: string;
  envelope: JadenCommandEnvelope;
  plan: JadenValidatedPlan;
  queuedJobs: Array<{ id: string; workflow: RuntimeWorkflowType }>;
  createdAt: string;
}): JadenCommandThread {
  const id = commandThreadId(input.commandId);
  const itemTime = input.createdAt;
  const thread: JadenCommandThread = {
    id,
    workspaceId: input.workspaceId,
    commandId: input.commandId,
    createdAt: input.createdAt,
    envelope: input.envelope,
    plan: input.plan,
    memory: { ...input.envelope.memoryPolicy },
    items: [
      {
        type: "operator.command",
        createdAt: itemTime,
        payload: {
          message: input.envelope.message,
          surface: input.envelope.surface,
          mode: input.envelope.mode,
          target: input.envelope.target,
        },
      },
      {
        type: "jaden.plan.validated",
        createdAt: itemTime,
        payload: {
          source: input.plan.source,
          intent: input.plan.intent,
          confidence: input.plan.confidence,
          workflows: input.plan.workflows,
          tools: input.plan.tools,
          sideEffectKinds: input.plan.sideEffectKinds,
          needsHumanReview: input.plan.needsHumanReview,
          validation: input.plan.validation,
        },
      },
      {
        type: "runtime.jobs.queued",
        createdAt: itemTime,
        payload: {
          jobs: input.queuedJobs,
        },
      },
    ],
  };
  const filePath = threadPath(input.workspaceId, id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(thread, null, 2), "utf-8");
  return thread;
}

import crypto from "crypto";
import fs from "fs";
import {
  listPersonalizedSalesDraftRuns,
  type PersonalizedSalesDraft,
  type PersonalizedSalesDraftRun,
} from "./product-quotation-drafts";
import type { SideEffectDecision, SideEffectKind, WorkspaceId } from "./types";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";

export type OutboundApprovalActionType =
  | "email_send"
  | "crm_write"
  | "quotation_generate"
  | "pi_generate"
  | "price_adjustment";

export interface OutboundApprovalRecipient {
  name?: string;
  email?: string;
  role?: string;
}

export interface SourceDraftMetadata {
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  confidence?: number;
  quoteStatus?: string;
  missingInfoChecklist?: string[];
}

export interface OutboundApprovalCandidate {
  id: string;
  workspaceId: WorkspaceId;
  sourceDraftRunId: string;
  sourceDraftId: string;
  sourceProspectingPacketId: string;
  targetCustomer: string;
  recipient: OutboundApprovalRecipient;
  contentSummary: string;
  productQuotationSummary: string;
  evidenceRefs: string[];
  riskFlags: string[];
  expectedAction: string;
  sideEffectKind: SideEffectKind;
  idempotencyKey: string;
  failureRetryStrategy: string;
  sourceDraftMetadata: SourceDraftMetadata;
  approvalStatus: SideEffectDecision["status"];
  sideEffectDecisionId: string;
  waitingForApproval: true;
  notExecuted: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
}

export interface OutboundApprovalRun {
  id: string;
  workspaceId: WorkspaceId;
  status: "completed";
  intendedActionType: OutboundApprovalActionType;
  approvalRequired: true;
  notExecuted: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  crmWritten: false;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  candidates: OutboundApprovalCandidate[];
}

export interface OutboundApprovalInput {
  workspaceId: WorkspaceId;
  sourceDraftRunId?: string;
  sourceDraftId?: string;
  intendedActionType: OutboundApprovalActionType;
  idempotencyKey?: string;
}

type RuntimeForOutboundApproval = {
  requestSideEffect(request: {
    kind: SideEffectKind;
    workspaceId: WorkspaceId;
    summary: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): SideEffectDecision;
};

interface SelectedDraft {
  run: PersonalizedSalesDraftRun;
  draft: PersonalizedSalesDraft;
}

const STORE_LIMIT = 100;

function storePath(workspaceId: WorkspaceId): string {
  return ensureSsaCompanyDataPath(workspaceId, "growth", "outbound-approval-runs.json");
}

export function listOutboundApprovalRuns(workspaceId: WorkspaceId, limit = 20): OutboundApprovalRun[] {
  return readJsonFile<OutboundApprovalRun[]>(storePath(workspaceId), [])
    .filter((run) => run.workspaceId === workspaceId && run.draftOnly === true && run.notExecuted === true)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, limit));
}

export function requestOutboundApproval(
  runtime: RuntimeForOutboundApproval,
  input: OutboundApprovalInput
): OutboundApprovalRun {
  const workspaceId = cleanText(input.workspaceId, "demo-exporter");
  const idempotencyKey = makeRunIdempotencyKey(workspaceId, input);
  const existing = listOutboundApprovalRuns(workspaceId, STORE_LIMIT).find((run) => run.idempotencyKey === idempotencyKey);
  if (existing) return existing;

  const selected = selectDraft(workspaceId, input);
  if (!selected) throw new Error("No Phase 9 draft is available for outbound approval.");

  const now = new Date().toISOString();
  const candidate = buildCandidate(runtime, workspaceId, selected.run, selected.draft, input.intendedActionType, idempotencyKey);
  const run: OutboundApprovalRun = {
    id: `outbound-approval-run-${hashStable(idempotencyKey).slice(0, 14)}`,
    workspaceId,
    status: "completed",
    intendedActionType: input.intendedActionType,
    approvalRequired: true,
    notExecuted: true,
    draftOnly: true,
    officialQuote: false,
    piGenerated: false,
    documentGenerated: false,
    sent: false,
    crmWritten: false,
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
    candidates: [candidate],
  };

  writeRun(workspaceId, run);
  return run;
}

function writeRun(workspaceId: WorkspaceId, run: OutboundApprovalRun) {
  const existing = listOutboundApprovalRuns(workspaceId, STORE_LIMIT)
    .filter((item) => item.idempotencyKey !== run.idempotencyKey);
  fs.writeFileSync(storePath(workspaceId), JSON.stringify([run, ...existing].slice(0, STORE_LIMIT), null, 2), "utf-8");
}

function selectDraft(workspaceId: WorkspaceId, input: OutboundApprovalInput): SelectedDraft | null {
  const runs = listPersonalizedSalesDraftRuns(workspaceId, STORE_LIMIT);
  const candidateRuns = input.sourceDraftRunId
    ? runs.filter((run) => run.id === input.sourceDraftRunId)
    : runs;
  for (const run of candidateRuns) {
    for (const draft of run.drafts || []) {
      const draftIds = [draft.quotationDraft.id, draft.prospectingPacketId, draft.idempotencyKey];
      if (input.sourceDraftId && !draftIds.includes(input.sourceDraftId)) continue;
      return { run, draft };
    }
  }
  return null;
}

function buildCandidate(
  runtime: RuntimeForOutboundApproval,
  workspaceId: WorkspaceId,
  sourceRun: PersonalizedSalesDraftRun,
  draft: PersonalizedSalesDraft,
  intendedActionType: OutboundApprovalActionType,
  runIdempotencyKey: string
): OutboundApprovalCandidate {
  const sideEffectKind = sideEffectKindFor(intendedActionType);
  const targetCustomer = cleanText(draft.candidate.companyName, "Unknown customer");
  const recipient = recipientForDraft(draft);
  const evidenceRefs = draft.evidenceRefs.slice(0, 8);
  const riskFlags = riskFlagsForDraft(draft);
  const contentSummary = contentSummaryFor(intendedActionType, draft);
  const productQuotationSummary = productQuotationSummaryFor(draft);
  const idempotencyKey = `${runIdempotencyKey}:${intendedActionType}`;
  const expectedAction = expectedActionFor(intendedActionType, targetCustomer);
  const failureRetryStrategy = failureRetryStrategyFor(intendedActionType);

  const decision = runtime.requestSideEffect({
    kind: sideEffectKind,
    workspaceId,
    summary: expectedAction,
    idempotencyKey,
    payload: {
      phase: "phase10-outbound-approval",
      sourceDraftRunId: sourceRun.id,
      sourceDraftId: draft.quotationDraft.id,
      sourceProspectingPacketId: draft.prospectingPacketId,
      targetCustomer,
      recipient,
      contentSummary,
      productQuotationSummary,
      evidenceRefs,
      riskFlags,
      expectedAction,
      failureRetryStrategy,
      notExecuted: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      crmWritten: false,
    },
  });

  return {
    id: `outbound-approval-candidate-${hashStable(idempotencyKey).slice(0, 14)}`,
    workspaceId,
    sourceDraftRunId: sourceRun.id,
    sourceDraftId: draft.quotationDraft.id,
    sourceProspectingPacketId: draft.prospectingPacketId,
    targetCustomer,
    recipient,
    contentSummary,
    productQuotationSummary,
    evidenceRefs,
    riskFlags,
    expectedAction,
    sideEffectKind,
    idempotencyKey,
    failureRetryStrategy,
    sourceDraftMetadata: {
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      confidence: draft.confidence,
      quoteStatus: draft.quotationDraft.status,
      missingInfoChecklist: draft.missingInfoChecklist.slice(0, 12),
    },
    approvalStatus: decision.status,
    sideEffectDecisionId: decision.id,
    waitingForApproval: true,
    notExecuted: true,
    draftOnly: true,
    officialQuote: false,
    piGenerated: false,
    documentGenerated: false,
    sent: false,
  };
}

function sideEffectKindFor(actionType: OutboundApprovalActionType): SideEffectKind {
  if (actionType === "email_send") return "email.send";
  if (actionType === "crm_write") return "crm.write";
  if (actionType === "price_adjustment") return "price.discount";
  return "document.generate";
}

function recipientForDraft(draft: PersonalizedSalesDraft): OutboundApprovalRecipient {
  return {
    name: cleanText(draft.candidate.contactName),
    email: cleanText(draft.candidate.contactEmail),
    role: cleanText(draft.candidate.contactRole),
  };
}

function riskFlagsForDraft(draft: PersonalizedSalesDraft): string[] {
  return unique([
    ...draft.riskFlags,
    ...draft.quotationDraft.riskFlags,
    draft.missingInfoChecklist.length > 0 ? "missing_info" : "",
    draft.quotationDraft.status === "insufficient_evidence" ? "insufficient_evidence" : "",
    draft.quotationDraft.status === "insufficient_evidence" ? "missing_inquiry_info" : "",
    draft.quotationDraft.quoteReady === false ? "not_ready_for_quotation" : "",
    "approval_required",
    "not_executed",
  ]);
}

function contentSummaryFor(actionType: OutboundApprovalActionType, draft: PersonalizedSalesDraft): string {
  const customer = cleanText(draft.candidate.companyName, "the target customer");
  if (draft.quotationDraft.status === "insufficient_evidence") {
    return `Review-only request for ${customer}: insufficient evidence / missing inquiry information; do not execute outbound.`;
  }
  if (actionType === "email_send") {
    return `Submit a customer-facing draft email to ${customer} for confirmation using product fit and quotation context.`;
  }
  if (actionType === "crm_write") {
    return `Submit local draft prospecting and quotation context for ${customer} before writing it into CRM.`;
  }
  if (actionType === "price_adjustment") {
    return `Submit price adjustment context for ${customer}; no discount is applied by this request.`;
  }
  if (actionType === "pi_generate") {
    return `Submit PI generation context for ${customer}; no PI or document is generated in this step.`;
  }
  return `Submit quotation generation context for ${customer}; no formal quote or document is generated in this step.`;
}

function productQuotationSummaryFor(draft: PersonalizedSalesDraft): string {
  const products = draft.recommendedProducts.map((item) => item.product).slice(0, 3).join(", ");
  const lineSummary = draft.quotationDraftLines
    .slice(0, 3)
    .map((line) => {
      const price = line.unitPrice === undefined ? "price pending" : `${line.currency || "USD"} ${line.unitPrice}`;
      const cost = line.unitCost === undefined ? "cost pending" : `${line.costCurrency || line.currency || "USD"} ${line.unitCost}`;
      const margin = line.marginPercent === undefined ? "margin pending" : `${line.marginPercent}% margin`;
      return `${line.product}: ${price} / ${cost} / ${margin}`;
    })
    .join("; ");
  return lineSummary || products || "Product and quotation details need completion before any outbound action.";
}

function expectedActionFor(actionType: OutboundApprovalActionType, customer: string): string {
  if (actionType === "email_send") return `Submit draft email to ${customer} for confirmation; not executed.`;
  if (actionType === "crm_write") return `Submit CRM note for ${customer} for confirmation; CRM not written.`;
  if (actionType === "price_adjustment") return `Submit price adjustment for ${customer} for confirmation; no price changed.`;
  if (actionType === "pi_generate") return `Submit PI generation for ${customer} for confirmation; no PI generated.`;
  return `Submit quotation generation for ${customer} for confirmation; no formal quote generated.`;
}

function failureRetryStrategyFor(actionType: OutboundApprovalActionType): string {
  if (actionType === "email_send") {
    return "Retry only after review, address verification, and explicit email enablement.";
  }
  if (actionType === "crm_write") {
    return "Retry only after review and CRM adapter readiness confirmation.";
  }
  if (actionType === "price_adjustment") {
    return "Retry only after margin, authorization, and price policy are confirmed.";
  }
  return "Retry only after review; document generation remains disabled until explicit enablement.";
}

function makeRunIdempotencyKey(workspaceId: WorkspaceId, input: OutboundApprovalInput): string {
  const explicit = cleanText(input.idempotencyKey);
  if (explicit) return explicit;
  return [
    workspaceId,
    "outbound-approval",
    input.sourceDraftRunId || "latest-run",
    input.sourceDraftId || "draft",
    input.intendedActionType,
  ].join(":");
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    output.push(cleaned);
  }
  return output;
}

function hashStable(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

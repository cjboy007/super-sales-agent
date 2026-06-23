import crypto from "crypto";
import fs from "fs";
import type { SalesWorldFact, SalesWorldModel } from "./sales-world-model";
import type { ProspectingCandidate, ProspectingPacket, ProspectingRun } from "./prospecting-loop";
import { listProspectingRuns } from "./prospecting-loop";
import { findPriceReferences, listPriceMemory, type PriceMemoryRecord, type PriceReference } from "./price-memory";
import { ingestQuotationDraftToFactLedger } from "./sales-fact-ledger-ingestion";
import type { WorkspaceId } from "./types";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";

export type ProductFitEvidenceKind =
  | "prospecting_evidence"
  | "sales_world_fact"
  | "customer_memory"
  | "company_intel"
  | "product_material"
  | "price_memory"
  | "historical_quote"
  | "historical_pi"
  | "missing_info";

export interface ProductFitEvidence {
  kind: ProductFitEvidenceKind;
  label: string;
  summary: string;
  confidence: number;
  sourceId?: string;
  sourceUrl?: string;
}

export interface ProductFitRecommendation {
  product: string;
  fitReasons: string[];
  evidence: ProductFitEvidence[];
  confidence: number;
  riskFlags: string[];
  missingInfo: string[];
}

export interface QuotationDraftLine {
  lineId: string;
  product: string;
  description: string;
  specification: string;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
  currency?: string;
  costCurrency?: string;
  margin?: number;
  marginPercent?: number;
  supplier?: string;
  supplierCandidates: string[];
  hsCode?: string;
  incoterms?: string;
  priceReference?: {
    kind: PriceReference["kind"];
    customer: string;
    source: string;
    date: string;
    confidence: number;
  };
  missingInfo: string[];
}

export interface QuotationDraft {
  id: string;
  status: "draft_only" | "insufficient_evidence";
  quoteReady: false;
  lines: QuotationDraftLine[];
  costPriceMarginReferences: string[];
  assumptions: string[];
  missingInfoChecklist: string[];
  evidenceRefs: string[];
  confidence: number;
  riskFlags: string[];
  recommendedHumanEdits: string[];
  dryRun: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
}

export interface PersonalizedSalesDraft {
  workspaceId: WorkspaceId;
  prospectingPacketId: string;
  candidate: ProspectingCandidate;
  recommendedProducts: ProductFitRecommendation[];
  fitReasons: string[];
  quotationDraftLines: QuotationDraftLine[];
  costPriceMarginReferences: string[];
  assumptions: string[];
  missingInfoChecklist: string[];
  evidenceRefs: string[];
  quotationDraft: QuotationDraft;
  confidence: number;
  riskFlags: string[];
  recommendedHumanEdits: string[];
  dryRun: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  createdAt: string;
  idempotencyKey: string;
}

export interface PersonalizedSalesDraftRun {
  id: string;
  workspaceId: WorkspaceId;
  status: "completed";
  dryRun: true;
  draftOnly: true;
  officialQuote: false;
  piGenerated: false;
  documentGenerated: false;
  sent: false;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  drafts: PersonalizedSalesDraft[];
}

export interface ProductQuotationDraftInput {
  workspaceId: WorkspaceId;
  prospectingRunId?: string;
  prospectingPacketId?: string;
  idempotencyKey?: string;
  limit?: number;
}

type RuntimeForProductQuotation = {
  getSalesWorldModel?(workspaceId: WorkspaceId): SalesWorldModel;
};

interface SelectedPacket {
  run: ProspectingRun;
  packet: ProspectingPacket;
}

interface PriceReferenceWithRecord {
  reference: PriceReference;
  record?: PriceMemoryRecord;
}

const STORE_LIMIT = 100;
const DEFAULT_LIMIT = 4;
const REQUIRED_QUOTE_FIELDS = [
  "product",
  "cost",
  "MOQ",
  "supplier",
  "lead time",
  "HS code",
  "packaging",
  "currency",
  "Incoterms",
  "freight",
  "payment terms",
  "quantity",
  "destination",
  "specs",
];

function storePath(workspaceId: WorkspaceId): string {
  return ensureSsaCompanyDataPath(workspaceId, "growth", "quotation-draft-runs.json");
}

export function listPersonalizedSalesDraftRuns(workspaceId: WorkspaceId, limit = 20): PersonalizedSalesDraftRun[] {
  return readJsonFile<PersonalizedSalesDraftRun[]>(storePath(workspaceId), [])
    .filter((run) => run.workspaceId === workspaceId && run.dryRun === true && run.draftOnly === true)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, limit));
}

export function runProductQuotationDraft(
  runtime: RuntimeForProductQuotation,
  input: ProductQuotationDraftInput
): PersonalizedSalesDraftRun {
  const workspaceId = cleanText(input.workspaceId, "demo-exporter");
  const idempotencyKey = makeRunIdempotencyKey(workspaceId, input);
  const existing = listPersonalizedSalesDraftRuns(workspaceId, STORE_LIMIT).find((run) => run.idempotencyKey === idempotencyKey);
  if (existing) return existing;

  const selected = selectPackets(workspaceId, input);
  if (selected.length === 0) {
    throw new Error("No prospecting packet is available for quotation draft generation.");
  }

  const now = new Date().toISOString();
  const worldFacts = readWorldFacts(runtime, workspaceId);
  const drafts = selected.map(({ packet }) => buildDraft(workspaceId, packet, worldFacts, now, idempotencyKey));
  const run: PersonalizedSalesDraftRun = {
    id: `quotation-draft-run-${hashStable(idempotencyKey).slice(0, 14)}`,
    workspaceId,
    status: "completed",
    dryRun: true,
    draftOnly: true,
    officialQuote: false,
    piGenerated: false,
    documentGenerated: false,
    sent: false,
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
    drafts,
  };

  writeRun(workspaceId, run);
  return run;
}

function writeRun(workspaceId: WorkspaceId, run: PersonalizedSalesDraftRun) {
  const existing = listPersonalizedSalesDraftRuns(workspaceId, STORE_LIMIT)
    .filter((item) => item.idempotencyKey !== run.idempotencyKey);
  fs.writeFileSync(storePath(workspaceId), JSON.stringify([run, ...existing].slice(0, STORE_LIMIT), null, 2), "utf-8");
  for (const draft of run.drafts || []) ingestQuotationDraftToFactLedger(draft);
}

function selectPackets(workspaceId: WorkspaceId, input: ProductQuotationDraftInput): SelectedPacket[] {
  const runs = listProspectingRuns(workspaceId, STORE_LIMIT);
  const candidateRuns = input.prospectingRunId
    ? runs.filter((run) => run.id === input.prospectingRunId)
    : runs;
  const selected: SelectedPacket[] = [];
  for (const run of candidateRuns) {
    for (const packet of run.packets || []) {
      if (input.prospectingPacketId && packet.id !== input.prospectingPacketId) continue;
      selected.push({ run, packet });
    }
  }
  return selected.slice(0, Math.max(1, Math.min(20, input.limit || DEFAULT_LIMIT)));
}

function buildDraft(
  workspaceId: WorkspaceId,
  packet: ProspectingPacket,
  worldFacts: SalesWorldFact[],
  createdAt: string,
  runIdempotencyKey: string
): PersonalizedSalesDraft {
  const evidence = packetEvidence(packet, worldFacts);
  if (isLowEvidence(packet)) {
    return buildInsufficientEvidenceDraft(workspaceId, packet, evidence, createdAt, runIdempotencyKey);
  }

  const productQueries = productQueriesFromPacket(packet, worldFacts);
  const priceReferences = priceReferencesFor(workspaceId, packet.candidate.companyName, productQueries);
  const recommendations = buildRecommendations(packet, productQueries, priceReferences, evidence);
  const lines = buildDraftLines(workspaceId, packet, recommendations, priceReferences);
  const missingInfoChecklist = unique([
    ...recommendations.flatMap((item) => item.missingInfo),
    ...lines.flatMap((line) => line.missingInfo),
    ...missingInfoForCandidate(packet.candidate),
  ]);
  const riskFlags = riskFlagsForDraft(packet, missingInfoChecklist, false);
  const costPriceMarginReferences = costPriceMarginRefs(priceReferences, lines);
  const assumptions = assumptionsFor(packet, priceReferences, lines);
  const evidenceRefs = evidenceRefsFor(evidence, recommendations, priceReferences);
  const confidence = draftConfidence(packet, recommendations, priceReferences);
  const recommendedHumanEdits = humanEditsFor(missingInfoChecklist, false);
  const quotationDraft: QuotationDraft = {
    id: `quotation-draft-${hashStable(`${packet.id}:${runIdempotencyKey}`).slice(0, 14)}`,
    status: "draft_only",
    quoteReady: false,
    lines,
    costPriceMarginReferences,
    assumptions,
    missingInfoChecklist,
    evidenceRefs,
    confidence,
    riskFlags,
    recommendedHumanEdits,
    dryRun: true,
    draftOnly: true,
    officialQuote: false,
    piGenerated: false,
    documentGenerated: false,
    sent: false,
  };

  return {
    workspaceId,
    prospectingPacketId: packet.id,
    candidate: packet.candidate,
    recommendedProducts: recommendations,
    fitReasons: unique(recommendations.flatMap((item) => item.fitReasons)),
    quotationDraftLines: lines,
    costPriceMarginReferences,
    assumptions,
    missingInfoChecklist,
    evidenceRefs,
    quotationDraft,
    confidence,
    riskFlags,
    recommendedHumanEdits,
    dryRun: true,
    draftOnly: true,
    officialQuote: false,
    piGenerated: false,
    documentGenerated: false,
    sent: false,
    createdAt,
    idempotencyKey: `${runIdempotencyKey}:${packet.id}`,
  };
}

function buildInsufficientEvidenceDraft(
  workspaceId: WorkspaceId,
  packet: ProspectingPacket,
  evidence: ProductFitEvidence[],
  createdAt: string,
  runIdempotencyKey: string
): PersonalizedSalesDraft {
  const missingInfoChecklist = unique([
    "product",
    "quantity",
    "specs",
    "destination",
    ...REQUIRED_QUOTE_FIELDS,
  ]);
  const riskFlags = riskFlagsForDraft(packet, missingInfoChecklist, true);
  const recommendedHumanEdits = humanEditsFor(missingInfoChecklist, true);
  const evidenceRefs = evidence.map((item) => item.label).filter(Boolean);
  const quotationDraft: QuotationDraft = {
    id: `quotation-draft-${hashStable(`${packet.id}:${runIdempotencyKey}:insufficient`).slice(0, 14)}`,
    status: "insufficient_evidence",
    quoteReady: false,
    lines: [],
    costPriceMarginReferences: ["No local cost / price / margin reference is safe to use until inquiry evidence is improved."],
    assumptions: ["Prospect identity, product interest, quantity, and destination are not sufficiently evidenced."],
    missingInfoChecklist,
    evidenceRefs,
    confidence: Math.min(0.4, packet.confidence),
    riskFlags,
    recommendedHumanEdits,
    dryRun: true,
    draftOnly: true,
    officialQuote: false,
    piGenerated: false,
    documentGenerated: false,
    sent: false,
  };

  return {
    workspaceId,
    prospectingPacketId: packet.id,
    candidate: packet.candidate,
    recommendedProducts: [],
    fitReasons: [],
    quotationDraftLines: [],
    costPriceMarginReferences: quotationDraft.costPriceMarginReferences,
    assumptions: quotationDraft.assumptions,
    missingInfoChecklist,
    evidenceRefs,
    quotationDraft,
    confidence: quotationDraft.confidence,
    riskFlags,
    recommendedHumanEdits,
    dryRun: true,
    draftOnly: true,
    officialQuote: false,
    piGenerated: false,
    documentGenerated: false,
    sent: false,
    createdAt,
    idempotencyKey: `${runIdempotencyKey}:${packet.id}`,
  };
}

function buildRecommendations(
  packet: ProspectingPacket,
  productQueries: string[],
  priceReferences: PriceReferenceWithRecord[],
  evidence: ProductFitEvidence[]
): ProductFitRecommendation[] {
  const byProduct = new Map<string, ProductFitRecommendation>();
  for (const item of priceReferences) {
    const product = item.record ? productLabel(item.record) : item.reference.product;
    const currentEvidence = [
      ...evidence.slice(0, 3),
      {
        kind: item.record?.piNo ? "historical_pi" : "price_memory",
        label: item.reference.source || "Local price memory",
        summary: `${item.reference.customer} ${item.reference.product} local price reference.`,
        confidence: Math.min(0.88, item.reference.confidence / 100),
        sourceId: item.reference.source,
      } satisfies ProductFitEvidence,
    ];
    byProduct.set(product, {
      product,
      fitReasons: unique([
        `Prospect profile mentions ${cleanText(packet.candidate.industry, "a relevant B2B buying context")}.`,
        "Local price memory contains a comparable product reference.",
        ...packet.icpScore.reasons.slice(0, 2),
      ]),
      evidence: currentEvidence,
      confidence: round(Math.min(0.86, Math.max(packet.confidence, item.reference.confidence / 100))),
      riskFlags: ["draft_only", "human_review_required"],
      missingInfo: missingInfoForProduct(product, item.record),
    });
  }

  if (byProduct.size === 0) {
    for (const product of productQueries.slice(0, 3)) {
      byProduct.set(product, {
        product,
        fitReasons: unique([
          `Prospect evidence suggests interest around ${product}.`,
          ...packet.icpScore.reasons.slice(0, 2),
        ]),
        evidence: evidence.slice(0, 4),
        confidence: round(Math.min(0.68, packet.confidence)),
        riskFlags: ["draft_only", "missing_price_reference", "human_review_required"],
        missingInfo: missingInfoForProduct(product),
      });
    }
  }

  return Array.from(byProduct.values());
}

function buildDraftLines(
  workspaceId: WorkspaceId,
  packet: ProspectingPacket,
  recommendations: ProductFitRecommendation[],
  priceReferences: PriceReferenceWithRecord[]
): QuotationDraftLine[] {
  if (recommendations.length === 0) return [];
  const byProduct = new Map(priceReferences.map((item) => [item.record ? productLabel(item.record) : item.reference.product, item]));
  return recommendations.map((recommendation, index) => {
    const ref = byProduct.get(recommendation.product);
    const record = ref?.record;
    const unitPrice = ref?.reference.unitPrice || record?.unitPrice || undefined;
    const unitCost = ref?.reference.unitCost || record?.unitCost || undefined;
    const margin = unitPrice !== undefined && unitCost !== undefined ? round(unitPrice - unitCost) : undefined;
    const marginPercent = unitPrice && margin !== undefined ? round((margin / unitPrice) * 100) : undefined;
    const line: QuotationDraftLine = {
      lineId: `quotation-line-${hashStable(`${workspaceId}:${packet.id}:${recommendation.product}:${index}`).slice(0, 12)}`,
      product: record?.product || recommendation.product,
      description: ref
        ? "Draft line based on local historical price memory; human must verify before formal quotation."
        : "Draft line inferred from prospecting evidence; human must add product and pricing details.",
      specification: record?.specification || productSpecFromLabel(recommendation.product),
      quantity: ref?.reference.quantity || record?.quantity || undefined,
      unitPrice,
      unitCost,
      currency: ref?.reference.currency || record?.currency || undefined,
      costCurrency: ref?.reference.costCurrency || record?.costCurrency || undefined,
      margin,
      marginPercent,
      supplier: ref?.reference.supplier || record?.supplier || undefined,
      supplierCandidates: ref?.reference.supplierCandidates || record?.supplierCandidates || [],
      hsCode: record?.hsCode || undefined,
      incoterms: record?.incoterms || undefined,
      priceReference: ref ? {
        kind: ref.reference.kind,
        customer: ref.reference.customer,
        source: ref.reference.source,
        date: ref.reference.date,
        confidence: ref.reference.confidence,
      } : undefined,
      missingInfo: [],
    };
    return {
      ...line,
      missingInfo: missingInfoForLine(line, packet.candidate),
    };
  });
}

function priceReferencesFor(workspaceId: WorkspaceId, customer: string, products: string[]): PriceReferenceWithRecord[] {
  if (products.length === 0) return [];
  const references = findPriceReferences(workspaceId, { customer, products });
  const rows = listPriceMemory(workspaceId);
  return [...references.customerPriceReferences, ...references.similarProductReferences]
    .slice(0, 5)
    .map((reference) => ({
      reference,
      record: rows.find((row) => row.piNo === reference.source && productLabel(row) === reference.product)
        || rows.find((row) => row.piNo === reference.source),
    }));
}

function packetEvidence(packet: ProspectingPacket, worldFacts: SalesWorldFact[]): ProductFitEvidence[] {
  const prospectingEvidence = packet.evidence.map((item) => ({
    kind: "prospecting_evidence" as const,
    label: item.label,
    summary: item.summary,
    confidence: item.confidence,
    sourceId: item.source.sourceId,
    sourceUrl: item.sourceUrl,
  }));
  const candidateName = packet.candidate.companyName.toLowerCase();
  const worldEvidence = worldFacts
    .filter((fact) => {
      const text = `${fact.customerName || ""} ${fact.subject} ${fact.summary}`.toLowerCase();
      return candidateName && text.includes(candidateName);
    })
    .slice(0, 3)
    .map((fact) => ({
      kind: factKind(fact),
      label: fact.type,
      summary: fact.summary,
      confidence: fact.confidence,
      sourceId: fact.id,
    }));
  return [...prospectingEvidence, ...worldEvidence];
}

function factKind(fact: SalesWorldFact): ProductFitEvidenceKind {
  if (fact.type === "customer.intelligence") return "company_intel";
  if (fact.type === "memory.record") return "customer_memory";
  if (fact.type === "quotation") return "historical_quote";
  if (fact.type === "pi.order") return "historical_pi";
  return "sales_world_fact";
}

function productQueriesFromPacket(packet: ProspectingPacket, worldFacts: SalesWorldFact[]): string[] {
  const text = [
    packet.candidate.companyName,
    packet.candidate.industry,
    packet.openingAngle.headline,
    packet.openingAngle.rationale,
    ...packet.evidence.map((item) => item.summary),
    ...worldFacts
      .filter((fact) => ["workspace", "customer.intelligence", "quotation", "pi.order", "memory.record"].includes(fact.type))
      .slice(0, 20)
      .map((fact) => `${fact.subject} ${fact.summary}`),
  ].join(" ");
  const lower = text.toLowerCase();
  const products: string[] = [];
  if (/pump|municipal water|transfer/.test(lower)) products.push("industrial pump", "transfer pump");
  if (/cable|usb|wire/.test(lower)) products.push("cable");
  if (/adapter|connector/.test(lower)) products.push("adapter");
  if (/valve/.test(lower)) products.push("valve");
  if (/motor/.test(lower)) products.push("motor");
  if (/solar|panel|inverter/.test(lower)) products.push("solar product");
  if (/led|lighting/.test(lower)) products.push("LED lighting");
  const industry = cleanText(packet.candidate.industry);
  if (products.length === 0 && industry) products.push(industry.replace(/\b(distribution|distributor|import|imports|buyer|buyers)\b/gi, "").trim() || industry);
  return unique(products.map((item) => item.trim()).filter((item) => item.length >= 3));
}

function readWorldFacts(runtime: RuntimeForProductQuotation, workspaceId: WorkspaceId): SalesWorldFact[] {
  if (!runtime.getSalesWorldModel) return [];
  try {
    return runtime.getSalesWorldModel(workspaceId).facts || [];
  } catch {
    return [];
  }
}

function isLowEvidence(packet: ProspectingPacket): boolean {
  return packet.confidence <= 0.45
    || packet.riskFlags.includes("insufficient_evidence")
    || packet.evidence.some((item) => item.kind === "insufficient_evidence");
}

function riskFlagsForDraft(packet: ProspectingPacket, missingInfo: string[], insufficient: boolean): string[] {
  return unique([
    "draft_only",
    "not_sent",
    "no_document_generated",
    "human_review_required",
    "not_ready_for_quotation",
    insufficient ? "insufficient_evidence" : "",
    insufficient ? "missing_inquiry_info" : "",
    missingInfo.length > 0 ? "missing_info" : "",
    ...packet.riskFlags,
  ].filter(Boolean));
}

function missingInfoForProduct(product: string, record?: PriceMemoryRecord): string[] {
  return unique([
    product ? "" : "product",
    record?.unitCost ? "" : "cost",
    "MOQ",
    record?.supplier || record?.supplierCandidates?.length ? "" : "supplier",
    "lead time",
    record?.hsCode ? "" : "HS code",
    "packaging",
    record?.currency ? "" : "currency",
    record?.incoterms ? "" : "Incoterms",
    "freight",
    "payment terms",
  ].filter(Boolean));
}

function missingInfoForLine(line: QuotationDraftLine, candidate: ProspectingCandidate): string[] {
  return unique([
    line.product ? "" : "product",
    line.unitCost !== undefined && line.unitCost > 0 ? "" : "cost",
    "MOQ",
    line.supplier || line.supplierCandidates.length ? "" : "supplier",
    "lead time",
    line.hsCode ? "" : "HS code",
    "packaging",
    line.currency ? "" : "currency",
    line.incoterms ? "" : "Incoterms",
    "freight",
    "payment terms",
    line.quantity ? "" : "quantity",
    candidate.country ? "" : "destination",
    line.specification ? "" : "specs",
  ].filter(Boolean));
}

function missingInfoForCandidate(candidate: ProspectingCandidate): string[] {
  return [candidate.country ? "" : "destination"].filter(Boolean);
}

function costPriceMarginRefs(priceReferences: PriceReferenceWithRecord[], lines: QuotationDraftLine[]): string[] {
  const refs = lines
    .filter((line) => line.priceReference)
    .map((line) => {
      const price = money(line.unitPrice, line.currency);
      const cost = money(line.unitCost, line.costCurrency || line.currency);
      const margin = line.marginPercent !== undefined ? `${line.marginPercent}% margin` : "margin unknown";
      return `${line.priceReference?.source}: ${price} price / ${cost} cost / ${margin}`;
    });
  if (refs.length > 0) return refs;
  if (priceReferences.length === 0) return ["No matching local price memory or historical quotation reference found."];
  return priceReferences.map((item) => `${item.reference.source}: local price reference requires human review.`);
}

function assumptionsFor(
  packet: ProspectingPacket,
  priceReferences: PriceReferenceWithRecord[],
  lines: QuotationDraftLine[]
): string[] {
  return unique([
    "This is a draft-only internal quotation workspace, not a formal offer.",
    priceReferences.length > 0 ? "Quantity and price were copied from local historical references for review." : "Product interest is inferred from prospecting evidence, not an RFQ.",
    packet.candidate.country ? `Destination assumed from candidate country: ${packet.candidate.country}.` : "Destination must be confirmed before quoting.",
    lines.some((line) => line.incoterms) ? "Incoterms copied from local reference and must be confirmed." : "Incoterms are not confirmed.",
  ]);
}

function evidenceRefsFor(
  evidence: ProductFitEvidence[],
  recommendations: ProductFitRecommendation[],
  priceReferences: PriceReferenceWithRecord[]
): string[] {
  return unique([
    ...evidence.map((item) => item.sourceUrl ? `${item.label}: ${item.sourceUrl}` : item.label),
    ...recommendations.flatMap((item) => item.evidence.map((evidenceItem) => evidenceItem.label)),
    ...priceReferences.map((item) => item.reference.source),
  ].filter(Boolean));
}

function humanEditsFor(missingInfo: string[], insufficient: boolean): string[] {
  if (insufficient) {
    return [
      "Add reliable prospect evidence before preparing any quote.",
      "Confirm inquiry product, quantity, specifications, destination, and buyer role.",
      "Keep the result internal until a human reviews the prospecting packet.",
    ];
  }
  return unique([
    "Confirm requested quantity before quoting.",
    "Confirm product specification, destination, Incoterms, freight, and payment terms.",
    missingInfo.includes("cost") ? "Add verified cost before calculating margin." : "",
    missingInfo.includes("MOQ") ? "Add MOQ and lead time from supplier before using this draft." : "",
    "Review price and margin manually; this draft did not generate a formal quotation or PI.",
  ].filter(Boolean));
}

function draftConfidence(
  packet: ProspectingPacket,
  recommendations: ProductFitRecommendation[],
  priceReferences: PriceReferenceWithRecord[]
): number {
  const productConfidence = recommendations.length
    ? recommendations.reduce((sum, item) => sum + item.confidence, 0) / recommendations.length
    : 0.3;
  const priceBoost = priceReferences.length > 0 ? 0.08 : -0.08;
  return round(Math.max(0.25, Math.min(0.86, ((packet.confidence + productConfidence) / 2) + priceBoost)));
}

function makeRunIdempotencyKey(workspaceId: WorkspaceId, input: ProductQuotationDraftInput): string {
  const explicit = cleanText(input.idempotencyKey);
  if (explicit) return explicit;
  return [
    workspaceId,
    "quotation-draft",
    input.prospectingRunId || "latest-run",
    input.prospectingPacketId || "packets",
    input.limit || DEFAULT_LIMIT,
  ].join(":");
}

function productLabel(record: PriceMemoryRecord): string {
  return [record.product, record.specification].filter(Boolean).join(" / ") || record.model || "Product";
}

function productSpecFromLabel(value: string): string {
  const parts = value.split("/").map((item) => item.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" / ") : "";
}

function money(value?: number, currency = "USD"): string {
  return value === undefined ? "unknown" : `${currency || "USD"} ${value}`;
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
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

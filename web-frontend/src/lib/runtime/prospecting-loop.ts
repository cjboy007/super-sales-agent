import crypto from "crypto";
import fs from "fs";
import type { SalesWorldFact, SalesWorldModel } from "./sales-world-model";
import type { WorkspaceId } from "./types";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";

export type ProspectingLeadSourceKind =
  | "operator_seed"
  | "sales_world_model"
  | "local_workspace"
  | "mock_fallback";

export type ProspectingSourceReliability = "verified" | "local" | "mock" | "insufficient";

export interface ProspectingLeadSource {
  kind: ProspectingLeadSourceKind;
  label: string;
  reliability: ProspectingSourceReliability;
  sourceId?: string;
}

export type ProspectingEvidenceKind =
  | "source_url"
  | "operator_note"
  | "workspace_fact"
  | "company_profile"
  | "insufficient_evidence";

export interface ProspectingEvidence {
  kind: ProspectingEvidenceKind;
  label: string;
  summary: string;
  confidence: number;
  sourceUrl?: string;
  source: ProspectingLeadSource;
}

export interface ProspectingCandidate {
  companyName: string;
  website?: string;
  country?: string;
  industry?: string;
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
}

export interface IcpScore {
  score: number;
  band: "low" | "medium" | "high";
  reasons: string[];
}

export interface OpeningAngle {
  headline: string;
  rationale: string;
  confidence: number;
  draftOnly: true;
}

export interface ProspectingPacket {
  id: string;
  workspaceId: WorkspaceId;
  candidate: ProspectingCandidate;
  source: ProspectingLeadSource;
  evidence: ProspectingEvidence[];
  confidence: number;
  icpScore: IcpScore;
  openingAngle: OpeningAngle;
  riskFlags: string[];
  recommendedNextStep: string;
  dryRun: true;
  createdAt: string;
  idempotencyKey: string;
}

export interface ProspectingRun {
  id: string;
  workspaceId: WorkspaceId;
  dryRun: true;
  draftOnly: true;
  status: "completed";
  sourceSummary: string;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  packets: ProspectingPacket[];
}

export interface ProspectingSeedInput {
  companyName?: unknown;
  website?: unknown;
  country?: unknown;
  industry?: unknown;
  contactName?: unknown;
  contactRole?: unknown;
  contactEmail?: unknown;
  sourceUrl?: unknown;
  notes?: unknown;
}

export interface ProspectingDryRunInput {
  workspaceId: WorkspaceId;
  seeds?: ProspectingSeedInput[];
  limit?: number;
  idempotencyKey?: string;
}

type RuntimeForProspecting = {
  getSalesWorldModel?(workspaceId: WorkspaceId): SalesWorldModel;
};

interface DiscoveredCandidate {
  candidate: ProspectingCandidate;
  source: ProspectingLeadSource;
  evidence: ProspectingEvidence[];
  seedKey: string;
}

const STORE_LIMIT = 100;

function storePath(workspaceId: WorkspaceId): string {
  return ensureSsaCompanyDataPath(workspaceId, "growth", "prospecting-runs.json");
}

export function listProspectingRuns(workspaceId: WorkspaceId, limit = 20): ProspectingRun[] {
  return readJsonFile<ProspectingRun[]>(storePath(workspaceId), [])
    .filter((run) => run.workspaceId === workspaceId && run.dryRun === true)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, limit));
}

export function runProspectingDryRun(
  runtime: RuntimeForProspecting,
  input: ProspectingDryRunInput
): ProspectingRun {
  const workspaceId = cleanText(input.workspaceId, "demo-exporter");
  const idempotencyKey = makeRunIdempotencyKey(workspaceId, input);
  const existing = listProspectingRuns(workspaceId, STORE_LIMIT).find((run) => run.idempotencyKey === idempotencyKey);
  if (existing) return existing;

  const now = new Date().toISOString();
  const discovered = discoverCandidates(runtime, workspaceId, input).slice(0, input.limit || 8);
  const packets = discovered.map((item) => buildPacket(workspaceId, item, now));
  const run: ProspectingRun = {
    id: `prospecting-run-${hashStable(idempotencyKey).slice(0, 14)}`,
    workspaceId,
    dryRun: true,
    draftOnly: true,
    status: "completed",
    sourceSummary: sourceSummary(discovered),
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
    packets,
  };

  writeRun(workspaceId, run);
  return run;
}

function writeRun(workspaceId: WorkspaceId, run: ProspectingRun) {
  const existing = listProspectingRuns(workspaceId, STORE_LIMIT)
    .filter((item) => item.idempotencyKey !== run.idempotencyKey);
  fs.writeFileSync(storePath(workspaceId), JSON.stringify([run, ...existing].slice(0, STORE_LIMIT), null, 2), "utf-8");
}

function discoverCandidates(
  runtime: RuntimeForProspecting,
  workspaceId: WorkspaceId,
  input: ProspectingDryRunInput
): DiscoveredCandidate[] {
  const seedCandidates = (input.seeds || [])
    .map((seed, index) => candidateFromSeed(workspaceId, seed, index))
    .filter((candidate): candidate is DiscoveredCandidate => Boolean(candidate));
  if (seedCandidates.length > 0) return seedCandidates;

  const modelCandidates = candidatesFromWorldModel(runtime, workspaceId);
  if (modelCandidates.length > 0) return modelCandidates;

  return [insufficientCandidate(workspaceId)];
}

function candidateFromSeed(
  workspaceId: WorkspaceId,
  seed: ProspectingSeedInput,
  index: number
): DiscoveredCandidate | null {
  const companyName = cleanText(seed.companyName);
  if (!companyName) return null;
  const source: ProspectingLeadSource = {
    kind: "operator_seed",
    label: "Operator seed",
    reliability: "local",
    sourceId: `${workspaceId}:seed:${index}`,
  };
  const candidate: ProspectingCandidate = {
    companyName,
    website: cleanUrl(seed.website),
    country: cleanText(seed.country),
    industry: cleanText(seed.industry),
    contactName: cleanText(seed.contactName),
    contactRole: cleanText(seed.contactRole),
    contactEmail: cleanEmail(seed.contactEmail),
  };
  const evidence: ProspectingEvidence[] = [];
  const sourceUrl = cleanUrl(seed.sourceUrl);
  if (sourceUrl) {
    evidence.push({
      kind: "source_url",
      label: "Source URL",
      summary: `Seed supplied a public source for ${companyName}.`,
      confidence: 0.74,
      sourceUrl,
      source,
    });
  }
  if (cleanText(seed.notes)) {
    evidence.push({
      kind: "operator_note",
      label: "Operator note",
      summary: cleanText(seed.notes).slice(0, 220),
      confidence: 0.68,
      source,
    });
  }
  if (candidate.website || candidate.industry || candidate.contactEmail) {
    evidence.push({
      kind: "company_profile",
      label: "Seed profile",
      summary: [candidate.industry, candidate.country, candidate.website].filter(Boolean).join(" | ") || companyName,
      confidence: 0.62,
      source,
    });
  }
  if (evidence.length === 0) evidence.push(insufficientEvidence(companyName, source));

  return {
    candidate,
    source,
    evidence,
    seedKey: stablePart(`${companyName}:${candidate.website || ""}:${candidate.contactEmail || ""}`),
  };
}

function candidatesFromWorldModel(runtime: RuntimeForProspecting, workspaceId: WorkspaceId): DiscoveredCandidate[] {
  if (!runtime.getSalesWorldModel) return [];
  let model: SalesWorldModel;
  try {
    model = runtime.getSalesWorldModel(workspaceId);
  } catch {
    return [];
  }
  return model.facts
    .filter((fact) => fact.type === "customer.account")
    .slice(0, 8)
    .map((fact) => candidateFromFact(workspaceId, fact));
}

function candidateFromFact(workspaceId: WorkspaceId, fact: SalesWorldFact): DiscoveredCandidate {
  const source: ProspectingLeadSource = {
    kind: "sales_world_model",
    label: "Sales world model",
    reliability: fact.confidence >= 0.75 ? "local" : "insufficient",
    sourceId: fact.id,
  };
  const candidate: ProspectingCandidate = {
    companyName: cleanText(fact.customerName, fact.subject),
    website: cleanUrl(fact.data.website),
    country: cleanText(fact.data.country),
    industry: cleanText(fact.data.industry),
  };
  return {
    candidate,
    source,
    evidence: [{
      kind: "workspace_fact",
      label: "Workspace fact",
      summary: cleanText(fact.summary, "Existing workspace customer fact."),
      confidence: fact.confidence,
      source,
    }],
    seedKey: stablePart(fact.idempotencyKey || fact.id),
  };
}

function insufficientCandidate(workspaceId: WorkspaceId): DiscoveredCandidate {
  const source: ProspectingLeadSource = {
    kind: "local_workspace",
    label: "Workspace data check",
    reliability: "insufficient",
    sourceId: `${workspaceId}:no-source-data`,
  };
  const candidate = {
    companyName: "Evidence Needed Prospect",
  };
  return {
    candidate,
    source,
    evidence: [insufficientEvidence(candidate.companyName, source)],
    seedKey: "evidence-needed",
  };
}

function buildPacket(workspaceId: WorkspaceId, item: DiscoveredCandidate, createdAt: string): ProspectingPacket {
  const confidence = packetConfidence(item.evidence);
  const icpScore = scoreCandidate(item.candidate, item.evidence, confidence);
  const riskFlags = riskFlagsFor(item, confidence);
  return {
    id: `prospecting-packet-${hashStable(`${workspaceId}:${item.seedKey}`).slice(0, 14)}`,
    workspaceId,
    candidate: item.candidate,
    source: item.source,
    evidence: item.evidence,
    confidence,
    icpScore,
    openingAngle: openingAngleFor(item.candidate, icpScore, confidence),
    riskFlags,
    recommendedNextStep: nextStepFor(riskFlags),
    dryRun: true,
    createdAt,
    idempotencyKey: `${workspaceId}:prospecting:${item.seedKey}`,
  };
}

function scoreCandidate(candidate: ProspectingCandidate, evidence: ProspectingEvidence[], confidence: number): IcpScore {
  const reasons: string[] = [];
  let score = 30;
  const industry = `${candidate.industry || ""} ${candidate.companyName}`.toLowerCase();
  if (/pump|industrial|manufactur|distributor|water|municipal|import/.test(industry)) {
    score += 32;
    reasons.push("Industry or company profile matches industrial B2B sales.");
  }
  if (candidate.website) {
    score += 12;
    reasons.push("Website is available for human verification.");
  }
  if (candidate.contactEmail || candidate.contactName) {
    score += 10;
    reasons.push("A contact signal exists for review.");
  }
  if (evidence.some((item) => item.kind === "source_url")) {
    score += 8;
    reasons.push("A source URL is attached.");
  }
  if (confidence <= 0.45) {
    score = Math.min(score, 35);
    reasons.push("Evidence is insufficient; keep this out of outbound workflows.");
  }
  const bounded = Math.max(0, Math.min(100, score));
  return {
    score: bounded,
    band: bounded >= 70 ? "high" : bounded >= 45 ? "medium" : "low",
    reasons: reasons.length ? reasons : ["Not enough source data to score strongly."],
  };
}

function openingAngleFor(candidate: ProspectingCandidate, icpScore: IcpScore, confidence: number): OpeningAngle {
  const companyName = cleanText(candidate.companyName, "this account");
  if (confidence <= 0.45) {
    return {
      headline: `${companyName}: evidence needed`,
      rationale: "Collect a reliable source, website, industry signal, or contact before drafting outreach.",
      confidence,
      draftOnly: true,
    };
  }
  const industry = cleanText(candidate.industry, "their current sourcing workflow");
  return {
    headline: `${companyName}: ${icpScore.band} ICP fit`,
    rationale: `Open around ${industry}, supply reliability, and a narrow product-fit question for manual review.`,
    confidence: Math.min(0.82, confidence),
    draftOnly: true,
  };
}

function packetConfidence(evidence: ProspectingEvidence[]): number {
  if (!evidence.length) return 0.25;
  const average = evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length;
  return round(Math.max(0.2, Math.min(0.88, average)));
}

function riskFlagsFor(item: DiscoveredCandidate, confidence: number): string[] {
  const flags = ["dry_run_only", "draft_only", "no_outbound_sent"];
  if (confidence <= 0.45 || item.evidence.some((evidence) => evidence.kind === "insufficient_evidence")) {
    flags.push("insufficient_evidence", "not_ready_for_outbound");
  }
  if (item.source.reliability === "mock") flags.push("mock_source");
  if (!item.candidate.website) flags.push("missing_website");
  return Array.from(new Set(flags));
}

function nextStepFor(riskFlags: string[]): string {
  if (riskFlags.includes("insufficient_evidence")) {
    return "Add reliable evidence before creating any outreach draft.";
  }
  return "Review the packet, evidence, and ICP score before moving to any draft-only asset work.";
}

function insufficientEvidence(companyName: string, source: ProspectingLeadSource): ProspectingEvidence {
  return {
    kind: "insufficient_evidence",
    label: "Insufficient evidence",
    summary: `${companyName} needs a reliable source before any outbound step.`,
    confidence: 0.28,
    source,
  };
}

function makeRunIdempotencyKey(workspaceId: WorkspaceId, input: ProspectingDryRunInput): string {
  const explicit = cleanText(input.idempotencyKey);
  if (explicit) return explicit;
  const seedSignature = JSON.stringify((input.seeds || []).map((seed) => ({
    companyName: cleanText(seed.companyName).toLowerCase(),
    website: cleanUrl(seed.website),
    sourceUrl: cleanUrl(seed.sourceUrl),
  })));
  return `${workspaceId}:prospecting-run:${hashStable(seedSignature || "workspace-model")}`;
}

function sourceSummary(candidates: DiscoveredCandidate[]): string {
  if (!candidates.length) return "No candidates";
  const local = candidates.filter((candidate) => candidate.source.reliability === "local").length;
  const insufficient = candidates.filter((candidate) => candidate.source.reliability === "insufficient").length;
  return `${candidates.length} candidate(s), ${local} local source(s), ${insufficient} insufficient source(s)`;
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return sanitizeText(value).trim() || fallback;
}

function cleanUrl(value: unknown): string {
  const raw = cleanText(value);
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw.replace(/[<>"'`]/g, "").slice(0, 220);
}

function cleanEmail(value: unknown): string {
  const raw = cleanText(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return "";
  return raw.slice(0, 160);
}

function sanitizeText(value: string): string {
  return value
    .replace(/\/Users\/[^\s"'`]+/g, "local runtime")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "local runtime")
    .replace(/\.ssa[^\s"'`]*/g, "runtime data")
    .replace(/\bSSA_[A-Z0-9_]+(?:=true)?\b/g, "explicit enablement")
    .replace(/\b(secret|token|password|api key|payload)\b/gi, "sensitive value")
    .slice(0, 260);
}

function stablePart(value: unknown): string {
  return cleanText(String(value || "unknown"), "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown";
}

function hashStable(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

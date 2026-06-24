import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { ensureDir, ensureSsaDataPath } from "../ssa-data-paths";
import {
  enforceSalesToolForSideEffect,
  listSideEffectSalesTools,
  type SalesToolDefinition,
  type SalesToolEnforcementResult,
} from "./sales-tool-registry";
import type { SideEffectKind } from "./types";

export type SkillStatus = "draft" | "pending" | "disabled" | "beta" | "stable" | "deprecated";

export interface SkillKernelMetadata {
  name: string;
  description: string;
  version: string;
  tags: string[];
  category: string;
  inputs: string[];
  outputs: string[];
  sideEffects: SideEffectKind[];
  permissions: string[];
  entrypoints: Record<string, string>;
  tests: Record<string, string>;
  status: SkillStatus;
  platforms?: string[];
  sourcePath?: string;
}

export interface ParsedSkillMarkdown {
  frontmatter: Record<string, unknown>;
  metadata: SkillKernelMetadata;
  body: string;
}

export interface SkillFrontmatterValidation {
  valid: boolean;
  errors: string[];
}

export interface IndexSkillMarkdownInput {
  markdown: string;
  sourcePath: string;
  enabled?: boolean;
  generated?: boolean;
}

export interface IndexSkillMarkdownResult {
  indexed: boolean;
  metadata: SkillKernelMetadata;
  validation: SkillFrontmatterValidation;
}

export interface IndexedSkillSummary extends SkillKernelMetadata {
  enabled: boolean;
  generated: boolean;
  updatedAt: string;
}

export interface SkillMatchInput {
  query?: string;
  tags?: string[];
  category?: string;
  sideEffects?: SideEffectKind[];
  permissions?: string[];
  includePending?: boolean;
  includeDisabled?: boolean;
  limit?: number;
}

export interface SkillMatchResult extends IndexedSkillSummary {
  score: number;
  matchedBy: string[];
}

export interface LoadedSkillBody {
  name: string;
  sourcePath: string;
  body: string;
  metadata: SkillKernelMetadata;
}

export type SkillLearnSourceKind = "pasted_procedure" | "workflow_summary" | "local_path" | "url";

export type SkillLearnSourceInput =
  | { kind: "pasted_procedure"; text: string }
  | { kind: "workflow_summary"; summary: string }
  | { kind: "local_path"; path: string }
  | { kind: "url"; url: string };

export interface GatheredSkillLearnSource {
  sourceKind: SkillLearnSourceKind;
  sourceText: string;
  sourceRef?: string;
}

export interface SkillLearnGatherOptions {
  fetchText?: (url: string) => Promise<string>;
}

export interface CreateSkillLearnProposalInput {
  name: string;
  description: string;
  sourceKind: SkillLearnSourceKind;
  sourceText: string;
  tags: string[];
  category: string;
  inputs: string[];
  outputs: string[];
  sideEffects: SideEffectKind[];
  permissions: string[];
  suggestedEntryPoint: string;
  suggestedTest: string;
}

export interface CreateSkillLearnProposalFromSourceInput extends Omit<CreateSkillLearnProposalInput, "sourceKind" | "sourceText"> {
  source: SkillLearnSourceInput;
}

export interface SkillLearnProposalReview {
  id: string;
  name: string;
  status: "pending";
  enabled: false;
  generated: true;
  sourceKind: SkillLearnSourceKind;
  sourceSummary: string;
  validationErrors: string[];
  suggestedVerification: string[];
  createdAt: string;
}

export interface SkillLearnProposal {
  markdown: string;
  metadata: SkillKernelMetadata;
  validation: SkillFrontmatterValidation;
  review: SkillLearnProposalReview;
}

export interface ApproveSkillProposalInput {
  proposalId: string;
  approvedBy: string;
  approvalNote: string;
}

export interface ApproveSkillProposalResult {
  approved: boolean;
  proposalId: string;
  skill: IndexedSkillSummary | null;
}

export interface CreateSkillPatchProposalInput {
  skillName: string;
  sourceKind: SkillLearnSourceKind;
  sourceText: string;
  appendMarkdown: string;
  proposedBy: string;
  suggestedTest: string;
}

export interface SkillPatchProposalReview {
  id: string;
  skillName: string;
  status: "pending";
  sourceKind: SkillLearnSourceKind;
  sourceSummary: string;
  proposedBy: string;
  suggestedVerification: string[];
  createdAt: string;
}

export interface SkillPatchProposal {
  proposedMarkdown: string;
  review: SkillPatchProposalReview;
}

export interface ApproveSkillPatchProposalInput {
  proposalId: string;
  approvedBy: string;
  approvalNote: string;
}

export interface ApproveSkillPatchProposalResult {
  approved: boolean;
  proposalId: string;
  skill: IndexedSkillSummary | null;
}

export interface EnforceSkillSideEffectInput {
  skillName: string;
  sideEffectKind: SideEffectKind;
  workspaceId: string;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  toolId?: string;
}

export interface ReindexInvalidSkill {
  sourcePath: string;
  errors: string[];
}

export interface ReindexSkillsResult {
  scanned: number;
  indexed: number;
  invalid: ReindexInvalidSkill[];
  updatedAt: string;
}

interface SkillIndexRow {
  name: string;
  description: string;
  version: string;
  tags_json: string;
  category: string;
  inputs_json: string;
  outputs_json: string;
  side_effects_json: string;
  permissions_json: string;
  entrypoints_json: string;
  tests_json: string;
  status: SkillStatus;
  platforms_json: string | null;
  source_path: string | null;
  body_excerpt: string | null;
  enabled: number;
  generated: number;
  updated_at: string;
  rank?: number | null;
}

interface SkillLearnProposalRow {
  id: string;
  name: string;
  markdown: string;
  status: string;
}

interface SkillPatchProposalRow {
  id: string;
  skill_name: string;
  source_path: string;
  proposed_markdown: string;
  status: string;
}

const SQLITE_TIMEOUT_MS = 5000;
const DEFAULT_LIMIT = 8;

const VALID_STATUSES = new Set<SkillStatus>(["draft", "pending", "disabled", "beta", "stable", "deprecated"]);

const VALID_SIDE_EFFECTS = new Set<SideEffectKind>([
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
]);

const initializedDbPaths = new Set<string>();

function nowIso(): string {
  return new Date().toISOString();
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function literal(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${escapeSql(value)}'`;
}

function jsonLiteral(value: unknown): string {
  return literal(JSON.stringify(value ?? null));
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return asStringRecord(parsed);
  } catch {
    return {};
  }
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(50, Math.max(1, Math.floor(limit as number)));
}

function normalizeText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function bodyExcerpt(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 1600);
}

function slug(value: string): string {
  return String(value || "skill")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "skill";
}

function yamlArray(values: string[]): string {
  return `[${values.map((value) => String(value).replace(/"/g, '\\"')).join(", ")}]`;
}

function compact(value: string, max = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, Math.max(0, max - 3))}...` : normalized;
}

function ftsQuery(query: string): string {
  return query
    .split(/\s+/)
    .map((term) => term.replace(/[^a-zA-Z0-9_.@-]/g, "").trim())
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" OR ");
}

function execSql(sql: string, dbPath = skillIndexDbPath()): void {
  ensureInitialized(dbPath);
  execFileSync("sqlite3", ["-batch", dbPath, sql], {
    encoding: "utf-8",
    timeout: SQLITE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function querySql<T>(sql: string, dbPath = skillIndexDbPath()): T[] {
  ensureInitialized(dbPath);
  const output = execFileSync("sqlite3", ["-batch", "-json", dbPath, sql], {
    encoding: "utf-8",
    timeout: SQLITE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!output) return [];
  return JSON.parse(output) as T[];
}

function ensureInitialized(dbPath = skillIndexDbPath()): void {
  if (initializedDbPaths.has(dbPath)) return;
  ensureDir(path.dirname(dbPath));
  execFileSync("sqlite3", ["-batch", dbPath, `
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS skill_index (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      version TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      category TEXT NOT NULL,
      inputs_json TEXT NOT NULL,
      outputs_json TEXT NOT NULL,
      side_effects_json TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      entrypoints_json TEXT NOT NULL,
      tests_json TEXT NOT NULL,
      status TEXT NOT NULL,
      platforms_json TEXT,
      source_path TEXT,
      body_excerpt TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      generated INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS skill_index_fts USING fts5(
      name UNINDEXED,
      description,
      tags,
      category,
      side_effects,
      permissions,
      body_excerpt,
      content='skill_index',
      content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS skill_index_ai AFTER INSERT ON skill_index BEGIN
      INSERT INTO skill_index_fts(rowid, name, description, tags, category, side_effects, permissions, body_excerpt)
      VALUES (
        new.rowid,
        new.name,
        new.description,
        new.tags_json,
        new.category,
        new.side_effects_json,
        new.permissions_json,
        new.body_excerpt
      );
    END;
    CREATE TRIGGER IF NOT EXISTS skill_index_ad AFTER DELETE ON skill_index BEGIN
      INSERT INTO skill_index_fts(skill_index_fts, rowid, name, description, tags, category, side_effects, permissions, body_excerpt)
      VALUES (
        'delete',
        old.rowid,
        old.name,
        old.description,
        old.tags_json,
        old.category,
        old.side_effects_json,
        old.permissions_json,
        old.body_excerpt
      );
    END;
    CREATE TRIGGER IF NOT EXISTS skill_index_au AFTER UPDATE ON skill_index BEGIN
      INSERT INTO skill_index_fts(skill_index_fts, rowid, name, description, tags, category, side_effects, permissions, body_excerpt)
      VALUES (
        'delete',
        old.rowid,
        old.name,
        old.description,
        old.tags_json,
        old.category,
        old.side_effects_json,
        old.permissions_json,
        old.body_excerpt
      );
      INSERT INTO skill_index_fts(rowid, name, description, tags, category, side_effects, permissions, body_excerpt)
      VALUES (
        new.rowid,
        new.name,
        new.description,
        new.tags_json,
        new.category,
        new.side_effects_json,
        new.permissions_json,
        new.body_excerpt
      );
    END;
    CREATE INDEX IF NOT EXISTS idx_skill_index_status ON skill_index(status, enabled);
    CREATE INDEX IF NOT EXISTS idx_skill_index_category ON skill_index(category);
    CREATE TABLE IF NOT EXISTS skill_learn_proposals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_summary TEXT NOT NULL,
      markdown TEXT NOT NULL,
      validation_errors_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      approved_by TEXT,
      approval_note TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skill_patch_proposals (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_summary TEXT NOT NULL,
      proposed_markdown TEXT NOT NULL,
      proposed_by TEXT NOT NULL,
      suggested_test TEXT NOT NULL,
      status TEXT NOT NULL,
      approved_by TEXT,
      approval_note TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL
    );
  `], {
    encoding: "utf-8",
    timeout: SQLITE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const statement of [
    "ALTER TABLE skill_learn_proposals ADD COLUMN approved_by TEXT;",
    "ALTER TABLE skill_learn_proposals ADD COLUMN approval_note TEXT;",
    "ALTER TABLE skill_learn_proposals ADD COLUMN approved_at TEXT;",
  ]) {
    try {
      execFileSync("sqlite3", ["-batch", dbPath, statement], {
        encoding: "utf-8",
        timeout: SQLITE_TIMEOUT_MS,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      // SQLite has no ADD COLUMN IF NOT EXISTS; duplicate-column errors mean the schema is already migrated.
    }
  }
  initializedDbPaths.add(dbPath);
}

export function skillIndexDbPath(): string {
  return ensureSsaDataPath("runtime", "ssa-skill-kernel.db");
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseScalar(item) as string);
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  return trimmed;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key.trim(), String(item || "").trim()])
      .filter(([key, item]) => key && item)
  );
}

function parseYamlFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let currentKey = "";

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const listMatch = line.match(/^\s+-\s*(.+)$/);
    if (listMatch && currentKey) {
      const existing = Array.isArray(result[currentKey]) ? result[currentKey] as unknown[] : [];
      result[currentKey] = [...existing, parseScalar(listMatch[1])];
      continue;
    }

    const childMatch = line.match(/^\s{2,}([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (childMatch && currentKey) {
      const existing = result[currentKey] && typeof result[currentKey] === "object" && !Array.isArray(result[currentKey])
        ? result[currentKey] as Record<string, unknown>
        : {};
      result[currentKey] = {
        ...existing,
        [childMatch[1]]: parseScalar(childMatch[2]),
      };
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match) continue;
    currentKey = match[1];
    result[currentKey] = match[2] ? parseScalar(match[2]) : {};
  }

  return result;
}

function requiredString(frontmatter: Record<string, unknown>, key: string, errors: string[]): string {
  const value = typeof frontmatter[key] === "string" ? (frontmatter[key] as string).trim() : "";
  if (!value) errors.push(`${key} is required`);
  return value;
}

function requiredArray(frontmatter: Record<string, unknown>, key: string, errors: string[], allowEmpty = false): string[] {
  if (frontmatter[key] === undefined || frontmatter[key] === null) {
    errors.push(allowEmpty ? `${key} must be an array` : `${key} must contain at least one item`);
    return [];
  }
  if (!Array.isArray(frontmatter[key])) {
    errors.push(`${key} must be an array`);
    return [];
  }
  const values = asStringArray(frontmatter[key]);
  if (!allowEmpty && values.length === 0) errors.push(`${key} must contain at least one item`);
  return values;
}

function requiredRecord(frontmatter: Record<string, unknown>, key: string, errors: string[]): Record<string, string> {
  const record = asStringRecord(frontmatter[key]);
  if (Object.keys(record).length === 0) errors.push(`${key} must define at least one entry`);
  return record;
}

function normalizeMetadata(frontmatter: Record<string, unknown>, sourcePath?: string): SkillKernelMetadata {
  const errors: string[] = [];
  const status = requiredString(frontmatter, "status", errors) as SkillStatus;
  const sideEffects = requiredArray(frontmatter, "side_effects", errors, true)
    .filter((item): item is SideEffectKind => VALID_SIDE_EFFECTS.has(item as SideEffectKind));

  return {
    name: requiredString(frontmatter, "name", errors),
    description: requiredString(frontmatter, "description", errors),
    version: requiredString(frontmatter, "version", errors),
    tags: requiredArray(frontmatter, "tags", errors),
    category: requiredString(frontmatter, "category", errors),
    inputs: requiredArray(frontmatter, "inputs", errors),
    outputs: requiredArray(frontmatter, "outputs", errors),
    sideEffects,
    permissions: requiredArray(frontmatter, "permissions", errors, true),
    entrypoints: requiredRecord(frontmatter, "entrypoints", errors),
    tests: requiredRecord(frontmatter, "tests", errors),
    status: VALID_STATUSES.has(status) ? status : "draft",
    platforms: Array.isArray(frontmatter.platforms) ? asStringArray(frontmatter.platforms) : undefined,
    sourcePath,
  };
}

function rowToSummary(row: SkillIndexRow): IndexedSkillSummary {
  return {
    name: row.name,
    description: row.description,
    version: row.version,
    tags: parseJsonArray(row.tags_json),
    category: row.category,
    inputs: parseJsonArray(row.inputs_json),
    outputs: parseJsonArray(row.outputs_json),
    sideEffects: parseJsonArray(row.side_effects_json).filter((item): item is SideEffectKind => VALID_SIDE_EFFECTS.has(item as SideEffectKind)),
    permissions: parseJsonArray(row.permissions_json),
    entrypoints: parseJsonRecord(row.entrypoints_json),
    tests: parseJsonRecord(row.tests_json),
    status: VALID_STATUSES.has(row.status) ? row.status : "draft",
    platforms: parseJsonArray(row.platforms_json),
    sourcePath: row.source_path || undefined,
    enabled: row.enabled === 1,
    generated: row.generated === 1,
    updatedAt: row.updated_at,
  };
}

function candidateRows(input: SkillMatchInput): SkillIndexRow[] {
  const clauses: string[] = [];
  if (!input.includeDisabled) clauses.push("enabled = 1");
  if (!input.includePending) clauses.push("status NOT IN ('draft', 'pending', 'disabled')");
  if (input.category) clauses.push(`category = ${literal(input.category)}`);

  const query = normalizeText(input.query || "");
  const fts = query ? ftsQuery(query) : "";
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = clampLimit(input.limit);

  if (fts) {
    return querySql<SkillIndexRow>(`
      SELECT skill_index.*, rank
      FROM skill_index_fts
      JOIN skill_index ON skill_index_fts.rowid = skill_index.rowid
      ${where ? `${where} AND` : "WHERE"} skill_index_fts MATCH ${literal(fts)}
      ORDER BY rank
      LIMIT ${limit * 4};
    `);
  }

  return querySql<SkillIndexRow>(`
    SELECT skill_index.*, NULL AS rank
    FROM skill_index
    ${where}
    ORDER BY updated_at DESC, name ASC
    LIMIT ${limit * 4};
  `);
}

function scoreSummary(summary: IndexedSkillSummary, input: SkillMatchInput, rank?: number | null): SkillMatchResult | null {
  const matchedBy: string[] = [];
  let score = typeof rank === "number" && Number.isFinite(rank)
    ? Math.max(10, 60 - Math.min(35, Math.round(rank * 8)))
    : 20;
  const tags = new Set(summary.tags.map(normalizeText));
  const sideEffects = new Set(summary.sideEffects);
  const permissions = new Set(summary.permissions.map(normalizeText));
  const haystack = [
    summary.name,
    summary.description,
    summary.category,
    summary.tags.join(" "),
    summary.sideEffects.join(" "),
    summary.permissions.join(" "),
  ].join(" ").toLowerCase();

  for (const tag of input.tags || []) {
    const normalized = normalizeText(tag);
    if (tags.has(normalized)) {
      score += 35;
      matchedBy.push(`tag:${tag}`);
    }
  }
  for (const sideEffect of input.sideEffects || []) {
    if (sideEffects.has(sideEffect)) {
      score += 45;
      matchedBy.push(`side_effect:${sideEffect}`);
    }
  }
  for (const permission of input.permissions || []) {
    const normalized = normalizeText(permission);
    if (permissions.has(normalized)) {
      score += 20;
      matchedBy.push(`permission:${permission}`);
    }
  }
  if (input.category && summary.category === input.category) {
    score += 25;
    matchedBy.push(`category:${input.category}`);
  }
  for (const term of normalizeText(input.query || "").split(/\s+/).filter(Boolean)) {
    if (haystack.includes(term)) {
      score += 8;
      matchedBy.push(`query:${term}`);
    }
  }

  if ((input.tags?.length || input.sideEffects?.length || input.permissions?.length || input.category) && matchedBy.length === 0) {
    return null;
  }

  return {
    ...summary,
    score,
    matchedBy: Array.from(new Set(matchedBy)),
  };
}

export function validateSkillFrontmatter(frontmatter: Record<string, unknown>): SkillFrontmatterValidation {
  const errors: string[] = [];
  requiredString(frontmatter, "name", errors);
  requiredString(frontmatter, "description", errors);
  requiredString(frontmatter, "version", errors);
  requiredArray(frontmatter, "tags", errors);
  requiredString(frontmatter, "category", errors);
  requiredArray(frontmatter, "inputs", errors);
  requiredArray(frontmatter, "outputs", errors);
  requiredArray(frontmatter, "side_effects", errors, true);
  requiredArray(frontmatter, "permissions", errors, true);
  requiredRecord(frontmatter, "entrypoints", errors);
  requiredRecord(frontmatter, "tests", errors);
  const status = requiredString(frontmatter, "status", errors);
  if (status && !VALID_STATUSES.has(status as SkillStatus)) {
    errors.push(`status must be one of ${Array.from(VALID_STATUSES).join(", ")}`);
  }
  const sideEffects = Array.isArray(frontmatter.side_effects) ? asStringArray(frontmatter.side_effects) : [];
  for (const sideEffect of sideEffects) {
    if (!VALID_SIDE_EFFECTS.has(sideEffect as SideEffectKind)) {
      errors.push(`side_effects contains unsupported value ${sideEffect}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function parseSkillMarkdown(markdown: string, sourcePath?: string): ParsedSkillMarkdown {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    const frontmatter = {};
    return {
      frontmatter,
      metadata: normalizeMetadata(frontmatter, sourcePath),
      body: normalized,
    };
  }

  const frontmatter = parseYamlFrontmatter(match[1]);
  return {
    frontmatter,
    metadata: normalizeMetadata(frontmatter, sourcePath),
    body: match[2],
  };
}

export function indexSkillMarkdown(input: IndexSkillMarkdownInput): IndexSkillMarkdownResult {
  const parsed = parseSkillMarkdown(input.markdown, input.sourcePath);
  const validation = validateSkillFrontmatter(parsed.frontmatter);
  if (!validation.valid) {
    return { indexed: false, metadata: parsed.metadata, validation };
  }

  const metadata = parsed.metadata;
  const enabled = input.enabled ?? (metadata.status === "beta" || metadata.status === "stable");
  const timestamp = nowIso();
  execSql(`
    INSERT INTO skill_index (
      name,
      description,
      version,
      tags_json,
      category,
      inputs_json,
      outputs_json,
      side_effects_json,
      permissions_json,
      entrypoints_json,
      tests_json,
      status,
      platforms_json,
      source_path,
      body_excerpt,
      enabled,
      generated,
      updated_at
    ) VALUES (
      ${literal(metadata.name)},
      ${literal(metadata.description)},
      ${literal(metadata.version)},
      ${jsonLiteral(metadata.tags)},
      ${literal(metadata.category)},
      ${jsonLiteral(metadata.inputs)},
      ${jsonLiteral(metadata.outputs)},
      ${jsonLiteral(metadata.sideEffects)},
      ${jsonLiteral(metadata.permissions)},
      ${jsonLiteral(metadata.entrypoints)},
      ${jsonLiteral(metadata.tests)},
      ${literal(metadata.status)},
      ${jsonLiteral(metadata.platforms || [])},
      ${literal(input.sourcePath)},
      ${literal(bodyExcerpt(parsed.body))},
      ${enabled ? 1 : 0},
      ${input.generated ? 1 : 0},
      ${literal(timestamp)}
    )
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      version = excluded.version,
      tags_json = excluded.tags_json,
      category = excluded.category,
      inputs_json = excluded.inputs_json,
      outputs_json = excluded.outputs_json,
      side_effects_json = excluded.side_effects_json,
      permissions_json = excluded.permissions_json,
      entrypoints_json = excluded.entrypoints_json,
      tests_json = excluded.tests_json,
      status = excluded.status,
      platforms_json = excluded.platforms_json,
      source_path = excluded.source_path,
      body_excerpt = excluded.body_excerpt,
      enabled = excluded.enabled,
      generated = excluded.generated,
      updated_at = excluded.updated_at;
  `);

  return { indexed: true, metadata, validation };
}

export function listIndexedSkills(options: { includeDisabled?: boolean; includePending?: boolean } = {}): IndexedSkillSummary[] {
  const clauses: string[] = [];
  if (!options.includeDisabled) clauses.push("enabled = 1");
  if (!options.includePending) clauses.push("status NOT IN ('draft', 'pending', 'disabled')");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return querySql<SkillIndexRow>(`
    SELECT skill_index.*, NULL AS rank
    FROM skill_index
    ${where}
    ORDER BY name ASC;
  `).map(rowToSummary);
}

export function matchSkills(input: SkillMatchInput): SkillMatchResult[] {
  return candidateRows(input)
    .map((row) => scoreSummary(rowToSummary(row), input, row.rank))
    .filter((item): item is SkillMatchResult => Boolean(item))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, clampLimit(input.limit));
}

export function loadSkillBody(name: string): LoadedSkillBody | null {
  const rows = querySql<SkillIndexRow>(`
    SELECT skill_index.*, NULL AS rank
    FROM skill_index
    WHERE name = ${literal(name)}
    LIMIT 1;
  `);
  const row = rows[0];
  if (!row?.source_path || !fs.existsSync(row.source_path)) return null;
  const parsed = parseSkillMarkdown(fs.readFileSync(row.source_path, "utf-8"), row.source_path);
  return {
    name: parsed.metadata.name,
    sourcePath: row.source_path,
    body: parsed.body,
    metadata: parsed.metadata,
  };
}

export function salesToolsForSkill(name: string): SalesToolDefinition[] {
  const rows = querySql<SkillIndexRow>(`
    SELECT skill_index.*, NULL AS rank
    FROM skill_index
    WHERE name = ${literal(name)}
    LIMIT 1;
  `);
  const row = rows[0];
  if (!row) return [];
  const sideEffects = new Set(rowToSummary(row).sideEffects);
  return listSideEffectSalesTools().filter((tool) => tool.sideEffectKind && sideEffects.has(tool.sideEffectKind));
}

export function enforceSkillSideEffect(input: EnforceSkillSideEffectInput): SalesToolEnforcementResult {
  const rows = querySql<SkillIndexRow>(`
    SELECT skill_index.*, NULL AS rank
    FROM skill_index
    WHERE name = ${literal(input.skillName)}
    LIMIT 1;
  `);
  const row = rows[0];
  if (!row) throw new Error(`Skill side-effect gate rejected ${input.skillName}: skill is not indexed.`);
  const summary = rowToSummary(row);
  if (!summary.enabled || summary.status === "pending" || summary.status === "disabled" || summary.status === "draft") {
    throw new Error(`Skill side-effect gate rejected ${input.skillName}: skill is not enabled for execution.`);
  }
  if (!summary.sideEffects.includes(input.sideEffectKind)) {
    throw new Error(`Skill side-effect gate rejected ${input.skillName}: undeclared side effect ${input.sideEffectKind}.`);
  }
  return enforceSalesToolForSideEffect({
    toolId: input.toolId,
    sideEffectKind: input.sideEffectKind,
    workspaceId: input.workspaceId,
    input: input.input,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function gatherSkillLearnSource(
  source: SkillLearnSourceInput,
  options: SkillLearnGatherOptions = {}
): Promise<GatheredSkillLearnSource> {
  if (source.kind === "pasted_procedure") {
    return { sourceKind: source.kind, sourceText: source.text };
  }
  if (source.kind === "workflow_summary") {
    return { sourceKind: source.kind, sourceText: source.summary };
  }
  if (source.kind === "local_path") {
    const sourcePath = path.resolve(source.path);
    return {
      sourceKind: source.kind,
      sourceText: fs.readFileSync(sourcePath, "utf-8"),
      sourceRef: sourcePath,
    };
  }
  const fetchText = options.fetchText || (async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch learn source ${url}: ${response.status}`);
    return response.text();
  });
  return {
    sourceKind: source.kind,
    sourceText: await fetchText(source.url),
    sourceRef: source.url,
  };
}

export function createSkillLearnProposal(input: CreateSkillLearnProposalInput): SkillLearnProposal {
  const createdAt = nowIso();
  const skillName = slug(input.name);
  const proposalId = `${skillName}-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const sourceSummary = compact(input.sourceText);
  const markdown = `---
name: ${skillName}
description: ${input.description}
version: 0.1.0
tags: ${yamlArray(input.tags)}
category: ${input.category}
inputs: ${yamlArray(input.inputs)}
outputs: ${yamlArray(input.outputs)}
side_effects: ${yamlArray(input.sideEffects)}
permissions: ${yamlArray(input.permissions)}
entrypoints:
  cli: ${input.suggestedEntryPoint}
tests:
  verification: ${input.suggestedTest}
status: pending
---
# ${input.name}

## Source

Kind: ${input.sourceKind}

${sourceSummary}

## Procedure

${input.sourceText.trim()}

## Safety

This skill is a pending SSA learn proposal. It must remain disabled until a human reviews the source, tests, side effects, permissions, and runtime entrypoint.

## Verification

Run \`${input.suggestedTest}\` before requesting enablement.
`;
  const sourcePath = path.join(path.dirname(skillIndexDbPath()), "learn-proposals", `${skillName}.SKILL.md`);
  ensureDir(path.dirname(sourcePath));
  fs.writeFileSync(sourcePath, markdown, "utf-8");

  const indexed = indexSkillMarkdown({
    markdown,
    sourcePath,
    enabled: false,
    generated: true,
  });
  const review: SkillLearnProposalReview = {
    id: proposalId,
    name: skillName,
    status: "pending",
    enabled: false,
    generated: true,
    sourceKind: input.sourceKind,
    sourceSummary,
    validationErrors: indexed.validation.errors,
    suggestedVerification: [input.suggestedTest, "Review side effects and permissions before enablement."],
    createdAt,
  };

  execSql(`
    INSERT INTO skill_learn_proposals (
      id,
      name,
      source_kind,
      source_summary,
      markdown,
      validation_errors_json,
      enabled,
      status,
      created_at
    ) VALUES (
      ${literal(review.id)},
      ${literal(review.name)},
      ${literal(review.sourceKind)},
      ${literal(review.sourceSummary)},
      ${literal(markdown)},
      ${jsonLiteral(review.validationErrors)},
      0,
      ${literal(review.status)},
      ${literal(review.createdAt)}
    )
    ON CONFLICT(id) DO UPDATE SET
      source_summary = excluded.source_summary,
      markdown = excluded.markdown,
      validation_errors_json = excluded.validation_errors_json,
      enabled = excluded.enabled,
      status = excluded.status;
  `);

  return {
    markdown,
    metadata: indexed.metadata,
    validation: indexed.validation,
    review,
  };
}

export async function createSkillLearnProposalFromSource(
  input: CreateSkillLearnProposalFromSourceInput,
  options: SkillLearnGatherOptions = {}
): Promise<SkillLearnProposal> {
  const gathered = await gatherSkillLearnSource(input.source, options);
  return createSkillLearnProposal({
    ...input,
    sourceKind: gathered.sourceKind,
    sourceText: gathered.sourceText,
  });
}

export function approveSkillProposal(input: ApproveSkillProposalInput): ApproveSkillProposalResult {
  const approvedBy = input.approvedBy.trim();
  const approvalNote = input.approvalNote.trim();
  if (!approvedBy) throw new Error("approvedBy is required to approve a learned skill.");
  if (!approvalNote) throw new Error("approvalNote is required to approve a learned skill.");

  const rows = querySql<SkillLearnProposalRow>(`
    SELECT id, name, markdown, status
    FROM skill_learn_proposals
    WHERE id = ${literal(input.proposalId)}
    LIMIT 1;
  `);
  const proposal = rows[0];
  if (!proposal || proposal.status !== "pending") {
    return { approved: false, proposalId: input.proposalId, skill: null };
  }

  const approvedMarkdown = proposal.markdown.replace(/\nstatus:\s*pending\s*\n/, "\nstatus: beta\n");
  const sourcePath = path.join(path.dirname(skillIndexDbPath()), "learn-proposals", `${proposal.name}.SKILL.md`);
  ensureDir(path.dirname(sourcePath));
  fs.writeFileSync(sourcePath, approvedMarkdown, "utf-8");
  const indexed = indexSkillMarkdown({
    markdown: approvedMarkdown,
    sourcePath,
    enabled: true,
    generated: true,
  });
  if (!indexed.indexed) {
    throw new Error(`Cannot approve learned skill ${proposal.name}: ${indexed.validation.errors.join("; ")}`);
  }

  const approvedAt = nowIso();
  execSql(`
    UPDATE skill_learn_proposals
    SET
      markdown = ${literal(approvedMarkdown)},
      validation_errors_json = ${jsonLiteral([])},
      enabled = 1,
      status = 'approved',
      approved_by = ${literal(approvedBy)},
      approval_note = ${literal(approvalNote)},
      approved_at = ${literal(approvedAt)}
    WHERE id = ${literal(input.proposalId)};
  `);

  const skill = listIndexedSkills({ includeDisabled: true, includePending: true })
    .find((item) => item.name === proposal.name) || null;
  return {
    approved: true,
    proposalId: input.proposalId,
    skill,
  };
}

export function createSkillPatchProposal(input: CreateSkillPatchProposalInput): SkillPatchProposal {
  const proposedBy = input.proposedBy.trim();
  if (!proposedBy) throw new Error("proposedBy is required to create a skill patch proposal.");
  const loaded = loadSkillBody(input.skillName);
  if (!loaded) throw new Error(`Cannot create patch proposal: skill ${input.skillName} is not indexed or loadable.`);
  const sourcePath = loaded.sourcePath;
  const currentMarkdown = fs.readFileSync(sourcePath, "utf-8");
  const proposedMarkdown = `${currentMarkdown.trimEnd()}\n${input.appendMarkdown.trimEnd()}\n`;
  const parsed = parseSkillMarkdown(proposedMarkdown, sourcePath);
  const validation = validateSkillFrontmatter(parsed.frontmatter);
  if (!validation.valid) {
    throw new Error(`Cannot create patch proposal for ${input.skillName}: ${validation.errors.join("; ")}`);
  }

  const createdAt = nowIso();
  const proposalId = `${slug(input.skillName)}-patch-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const sourceSummary = compact(input.sourceText);
  const review: SkillPatchProposalReview = {
    id: proposalId,
    skillName: input.skillName,
    status: "pending",
    sourceKind: input.sourceKind,
    sourceSummary,
    proposedBy,
    suggestedVerification: [input.suggestedTest, "Review patch diff and side effects before approval."],
    createdAt,
  };

  execSql(`
    INSERT INTO skill_patch_proposals (
      id,
      skill_name,
      source_path,
      source_kind,
      source_summary,
      proposed_markdown,
      proposed_by,
      suggested_test,
      status,
      created_at
    ) VALUES (
      ${literal(review.id)},
      ${literal(review.skillName)},
      ${literal(sourcePath)},
      ${literal(review.sourceKind)},
      ${literal(review.sourceSummary)},
      ${literal(proposedMarkdown)},
      ${literal(review.proposedBy)},
      ${literal(input.suggestedTest)},
      ${literal(review.status)},
      ${literal(review.createdAt)}
    );
  `);

  return { proposedMarkdown, review };
}

export function approveSkillPatchProposal(input: ApproveSkillPatchProposalInput): ApproveSkillPatchProposalResult {
  const approvedBy = input.approvedBy.trim();
  const approvalNote = input.approvalNote.trim();
  if (!approvedBy) throw new Error("approvedBy is required to approve a skill patch proposal.");
  if (!approvalNote) throw new Error("approvalNote is required to approve a skill patch proposal.");

  const rows = querySql<SkillPatchProposalRow>(`
    SELECT id, skill_name, source_path, proposed_markdown, status
    FROM skill_patch_proposals
    WHERE id = ${literal(input.proposalId)}
    LIMIT 1;
  `);
  const proposal = rows[0];
  if (!proposal || proposal.status !== "pending") {
    return { approved: false, proposalId: input.proposalId, skill: null };
  }

  const validation = validateSkillFrontmatter(parseSkillMarkdown(proposal.proposed_markdown, proposal.source_path).frontmatter);
  if (!validation.valid) {
    throw new Error(`Cannot approve patch for ${proposal.skill_name}: ${validation.errors.join("; ")}`);
  }

  fs.writeFileSync(proposal.source_path, proposal.proposed_markdown, "utf-8");
  const indexed = indexSkillMarkdown({
    markdown: proposal.proposed_markdown,
    sourcePath: proposal.source_path,
  });
  if (!indexed.indexed) {
    throw new Error(`Cannot reindex patched skill ${proposal.skill_name}: ${indexed.validation.errors.join("; ")}`);
  }

  const approvedAt = nowIso();
  execSql(`
    UPDATE skill_patch_proposals
    SET
      status = 'approved',
      approved_by = ${literal(approvedBy)},
      approval_note = ${literal(approvalNote)},
      approved_at = ${literal(approvedAt)}
    WHERE id = ${literal(input.proposalId)};
  `);

  const skill = listIndexedSkills({ includeDisabled: true, includePending: true })
    .find((item) => item.name === proposal.skill_name) || null;
  return {
    approved: true,
    proposalId: input.proposalId,
    skill,
  };
}

export function reindexSkillsFromDirectory(skillsRoot: string): ReindexSkillsResult {
  const invalid: ReindexInvalidSkill[] = [];
  let scanned = 0;
  let indexed = 0;

  if (!fs.existsSync(skillsRoot)) {
    return { scanned, indexed, invalid, updatedAt: nowIso() };
  }

  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourcePath = path.join(skillsRoot, entry.name, "SKILL.md");
    if (!fs.existsSync(sourcePath)) continue;
    scanned += 1;
    const result = indexSkillMarkdown({
      markdown: fs.readFileSync(sourcePath, "utf-8"),
      sourcePath,
    });
    if (result.indexed) indexed += 1;
    else invalid.push({ sourcePath, errors: result.validation.errors });
  }

  return { scanned, indexed, invalid, updatedAt: nowIso() };
}

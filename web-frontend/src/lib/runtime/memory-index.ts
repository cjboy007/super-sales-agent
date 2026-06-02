import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { loadLeadsRaw } from "../leads";
import { getQuotations } from "../quotations";
import { ensureDir, ensureSsaDataPath, ssaCompanyDataPath, ssaDataPath } from "../ssa-data-paths";
import { listFileManifest } from "./file-manifest";
import { getWorkspaceAdapter } from "./workspaces";

const SQLITE_TIMEOUT_MS = 5000;
const DEFAULT_LIMIT = 8;

export type MemoryIndexKind = "lead" | "quotation" | "document";
export type MemoryIndexSourceKind = MemoryIndexKind | "intake" | "product_doc";

export interface MemoryIndexRecordInput {
  workspaceId: string;
  sourceKind: MemoryIndexSourceKind;
  sourceId: string;
  kind?: MemoryIndexKind;
  title: string;
  body?: string;
  keywords?: string[];
  path?: string;
  mime?: string;
  size?: number;
  metadata?: Record<string, unknown>;
  updatedAt?: string;
}

export interface MemoryIndexSearchResult {
  kind: MemoryIndexKind;
  title: string;
  detail: string;
  confidence: number;
  path?: string;
  sourceKind: string;
  sourceId: string;
  metadata: Record<string, unknown>;
}

export interface RebuildMemoryIndexResult {
  workspaceId: string;
  recordsIndexed: number;
  updatedAt: string;
}

interface SqliteMemoryIndexRow {
  workspace_id: string;
  source_kind: string;
  source_id: string;
  kind: MemoryIndexKind;
  title: string;
  body: string | null;
  keywords: string | null;
  path: string | null;
  metadata_json: string | null;
  updated_at: string;
  rank?: number | null;
}

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

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(50, Math.max(1, Math.floor(limit as number)));
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase();
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function keywordText(keywords?: string[]): string {
  return Array.from(new Set((keywords || []).map((item) => String(item).trim()).filter(Boolean))).join(" ");
}

function detailFor(row: SqliteMemoryIndexRow): string {
  const metadata = parseMetadata(row.metadata_json);
  const parts = [
    metadata.customer,
    metadata.email,
    metadata.documentNo,
    metadata.drawingNo,
    metadata.amount,
    row.path,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.join(" / ") || row.body || "Indexed local memory";
}

function rowToResult(row: SqliteMemoryIndexRow, terms: string[]): MemoryIndexSearchResult {
  const haystack = [row.title, row.body || "", row.keywords || "", row.path || ""].join(" ").toLowerCase();
  let score = typeof row.rank === "number" && Number.isFinite(row.rank)
    ? Math.max(20, 72 - Math.min(40, Math.round(row.rank * 8)))
    : 42;

  for (const term of terms.map(normalizeTerm).filter(Boolean)) {
    if (!haystack.includes(term)) continue;
    score += term.includes("@") ? 34 : /\d/.test(term) ? 26 : 18;
  }

  return {
    kind: row.kind,
    title: row.title,
    detail: detailFor(row),
    confidence: Math.min(98, score),
    path: row.path || undefined,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    metadata: parseMetadata(row.metadata_json),
  };
}

function execSql(sql: string, dbPath = memoryIndexDbPath()): void {
  ensureInitialized(dbPath);
  execFileSync("sqlite3", ["-batch", dbPath, sql], {
    encoding: "utf-8",
    timeout: SQLITE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function querySql<T>(sql: string, dbPath = memoryIndexDbPath()): T[] {
  ensureInitialized(dbPath);
  const output = execFileSync("sqlite3", ["-batch", "-json", dbPath, sql], {
    encoding: "utf-8",
    timeout: SQLITE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!output) return [];
  return JSON.parse(output) as T[];
}

function ensureInitialized(dbPath = memoryIndexDbPath()): void {
  if (initializedDbPaths.has(dbPath)) return;
  ensureDir(path.dirname(dbPath));
  execFileSync("sqlite3", ["-batch", dbPath, `
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS indexed_files (
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT NOT NULL,
      mime TEXT,
      size INTEGER,
      metadata_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, path)
    );
    CREATE TABLE IF NOT EXISTS memory_index (
      workspace_id TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('lead', 'quotation', 'document')),
      title TEXT NOT NULL,
      body TEXT,
      keywords TEXT,
      path TEXT,
      metadata_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, source_kind, source_id)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_index_fts USING fts5(
      workspace_id UNINDEXED,
      source_kind UNINDEXED,
      source_id UNINDEXED,
      title,
      body,
      keywords,
      content='memory_index',
      content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS memory_index_ai AFTER INSERT ON memory_index BEGIN
      INSERT INTO memory_index_fts(rowid, workspace_id, source_kind, source_id, title, body, keywords)
      VALUES (new.rowid, new.workspace_id, new.source_kind, new.source_id, new.title, new.body, new.keywords);
    END;
    CREATE TRIGGER IF NOT EXISTS memory_index_ad AFTER DELETE ON memory_index BEGIN
      INSERT INTO memory_index_fts(memory_index_fts, rowid, workspace_id, source_kind, source_id, title, body, keywords)
      VALUES('delete', old.rowid, old.workspace_id, old.source_kind, old.source_id, old.title, old.body, old.keywords);
    END;
    CREATE TRIGGER IF NOT EXISTS memory_index_au AFTER UPDATE ON memory_index BEGIN
      INSERT INTO memory_index_fts(memory_index_fts, rowid, workspace_id, source_kind, source_id, title, body, keywords)
      VALUES('delete', old.rowid, old.workspace_id, old.source_kind, old.source_id, old.title, old.body, old.keywords);
      INSERT INTO memory_index_fts(rowid, workspace_id, source_kind, source_id, title, body, keywords)
      VALUES (new.rowid, new.workspace_id, new.source_kind, new.source_id, new.title, new.body, new.keywords);
    END;
    CREATE INDEX IF NOT EXISTS idx_memory_index_workspace_updated ON memory_index(workspace_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_memory_index_kind ON memory_index(workspace_id, kind);
  `], {
    encoding: "utf-8",
    timeout: SQLITE_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
  initializedDbPaths.add(dbPath);
}

const initializedDbPaths = new Set<string>();

export function memoryIndexDbPath(): string {
  return ensureSsaDataPath("runtime", "ssa-memory-index.db");
}

export function upsertMemoryIndexRecord(input: MemoryIndexRecordInput): void {
  const timestamp = input.updatedAt || nowIso();
  const kind = input.kind || (input.sourceKind === "lead" || input.sourceKind === "quotation" ? input.sourceKind : "document");
  const keywords = keywordText(input.keywords);
  const metadata = input.metadata || {};

  execSql(`
    INSERT INTO memory_index (
      workspace_id,
      source_kind,
      source_id,
      kind,
      title,
      body,
      keywords,
      path,
      metadata_json,
      updated_at
    ) VALUES (
      ${literal(input.workspaceId)},
      ${literal(input.sourceKind)},
      ${literal(input.sourceId)},
      ${literal(kind)},
      ${literal(input.title)},
      ${literal(input.body || "")},
      ${literal(keywords)},
      ${literal(input.path)},
      ${jsonLiteral(metadata)},
      ${literal(timestamp)}
    )
    ON CONFLICT(workspace_id, source_kind, source_id) DO UPDATE SET
      kind = excluded.kind,
      title = excluded.title,
      body = excluded.body,
      keywords = excluded.keywords,
      path = excluded.path,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at;
  `);

  if (input.path) {
    execSql(`
      INSERT INTO indexed_files (
        workspace_id,
        kind,
        title,
        path,
        mime,
        size,
        metadata_json,
        updated_at
      ) VALUES (
        ${literal(input.workspaceId)},
        ${literal(kind)},
        ${literal(input.title)},
        ${literal(input.path)},
        ${literal(input.mime || "")},
        ${literal(input.size)},
        ${jsonLiteral(metadata)},
        ${literal(timestamp)}
      )
      ON CONFLICT(workspace_id, path) DO UPDATE SET
        kind = excluded.kind,
        title = excluded.title,
        mime = excluded.mime,
        size = excluded.size,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at;
    `);
  }
}

export function removeMemoryIndexRecord(workspaceId: string, sourceKind: string, sourceId: string): void {
  execSql(`
    DELETE FROM memory_index
    WHERE workspace_id = ${literal(workspaceId)}
      AND source_kind = ${literal(sourceKind)}
      AND source_id = ${literal(sourceId)};
  `);
}

function exactMatches(workspaceId: string, terms: string[], limit: number): MemoryIndexSearchResult[] {
  const normalizedTerms = terms.map(normalizeTerm).filter(Boolean).slice(0, 16);
  if (normalizedTerms.length === 0) return [];
  const clauses = normalizedTerms.map((term) => `
    lower(title) LIKE ${literal(`%${term}%`)}
    OR lower(body) LIKE ${literal(`%${term}%`)}
    OR lower(keywords) LIKE ${literal(`%${term}%`)}
    OR lower(coalesce(path, '')) LIKE ${literal(`%${term}%`)}
  `);
  const rows = querySql<SqliteMemoryIndexRow>(`
    SELECT
      workspace_id,
      source_kind,
      source_id,
      kind,
      title,
      body,
      keywords,
      path,
      metadata_json,
      updated_at,
      NULL AS rank
    FROM memory_index
    WHERE workspace_id = ${literal(workspaceId)}
      AND (${clauses.map((clause) => `(${clause})`).join(" OR ")})
    ORDER BY datetime(updated_at) DESC, title ASC
    LIMIT ${clampLimit(limit)};
  `);
  return rows.map((row) => rowToResult(row, normalizedTerms));
}

function ftsQuery(terms: string[]): string {
  return terms
    .map(normalizeTerm)
    .filter(Boolean)
    .slice(0, 12)
    .map((term) => {
      const safe = term.replace(/"/g, " ").replace(/[^\p{L}\p{N}@._-]+/gu, " ").trim();
      return safe ? `"${safe}"` : "";
    })
    .filter(Boolean)
    .join(" OR ");
}

function ftsMatches(workspaceId: string, terms: string[], limit: number): MemoryIndexSearchResult[] {
  const query = ftsQuery(terms);
  if (!query) return [];
  const rows = querySql<SqliteMemoryIndexRow>(`
    SELECT
      mi.workspace_id,
      mi.source_kind,
      mi.source_id,
      mi.kind,
      mi.title,
      mi.body,
      mi.keywords,
      mi.path,
      mi.metadata_json,
      mi.updated_at,
      bm25(memory_index_fts) AS rank
    FROM memory_index_fts
    JOIN memory_index mi ON mi.rowid = memory_index_fts.rowid
    WHERE memory_index_fts MATCH ${literal(query)}
      AND mi.workspace_id = ${literal(workspaceId)}
    ORDER BY rank ASC, datetime(mi.updated_at) DESC
    LIMIT ${clampLimit(limit)};
  `);
  return rows.map((row) => rowToResult(row, terms));
}

function uniqueResults(results: MemoryIndexSearchResult[]): MemoryIndexSearchResult[] {
  const byKey = new Map<string, MemoryIndexSearchResult>();
  for (const result of results) {
    const key = `${result.kind}|${result.sourceKind}|${result.sourceId}`;
    const existing = byKey.get(key);
    if (!existing || result.confidence > existing.confidence) byKey.set(key, result);
  }
  return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence);
}

export function searchMemoryIndex(workspaceId: string, queryOrTerms: string | string[], limit = DEFAULT_LIMIT): MemoryIndexSearchResult[] {
  if (!fs.existsSync(memoryIndexDbPath())) return [];
  const terms = Array.isArray(queryOrTerms) ? queryOrTerms : queryOrTerms.split(/\s+/);
  const normalizedTerms = terms.map(normalizeTerm).filter(Boolean);
  if (normalizedTerms.length === 0) return [];

  return uniqueResults([
    ...exactMatches(workspaceId, normalizedTerms, limit),
    ...ftsMatches(workspaceId, normalizedTerms, limit),
  ]).slice(0, clampLimit(limit));
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeLeadRow(row: Record<string, unknown>): Record<string, unknown> {
  const text = (...values: unknown[]) => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
  };
  return {
    companyName: text(row.companyName, row.company_name, row.company, row.account, row.name),
    contact: text(row.contact, row.contact_name, row.contactName, row.person),
    email: text(row.email, row.email_address, row.mail),
    homepage: text(row.homepage, row.website, row.url),
    country: text(row.country, row.market),
    industry: text(row.industry, row.vertical),
    raw: row,
  };
}

function readLeadRowsFromFile(filePath: string): Array<Record<string, unknown>> {
  try {
    if (filePath.endsWith(".json")) {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
      return Array.isArray(raw)
        ? raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map(normalizeLeadRow)
        : [];
    }
    if (filePath.endsWith(".csv")) {
      const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter((line) => line.trim());
      if (lines.length < 2) return [];
      const headers = parseCsvLine(lines[0]);
      return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const row: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          row[header.trim()] = (values[index] || "").trim();
        });
        return normalizeLeadRow(row);
      });
    }
  } catch {
    return [];
  }
  return [];
}

function workspaceLeadRows(workspaceId: string): Array<Record<string, unknown>> {
  const workspace = getWorkspaceAdapter(workspaceId);
  if (workspace.id === "farreach") {
    return loadLeadsRaw().map((lead) => normalizeLeadRow(lead as Record<string, unknown>));
  }

  const leadsPath = workspace.data.leadsPath;
  if (!leadsPath || !fs.existsSync(leadsPath)) return [];
  const stat = safeStat(leadsPath);
  if (stat?.isFile()) return readLeadRowsFromFile(leadsPath);
  if (!stat?.isDirectory()) return [];

  const rows: Array<Record<string, unknown>> = [];
  for (const file of fs.readdirSync(leadsPath).filter((item) => item.endsWith(".csv") || item.endsWith(".json"))) {
    if (file.includes("-original") || file === "sample.csv") continue;
    rows.push(...readLeadRowsFromFile(path.join(leadsPath, file)));
  }
  return rows;
}

function addFileRecord(records: MemoryIndexRecordInput[], workspaceId: string, sourceKind: MemoryIndexSourceKind, filePath: string, metadata: Record<string, unknown> = {}) {
  const stat = safeStat(filePath);
  if (!stat?.isFile()) return;
  const title = String(metadata.title || metadata.documentNo || path.basename(filePath));
  records.push({
    workspaceId,
    sourceKind,
    sourceId: String(metadata.id || filePath),
    kind: sourceKind === "quotation" ? "quotation" : "document",
    title,
    body: [
      title,
      metadata.customer,
      metadata.documentNo,
      metadata.mainProducts,
      metadata.drawingNo,
      filePath,
    ].filter(Boolean).join(" "),
    keywords: [
      String(metadata.documentNo || ""),
      String(metadata.customer || ""),
      String(metadata.mainProducts || ""),
      String(metadata.drawingNo || ""),
      path.basename(filePath),
    ].filter(Boolean),
    path: filePath,
    mime: String(metadata.mime || ""),
    size: stat.size,
    metadata,
    updatedAt: new Date(stat.mtimeMs).toISOString(),
  });
}

function intakeRecords(workspaceId: string): MemoryIndexRecordInput[] {
  const sessionsDir = ssaCompanyDataPath(workspaceId, "intake", "sessions");
  if (!fs.existsSync(sessionsDir)) return [];
  const records: MemoryIndexRecordInput[] = [];
  for (const file of fs.readdirSync(sessionsDir).filter((item) => item.endsWith(".json"))) {
    try {
      const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), "utf-8")) as Record<string, unknown>;
      const uploads = Array.isArray(session.uploads) ? session.uploads as Array<Record<string, unknown>> : [];
      const productDoc = (session.analysis && typeof session.analysis === "object"
        ? (session.analysis as Record<string, unknown>).productDoc
        : null) as Record<string, unknown> | null;

      for (const upload of uploads) {
        const uploadPath = String(upload.path || "");
        if (!uploadPath) continue;
        addFileRecord(records, workspaceId, "intake", uploadPath, {
          id: upload.id || uploadPath,
          title: upload.name || path.basename(uploadPath),
          intakeId: session.id,
          mime: upload.type,
          processing: upload.processing,
        });
      }

      if (productDoc && typeof productDoc === "object") {
        records.push({
          workspaceId,
          sourceKind: "product_doc",
          sourceId: `${String(session.id || file)}:productDoc`,
          kind: "document",
          title: String(productDoc.drawingNo || productDoc.productName || `Product doc ${session.id || file}`),
          body: [
            productDoc.productName,
            productDoc.modelNo,
            productDoc.drawingNo,
            productDoc.packagingSpec,
            productDoc.uploadPath,
          ].map((value) => String(value || "")).filter(Boolean).join(" "),
          keywords: [
            String(productDoc.productName || ""),
            String(productDoc.modelNo || ""),
            String(productDoc.drawingNo || ""),
            String(productDoc.packagingSpec || ""),
          ].filter(Boolean),
          path: String(productDoc.uploadPath || ""),
          metadata: { intakeId: session.id, productDoc },
          updatedAt: String(session.updatedAt || nowIso()),
        });
      }
    } catch {
      // Corrupt intake sessions should not block rebuilding the rest of the index.
    }
  }
  return records;
}

function documentRecords(workspaceId: string): MemoryIndexRecordInput[] {
  const records: MemoryIndexRecordInput[] = [];
  for (const root of [ssaCompanyDataPath(workspaceId, "documents"), ssaCompanyDataPath(workspaceId, "quotations")]) {
    const visit = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(fullPath);
        else if (entry.isFile()) addFileRecord(records, workspaceId, fullPath.includes(`${path.sep}quotations${path.sep}`) ? "quotation" : "intake", fullPath);
      }
    };
    visit(root);
  }
  return records;
}

function leadRecords(workspaceId: string): MemoryIndexRecordInput[] {
  const workspace = getWorkspaceAdapter(workspaceId);
  return workspaceLeadRows(workspace.id).map((lead, index) => {
    const sourceId = String(lead.email || lead.companyName || `lead-${index}`);
    return {
      workspaceId: workspace.id,
      sourceKind: "lead",
      sourceId,
      kind: "lead",
      title: String(lead.companyName || lead.email || "Lead"),
      body: [
        lead.companyName,
        lead.contact,
        lead.email,
        lead.homepage,
        lead.country,
        lead.industry,
      ].filter(Boolean).join(" "),
      keywords: [
        String(lead.email || ""),
        String(lead.homepage || ""),
        String(lead.companyName || ""),
      ].filter(Boolean),
      metadata: lead,
      updatedAt: nowIso(),
    } satisfies MemoryIndexRecordInput;
  });
}

function quotationRecords(workspaceId: string): MemoryIndexRecordInput[] {
  return getQuotations({ page: 1, pageSize: 200 }).quotations.map((quote) => ({
    workspaceId,
    sourceKind: "quotation",
    sourceId: quote.id,
    kind: "quotation",
    title: quote.id,
    body: [quote.customer, quote.type, quote.status, quote.amount, quote.mainProducts, quote.filePath].filter(Boolean).join(" "),
    keywords: [quote.id, quote.customer, quote.mainProducts, quote.fileName].filter(Boolean),
    path: quote.filePath,
    mime: quote.fileType,
    metadata: quote as unknown as Record<string, unknown>,
    updatedAt: quote.date === "未知" ? nowIso() : `${quote.date}T00:00:00.000Z`,
  }));
}

function manifestRecords(workspaceId: string): MemoryIndexRecordInput[] {
  return listFileManifest(workspaceId).map((record) => ({
    workspaceId,
    sourceKind: record.kind === "quotation" ? "quotation" : "intake",
    sourceId: record.id,
    kind: record.kind === "quotation" ? "quotation" : "document",
    title: record.documentNo || record.fileName,
    body: [record.documentNo, record.fileName, record.customer, record.amount, record.mainProducts, record.path].filter(Boolean).join(" "),
    keywords: [record.documentNo, record.customer, record.mainProducts, record.fileName].filter(Boolean),
    path: record.path,
    mime: record.format,
    size: safeStat(record.path)?.size,
    metadata: record as unknown as Record<string, unknown>,
    updatedAt: record.updatedAt,
  }));
}

export function rebuildMemoryIndex(workspaceId: string): RebuildMemoryIndexResult {
  const workspace = getWorkspaceAdapter(workspaceId);
  ensureInitialized();
  execSql(`DELETE FROM memory_index WHERE workspace_id = ${literal(workspace.id)};`);
  execSql(`DELETE FROM indexed_files WHERE workspace_id = ${literal(workspace.id)};`);

  const records = [
    ...leadRecords(workspace.id),
    ...quotationRecords(workspace.id),
    ...manifestRecords(workspace.id),
    ...documentRecords(workspace.id),
    ...intakeRecords(workspace.id),
  ];

  for (const record of records) upsertMemoryIndexRecord(record);
  return {
    workspaceId: workspace.id,
    recordsIndexed: records.length,
    updatedAt: nowIso(),
  };
}

export function memoryIndexExists(): boolean {
  return fs.existsSync(memoryIndexDbPath());
}

/**
 * SSA Database Access Layer
 *
 * Direct better-sqlite3 access — no Python subprocess overhead.
 * Replaces the execSync(python3...) pattern in API routes.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { paths } from "./ssa-paths";

let agentDb: Database.Database | null = null;
let approvalDb: Database.Database | null = null;
let runtimeDb: Database.Database | null = null;

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalRequestRecord {
  id: string;
  dealId: string | null;
  account: string;
  title: string;
  trigger: string;
  value: string | null;
  risk: string | null;
  due: string | null;
  recommendation: string | null;
  guardrail: string | null;
  status: ApprovalStatus;
  createdAt: string;
  updatedAt: string | null;
  decisionBy: string | null;
  decisionNote: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ApprovalRequestInput {
  id?: string;
  dealId?: string;
  account: string;
  title: string;
  triggerType: string;
  value?: string;
  risk?: string;
  due?: string;
  recommendation?: string;
  guardrail?: string;
  status?: ApprovalStatus;
  decisionBy?: string;
  decisionNote?: string;
  metadata?: Record<string, unknown> | null;
}

export type DraftStatus = "draft" | "pending_approval" | "approved" | "rejected" | "sent";

export interface DraftRecord {
  id: string;
  subject: string;
  template: string | null;
  body: string | null;
  status: DraftStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface DraftRecordInput {
  id?: string;
  subject: string;
  template?: string | null;
  body?: string | null;
  status?: DraftStatus;
  source?: string;
  metadata?: Record<string, unknown> | null;
}

export type QuoteStatus = "Draft" | "Sent" | "Confirmed" | "Expired";
export type QuoteType = "QT" | "PI" | "PN" | "SPL";

export interface QuoteRecord {
  id: string;
  type: QuoteType;
  customer: string;
  amount: string;
  status: QuoteStatus;
  date: string;
  filePath: string | null;
  fileType: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface QuoteRecordInput {
  id: string;
  type: QuoteType;
  customer: string;
  amount?: string;
  status?: QuoteStatus;
  date?: string;
  filePath?: string | null;
  fileType?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEventRecord {
  id: string;
  type: string;
  actor: string;
  target: string | null;
  summary: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface AuditEventInput {
  id?: string;
  type: string;
  actor?: string;
  target?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  ddl: string
) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function getAgentDb(): Database.Database {
  if (agentDb) return agentDb;
  ensureDir(paths.dbAgentState);
  agentDb = new Database(paths.dbAgentState);
  agentDb.pragma("journal_mode = WAL");
  agentDb.exec(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      title TEXT NOT NULL DEFAULT '',
      deal_id TEXT,
      started_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      current_step TEXT,
      error TEXT,
      output_summary TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent);
  `);
  ensureColumn(agentDb, "agent_tasks", "updated_at", "TEXT NOT NULL DEFAULT ''");
  return agentDb;
}

function getApprovalDb(): Database.Database {
  if (approvalDb) return approvalDb;
  ensureDir(paths.dbApproval);
  approvalDb = new Database(paths.dbApproval);
  approvalDb.pragma("journal_mode = WAL");
  approvalDb.exec(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      deal_id TEXT,
      account TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      trigger TEXT NOT NULL DEFAULT '',
      trigger_type TEXT NOT NULL DEFAULT '',
      value TEXT,
      risk TEXT,
      due TEXT,
      recommendation TEXT,
      guardrail TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      decision_by TEXT,
      decision_note TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status);
  `);
  ensureColumn(approvalDb, "approval_requests", "trigger", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(approvalDb, "approval_requests", "metadata", "TEXT");
  ensureColumn(approvalDb, "approval_requests", "trigger_type", "TEXT NOT NULL DEFAULT ''");
  return approvalDb;
}

function getRuntimeDb(): Database.Database {
  if (runtimeDb) return runtimeDb;
  ensureDir(paths.dbRuntime);
  runtimeDb = new Database(paths.dbRuntime);
  runtimeDb.pragma("journal_mode = WAL");
  runtimeDb.exec(`
    CREATE TABLE IF NOT EXISTS draft_records (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL DEFAULT '',
      template TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      source TEXT NOT NULL DEFAULT 'ssa',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_draft_records_status ON draft_records(status);
    CREATE INDEX IF NOT EXISTS idx_draft_records_source ON draft_records(source);

    CREATE TABLE IF NOT EXISTS quote_records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'QT',
      customer TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '—',
      status TEXT NOT NULL DEFAULT 'Draft',
      date TEXT NOT NULL DEFAULT '',
      file_path TEXT,
      file_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_quote_records_type ON quote_records(type);
    CREATE INDEX IF NOT EXISTS idx_quote_records_status ON quote_records(status);
    CREATE INDEX IF NOT EXISTS idx_quote_records_date ON quote_records(date);

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'ssa',
      target TEXT,
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(type);
    CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
  `);
  return runtimeDb;
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function serializeMetadata(value?: Record<string, unknown> | null): string | null {
  return value ? JSON.stringify(value) : null;
}

// ─── Agent State Queries ──────────────────────────────────────────────────

const AGENT_ROLES: Record<string, string> = {
  shadow: "Customer intel and background research",
  iron: "Email triage, drafts, and customer outreach",
  warden: "Product specs and knowledge base maintenance",
  oracle: "Market trends and pricing intelligence",
  phoenix: "System health and safety review",
};

export function getAgentState(agent?: string, limit = 20) {
  const db = getAgentDb();
  const known = Object.keys(AGENT_ROLES);

  let tasks;
  if (agent) {
    tasks = db.prepare(
      `SELECT * FROM agent_tasks WHERE agent = ? ORDER BY started_at DESC LIMIT ?`
    ).all(agent, limit);
  } else {
    tasks = db.prepare(
      `SELECT * FROM agent_tasks WHERE status IN ('queued','running','approval_gated') ORDER BY started_at DESC LIMIT ?`
    ).all(limit);
  }

  // Per-agent summary
  const today = new Date().toISOString().slice(0, 10);
  const agents = known.map((name) => {
    const completed = db.prepare(
      `SELECT COUNT(*) as c FROM agent_tasks WHERE agent = ? AND status = 'completed' AND started_at >= ?`
    ).get(name, today) as { c: number } | undefined;
    const failed = db.prepare(
      `SELECT COUNT(*) as c FROM agent_tasks WHERE agent = ? AND status = 'failed' AND started_at >= ?`
    ).get(name, today) as { c: number } | undefined;
    const active = db.prepare(
      `SELECT COUNT(*) as c FROM agent_tasks WHERE agent = ? AND status IN ('queued','running')`
    ).get(name) as { c: number } | undefined;
    const gated = db.prepare(
      `SELECT COUNT(*) as c FROM agent_tasks WHERE agent = ? AND status = 'approval_gated'`
    ).get(name) as { c: number } | undefined;

    return {
      name,
      role: AGENT_ROLES[name],
      tasksCompletedToday: completed?.c || 0,
      tasksFailedToday: failed?.c || 0,
      activeTasks: active?.c || 0,
      approvalGated: gated?.c || 0,
    };
  });

  return { tasks, agents };
}

// ─── Approval Engine Queries ──────────────────────────────────────────────

function mapApprovalRow(r: Record<string, unknown>): ApprovalRequestRecord {
  const metadata = typeof r.metadata === "string" && r.metadata
    ? JSON.parse(r.metadata)
    : null;
  return {
    id: String(r.id),
    dealId: r.deal_id ? String(r.deal_id) : null,
    account: String(r.account || ""),
    title: String(r.title || ""),
    // Keep old rows readable if they were written by the Python engine.
    trigger: String(r.trigger_type || r.trigger || ""),
    value: r.value ? String(r.value) : null,
    risk: r.risk ? String(r.risk) : null,
    due: r.due ? String(r.due) : null,
    recommendation: r.recommendation ? String(r.recommendation) : null,
    guardrail: r.guardrail ? String(r.guardrail) : null,
    status: String(r.status || "pending") as ApprovalStatus,
    createdAt: String(r.created_at || ""),
    updatedAt: r.updated_at ? String(r.updated_at) : null,
    decisionBy: r.decision_by ? String(r.decision_by) : null,
    decisionNote: r.decision_note ? String(r.decision_note) : null,
    metadata,
  };
}

export function getApprovalById(id: string): ApprovalRequestRecord | null {
  const db = getApprovalDb();
  const row = db.prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? mapApprovalRow(row) : null;
}

export function createApprovalRequest(input: ApprovalRequestInput): ApprovalRequestRecord {
  const db = getApprovalDb();
  const id = input.id || `APV-${Date.now()}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO approval_requests (
      id, deal_id, account, title, trigger, trigger_type, value, risk, due,
      recommendation, guardrail, status, created_at, updated_at,
      decision_by, decision_note, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.dealId || null,
    input.account,
    input.title,
    input.triggerType,
    input.triggerType,
    input.value || null,
    input.risk || null,
    input.due || null,
    input.recommendation || null,
    input.guardrail || null,
    input.status || "pending",
    now,
    now,
    input.decisionBy || null,
    input.decisionNote || null,
    input.metadata ? JSON.stringify(input.metadata) : null
  );

  const created = getApprovalById(id);
  if (!created) {
    throw new Error(`Failed to create approval request: ${id}`);
  }
  return created;
}

export function updateApprovalStatus(
  id: string,
  status: ApprovalStatus,
  decisionBy?: string,
  decisionNote?: string
): ApprovalRequestRecord | null {
  const db = getApprovalDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE approval_requests
    SET status = ?, updated_at = ?, decision_by = ?, decision_note = ?
    WHERE id = ?
  `).run(status, now, decisionBy || null, decisionNote || null, id);
  return getApprovalById(id);
}

export function deleteApprovalRequest(id: string): boolean {
  const db = getApprovalDb();
  const result = db.prepare(`DELETE FROM approval_requests WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function getApprovals(status?: string, dealId?: string) {
  const db = getApprovalDb();

  let query = `SELECT * FROM approval_requests`;
  const conditions: string[] = [];
  const params: string[] = [];

  if (status) {
    conditions.push(`status = ?`);
    params.push(status);
  } else {
    conditions.push(`status = 'pending'`);
  }
  if (dealId) {
    conditions.push(`deal_id = ?`);
    params.push(dealId);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }
  query += ` ORDER BY created_at DESC`;

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((r) => mapApprovalRow(r));
}

// ─── SSA Runtime State: Drafts, Quotes, Audit ─────────────────────────────

function mapDraftRow(r: Record<string, unknown>): DraftRecord {
  return {
    id: String(r.id),
    subject: String(r.subject || ""),
    template: r.template ? String(r.template) : null,
    body: r.body ? String(r.body) : null,
    status: String(r.status || "draft") as DraftStatus,
    source: String(r.source || "ssa"),
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
    metadata: parseMetadata(r.metadata),
  };
}

export function upsertDraftRecord(input: DraftRecordInput): DraftRecord {
  const db = getRuntimeDb();
  const id = input.id || `DRAFT-${Date.now()}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO draft_records (
      id, subject, template, body, status, source, created_at, updated_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject,
      template = excluded.template,
      body = excluded.body,
      status = excluded.status,
      source = excluded.source,
      updated_at = excluded.updated_at,
      metadata = excluded.metadata
  `).run(
    id,
    input.subject,
    input.template || null,
    input.body || null,
    input.status || "draft",
    input.source || "ssa",
    now,
    now,
    serializeMetadata(input.metadata)
  );

  const row = db.prepare(`SELECT * FROM draft_records WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Failed to upsert draft record: ${id}`);
  return mapDraftRow(row);
}

export function getDraftRecords(source?: string, limit = 100): DraftRecord[] {
  const db = getRuntimeDb();
  const rows = source
    ? db.prepare(`SELECT * FROM draft_records WHERE source = ? ORDER BY updated_at DESC LIMIT ?`).all(source, limit)
    : db.prepare(`SELECT * FROM draft_records ORDER BY updated_at DESC LIMIT ?`).all(limit);
  return (rows as Record<string, unknown>[]).map(mapDraftRow);
}

export function deleteDraftRecord(id: string): boolean {
  const db = getRuntimeDb();
  const result = db.prepare(`DELETE FROM draft_records WHERE id = ?`).run(id);
  return result.changes > 0;
}

function mapQuoteRow(r: Record<string, unknown>): QuoteRecord {
  return {
    id: String(r.id),
    type: String(r.type || "QT") as QuoteType,
    customer: String(r.customer || ""),
    amount: String(r.amount || "—"),
    status: String(r.status || "Draft") as QuoteStatus,
    date: String(r.date || ""),
    filePath: r.file_path ? String(r.file_path) : null,
    fileType: r.file_type ? String(r.file_type) : null,
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
    metadata: parseMetadata(r.metadata),
  };
}

export function upsertQuoteRecord(input: QuoteRecordInput): QuoteRecord {
  const db = getRuntimeDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO quote_records (
      id, type, customer, amount, status, date, file_path, file_type,
      created_at, updated_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      customer = excluded.customer,
      amount = excluded.amount,
      status = excluded.status,
      date = excluded.date,
      file_path = excluded.file_path,
      file_type = excluded.file_type,
      updated_at = excluded.updated_at,
      metadata = excluded.metadata
  `).run(
    input.id,
    input.type,
    input.customer,
    input.amount || "—",
    input.status || "Draft",
    input.date || new Date().toISOString().slice(0, 10),
    input.filePath || null,
    input.fileType || null,
    now,
    now,
    serializeMetadata(input.metadata)
  );

  const row = db.prepare(`SELECT * FROM quote_records WHERE id = ?`).get(input.id) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Failed to upsert quote record: ${input.id}`);
  return mapQuoteRow(row);
}

export function getQuoteRecords(params?: {
  search?: string;
  type?: string;
  status?: string;
  limit?: number;
}): QuoteRecord[] {
  const db = getRuntimeDb();
  let query = `SELECT * FROM quote_records`;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params?.search) {
    conditions.push(`(id LIKE ? OR customer LIKE ?)`);
    values.push(`%${params.search}%`, `%${params.search}%`);
  }
  if (params?.type && params.type !== "All") {
    conditions.push(`type = ?`);
    values.push(params.type);
  }
  if (params?.status && params.status !== "All") {
    conditions.push(`status = ?`);
    values.push(params.status);
  }
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }
  query += ` ORDER BY date DESC, updated_at DESC LIMIT ?`;
  values.push(params?.limit || 500);

  const rows = db.prepare(query).all(...values) as Record<string, unknown>[];
  return rows.map(mapQuoteRow);
}

export function deleteQuoteRecord(id: string): boolean {
  const db = getRuntimeDb();
  const result = db.prepare(`DELETE FROM quote_records WHERE id = ?`).run(id);
  return result.changes > 0;
}

function mapAuditRow(r: Record<string, unknown>): AuditEventRecord {
  return {
    id: String(r.id),
    type: String(r.type || ""),
    actor: String(r.actor || "ssa"),
    target: r.target ? String(r.target) : null,
    summary: String(r.summary || ""),
    createdAt: String(r.created_at || ""),
    metadata: parseMetadata(r.metadata),
  };
}

export function createAuditEvent(input: AuditEventInput): AuditEventRecord {
  const db = getRuntimeDb();
  const id = input.id || `AUD-${Date.now()}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO audit_events (id, type, actor, target, summary, created_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.type,
    input.actor || "ssa",
    input.target || null,
    input.summary,
    now,
    serializeMetadata(input.metadata)
  );

  const row = db.prepare(`SELECT * FROM audit_events WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Failed to create audit event: ${id}`);
  return mapAuditRow(row);
}

export function getAuditEvents(limit = 50, type?: string): AuditEventRecord[] {
  const db = getRuntimeDb();
  const rows = type
    ? db.prepare(`SELECT * FROM audit_events WHERE type = ? ORDER BY created_at DESC LIMIT ?`).all(type, limit)
    : db.prepare(`SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?`).all(limit);
  return (rows as Record<string, unknown>[]).map(mapAuditRow);
}

export function deleteAuditEvent(id: string): boolean {
  const db = getRuntimeDb();
  const result = db.prepare(`DELETE FROM audit_events WHERE id = ?`).run(id);
  return result.changes > 0;
}

export { AGENT_ROLES };

import { execFileSync } from "child_process";
import path from "path";
import type { RuntimeJob, RuntimeJobStatus, RuntimeWorkflowStep } from "./types";
import { ensureDir, ensureSsaDataPath } from "../ssa-data-paths";

const DEFAULT_LIMIT = 50;
const SQLITE_TIMEOUT_MS = 5000;

interface SqliteRow {
  id: string;
  workspace_id: string;
  workflow: string;
  status: RuntimeJobStatus;
  input_json: string | null;
  steps_json: string | null;
  output_json: string | null;
  attempts: number | null;
  claimed_by: string | null;
  lease_until: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuntimeJobSummary {
  id: string;
  workspaceId: string;
  workflow: string;
  status: RuntimeJobStatus;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function rowToJob(row: SqliteRow): RuntimeJob {
  const output = parseJsonObject(row.output_json);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workflow: row.workflow as RuntimeJob["workflow"],
    status: row.status,
    input: parseJsonObject(row.input_json),
    steps: parseJsonArray<RuntimeWorkflowStep>(row.steps_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attempts: row.attempts || 0,
    claimedBy: row.claimed_by || undefined,
    leaseUntil: row.lease_until || undefined,
    output: Object.keys(output).length ? output : undefined,
    error: row.error || undefined,
  };
}

function jobSummaryFromRow(row: SqliteRow): RuntimeJobSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workflow: row.workflow,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

export function runtimeQueueDbPath(): string {
  return ensureSsaDataPath("runtime", "ssa-runtime.db");
}

export class SqliteTaskQueue {
  constructor(private readonly dbPath = runtimeQueueDbPath()) {
    ensureDir(path.dirname(this.dbPath));
    this.initialize();
  }

  enqueue(job: RuntimeJob): RuntimeJob {
    return this.save({ ...job, attempts: job.attempts ?? 0 });
  }

  save(job: RuntimeJob): RuntimeJob {
    const timestamp = nowIso();
    const updated: RuntimeJob = {
      ...job,
      updatedAt: timestamp,
      attempts: job.attempts ?? 0,
    };

    this.exec(`
      INSERT INTO runtime_jobs (
        id,
        workspace_id,
        workflow,
        status,
        input_json,
        steps_json,
        output_json,
        attempts,
        claimed_by,
        lease_until,
        error,
        created_at,
        updated_at
      ) VALUES (
        ${literal(updated.id)},
        ${literal(updated.workspaceId)},
        ${literal(updated.workflow)},
        ${literal(updated.status)},
        ${jsonLiteral(updated.input)},
        ${jsonLiteral(updated.steps)},
        ${jsonLiteral(updated.output ?? null)},
        ${literal(updated.attempts)},
        ${literal(updated.claimedBy)},
        ${literal(updated.leaseUntil)},
        ${literal(updated.error)},
        ${literal(updated.createdAt)},
        ${literal(updated.updatedAt)}
      )
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        workflow = excluded.workflow,
        status = excluded.status,
        input_json = excluded.input_json,
        steps_json = excluded.steps_json,
        output_json = excluded.output_json,
        attempts = excluded.attempts,
        claimed_by = excluded.claimed_by,
        lease_until = excluded.lease_until,
        error = excluded.error,
        updated_at = excluded.updated_at;
    `);

    return this.get(updated.id) || updated;
  }

  list(limit = DEFAULT_LIMIT): RuntimeJob[] {
    return this.query<SqliteRow>(`
      SELECT *
      FROM runtime_jobs
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ${clampLimit(limit)};
    `).map(rowToJob);
  }

  listSummaries(limit = DEFAULT_LIMIT): RuntimeJobSummary[] {
    return this.query<SqliteRow>(`
      SELECT
        id,
        workspace_id,
        workflow,
        status,
        NULL AS input_json,
        NULL AS steps_json,
        NULL AS output_json,
        attempts,
        claimed_by,
        lease_until,
        error,
        created_at,
        updated_at
      FROM runtime_jobs
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ${clampLimit(limit)};
    `).map(jobSummaryFromRow);
  }

  get(id: string): RuntimeJob | null {
    const rows = this.query<SqliteRow>(`
      SELECT *
      FROM runtime_jobs
      WHERE id = ${literal(id)}
      LIMIT 1;
    `);
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  claimNext(workerId: string, options: { leaseMs?: number; now?: Date } = {}): RuntimeJob | null {
    const leaseMs = Math.max(1000, options.leaseMs || 5 * 60 * 1000);
    const now = options.now || new Date();
    const nowText = now.toISOString();
    const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();

    const claimed = this.query<{ id: string }>(`
      UPDATE runtime_jobs
      SET
        status = 'running',
        attempts = attempts + 1,
        claimed_by = ${literal(workerId)},
        lease_until = ${literal(leaseUntil)},
        updated_at = ${literal(nowText)}
      WHERE id = (
        SELECT id
        FROM runtime_jobs
        WHERE status = 'queued'
           OR (status = 'running' AND lease_until IS NOT NULL AND lease_until < ${literal(nowText)})
        ORDER BY datetime(created_at) ASC, id ASC
        LIMIT 1
      )
      RETURNING id;
    `);

    return claimed[0] ? this.get(claimed[0].id) : null;
  }

  complete(id: string, output: Record<string, unknown> = {}): RuntimeJob {
    const existing = this.get(id);
    if (!existing) throw new Error(`Runtime job not found: ${id}`);
    return this.save({
      ...existing,
      status: "completed",
      output,
      claimedBy: undefined,
      leaseUntil: undefined,
      error: undefined,
    });
  }

  fail(id: string, error: string): RuntimeJob {
    const existing = this.get(id);
    if (!existing) throw new Error(`Runtime job not found: ${id}`);
    return this.save({
      ...existing,
      status: "failed",
      claimedBy: undefined,
      leaseUntil: undefined,
      error,
    });
  }

  private initialize(): void {
    this.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS runtime_jobs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        workflow TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        input_json TEXT NOT NULL DEFAULT '{}',
        steps_json TEXT NOT NULL DEFAULT '[]',
        output_json TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        claimed_by TEXT,
        lease_until TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runtime_jobs_status_created ON runtime_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_runtime_jobs_workspace_created ON runtime_jobs(workspace_id, created_at);
    `);
  }

  private exec(sql: string): void {
    execFileSync("sqlite3", ["-batch", this.dbPath, sql], {
      encoding: "utf-8",
      timeout: SQLITE_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  private query<T>(sql: string): T[] {
    const output = execFileSync("sqlite3", ["-batch", "-json", this.dbPath, sql], {
      encoding: "utf-8",
      timeout: SQLITE_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!output) return [];
    return JSON.parse(output) as T[];
  }
}

export function createRuntimeTaskQueue(): SqliteTaskQueue {
  return new SqliteTaskQueue();
}

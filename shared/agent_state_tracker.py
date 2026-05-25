"""Agent State Tracker for SSA — Python runtime.

Used by agents, cron jobs, and skills to report task lifecycle.
SQLite-backed for durability. Battle Station UI reads this for real-time display.

Reference: Hermes kanban pattern — IMMEDIATE writes, read-optimized queries.
"""

import json
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent.parent / "data" / "agent_state.db"

# ── Agent Role Definitions ──

AGENT_ROLES = {
    "shadow": "Customer intel and background research",
    "iron": "Email triage, drafts, and customer outreach",
    "warden": "Product specs and knowledge base maintenance",
    "oracle": "Market trends and pricing intelligence",
    "phoenix": "System health and safety review",
}

VALID_TRANSITIONS = {
    "queued": ["running", "cancelled"],
    "running": ["completed", "failed", "approval_gated"],
    "completed": [],
    "failed": ["queued"],  # can be retried
    "cancelled": [],
    "approval_gated": ["running", "cancelled"],  # after human approves
}


@dataclass
class AgentTask:
    id: str
    agent: str
    status: str = "queued"
    title: str = ""
    deal_id: Optional[str] = None
    started_at: str = ""
    updated_at: str = ""
    completed_at: Optional[str] = None
    progress: int = 0
    current_step: Optional[str] = None
    error: Optional[str] = None
    output_summary: Optional[str] = None
    metadata: Optional[dict] = None

    def __post_init__(self):
        now = datetime.now(timezone.utc).isoformat()
        if not self.started_at and self.status in ("running", "completed"):
            self.started_at = now
        if not self.updated_at:
            self.updated_at = now


def get_conn(db_path: Optional[Path] = None) -> sqlite3.Connection:
    db = db_path or DB_PATH
    db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db(db_path: Optional[Path] = None) -> None:
    conn = get_conn(db_path)
    conn.executescript("""
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
        CREATE INDEX IF NOT EXISTS idx_agent_tasks_deal ON agent_tasks(deal_id);
        CREATE INDEX IF NOT EXISTS idx_agent_tasks_started ON agent_tasks(started_at);
    """)
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(agent_tasks)").fetchall()}
    if "updated_at" not in columns:
        conn.execute("ALTER TABLE agent_tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
    conn.commit()
    conn.close()


def create_task(
    task_id: str,
    agent: str,
    title: str,
    deal_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    db_path: Optional[Path] = None,
) -> AgentTask:
    """Create a new task in queued state."""
    now = datetime.now(timezone.utc).isoformat()
    task = AgentTask(
        id=task_id,
        agent=agent,
        status="queued",
        title=title,
        deal_id=deal_id,
        started_at=now,
        updated_at=now,
        metadata=metadata,
    )
    conn = get_conn(db_path)
    conn.execute(
        """INSERT INTO agent_tasks
           (id, agent, status, title, deal_id, started_at, updated_at, progress)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (task.id, task.agent, task.status, task.title, task.deal_id, task.started_at, task.updated_at, 0),
    )
    conn.commit()
    conn.close()
    return task


def update_task_status(
    task_id: str,
    new_status: str,
    progress: Optional[int] = None,
    current_step: Optional[str] = None,
    error: Optional[str] = None,
    output_summary: Optional[str] = None,
    db_path: Optional[Path] = None,
) -> Optional[AgentTask]:
    """Transition a task to a new status with optional progress update."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_conn(db_path)

    # Validate transition
    row = conn.execute("SELECT status FROM agent_tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        return None

    current = row["status"]
    if new_status not in VALID_TRANSITIONS.get(current, []):
        conn.close()
        raise ValueError(
            f"Invalid transition: {current} -> {new_status}. "
            f"Allowed: {VALID_TRANSITIONS.get(current, [])}"
        )

    updates = ["status = ?", "updated_at = ?"]
    values = [new_status, now]

    if progress is not None:
        updates.append("progress = ?")
        values.append(progress)
    if current_step is not None:
        updates.append("current_step = ?")
        values.append(current_step)
    if error is not None:
        updates.append("error = ?")
        values.append(error)
    if output_summary is not None:
        updates.append("output_summary = ?")
        values.append(output_summary)
    if new_status in ("completed", "failed"):
        updates.append("completed_at = ?")
        values.append(now)

    values.append(task_id)
    conn.execute(
        f"UPDATE agent_tasks SET {', '.join(updates)} WHERE id = ?",
        values,
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM agent_tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return _row_to_task(dict(updated)) if updated else None


def get_active_tasks(
    agent: Optional[str] = None,
    limit: int = 50,
    db_path: Optional[Path] = None,
) -> list[AgentTask]:
    """Get tasks that are not yet completed/failed/cancelled."""
    conn = get_conn(db_path)
    query = "SELECT * FROM agent_tasks WHERE status IN ('queued', 'running', 'approval_gated')"
    params: list[object] = []
    if agent:
        query += " AND agent = ?"
        params.append(agent)
    query += " ORDER BY started_at DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [_row_to_task(dict(r)) for r in rows]


def get_recent_tasks(
    agent: Optional[str] = None,
    limit: int = 20,
    db_path: Optional[Path] = None,
) -> list[AgentTask]:
    """Get most recent tasks regardless of status."""
    conn = get_conn(db_path)
    query = "SELECT * FROM agent_tasks"
    params: list = []
    if agent:
        query += " WHERE agent = ?"
        params.append(agent)
    query += " ORDER BY started_at DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [_row_to_task(dict(r)) for r in rows]


def get_agent_summary(db_path: Optional[Path] = None) -> list[dict]:
    """Get per-agent summary for Battle Station display."""
    today = datetime.now(timezone.utc).date().isoformat()
    conn = get_conn(db_path)
    rows = conn.execute(
        """
        SELECT
            agent,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' AND started_at LIKE ? THEN 1 ELSE 0 END) as completed_today,
            SUM(CASE WHEN status = 'failed' AND started_at LIKE ? THEN 1 ELSE 0 END) as failed_today,
            SUM(CASE WHEN status IN ('queued', 'running') THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'approval_gated' THEN 1 ELSE 0 END) as gated
        FROM agent_tasks
        GROUP BY agent
        """,
        (f"{today}%", f"{today}%"),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _row_to_task(row: dict) -> AgentTask:
    metadata = row.get("metadata")
    if isinstance(metadata, str):
        metadata = json.loads(metadata) if metadata else None
    return AgentTask(
        id=row["id"],
        agent=row["agent"],
        status=row["status"],
        title=row["title"],
        deal_id=row.get("deal_id"),
        started_at=row["started_at"],
        updated_at=row.get("updated_at", ""),
        completed_at=row.get("completed_at"),
        progress=row.get("progress", 0),
        current_step=row.get("current_step"),
        error=row.get("error"),
        output_summary=row.get("output_summary"),
        metadata=metadata,
    )


# ── CLI Interface ──

if __name__ == "__main__":
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"

    if cmd == "init":
        init_db()
        print("Agent state DB initialized.")

    elif cmd == "create":
        # Usage: python agent_state_tracker.py create <agent> <title> [deal_id]
        if len(sys.argv) < 4:
            print("Usage: python agent_state_tracker.py create <agent> <title> [deal_id]")
            sys.exit(1)
        init_db()
        task_id = f"{sys.argv[2]}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
        deal_id = sys.argv[4] if len(sys.argv) > 4 else None
        task = create_task(task_id, sys.argv[2], sys.argv[3], deal_id)
        print(f"Task created: {task.id} ({task.agent}) — {task.title}")

    elif cmd == "complete":
        # Usage: python agent_state_tracker.py complete <task_id> [summary]
        if len(sys.argv) < 3:
            print("Usage: python agent_state_tracker.py complete <task_id> [summary]")
            sys.exit(1)
        init_db()
        summary = sys.argv[3] if len(sys.argv) > 3 else None
        result = update_task_status(sys.argv[2], "completed", output_summary=summary)
        if result:
            print(f"Task completed: {result.id}")
        else:
            print(f"Task not found: {sys.argv[2]}")

    elif cmd == "status":
        init_db()
        summary = get_agent_summary()
        if not summary:
            print("No tasks recorded.")
        else:
            for row in summary:
                print(
                    f"{row['agent']}: {row['active']} active, "
                    f"{row['completed_today']} completed today, "
                    f"{row['failed_today']} failed today, "
                    f"{row['gated']} approval-gated"
                )

    elif cmd == "list":
        init_db()
        tasks = get_recent_tasks(limit=10)
        if not tasks:
            print("No tasks found.")
        else:
            for t in tasks:
                step = f" — {t.current_step}" if t.current_step else ""
                err = f" [ERROR: {t.error}]" if t.error else ""
                print(f"[{t.status}] {t.agent}/{t.id}: {t.title}{step}{err}")

    else:
        print(f"Unknown command: {cmd}")
        print("Usage: python agent_state_tracker.py [init|create|complete|status|list]")

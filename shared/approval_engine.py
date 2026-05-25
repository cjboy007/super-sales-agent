"""Approval Engine for SSA — Python runtime.

Used by cron jobs, skills, and agents to create/evaluate approval requests.
Data persisted to SQLite for durability and Battle Station UI consumption.
"""

import json
import sqlite3
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent.parent / "data" / "approval_engine.db"

# ── Default Rules (Farreach cable trading) ──

DEFAULT_RULES = [
    {
        "id": "rule-discount-5",
        "name": "Discount above 5%",
        "trigger": "price_discount",
        "description": "Any customer-facing discount exceeding 5% requires human review",
        "threshold": {"discount_pct": 5},
        "enabled": True,
        "auto_expire_hours": 4,
    },
    {
        "id": "rule-discount-10",
        "name": "Discount above 10%",
        "trigger": "price_discount",
        "description": "Double-digit discount blocks send entirely until Wilson approves",
        "threshold": {"discount_pct": 10},
        "enabled": True,
        "auto_expire_hours": 2,
    },
    {
        "id": "rule-new-customer",
        "name": "New customer first order",
        "trigger": "new_customer_first",
        "description": "First PO from a new account — verify terms before committing",
        "threshold": {"min_po_count": 1},
        "enabled": True,
        "auto_expire_hours": 24,
    },
    {
        "id": "rule-high-value",
        "name": "Order above $500K",
        "trigger": "high_value",
        "description": "Any single PO above $500K requires human sign-off",
        "threshold": {"value_usd": 500_000},
        "enabled": True,
        "auto_expire_hours": 8,
    },
    {
        "id": "rule-competitor",
        "name": "Competitor undercut detected",
        "trigger": "competitor_detected",
        "description": "When AI detects rival pricing below our quote, flag for strategy review",
        "threshold": {"price_diff_pct": 10},
        "enabled": True,
        "auto_expire_hours": 6,
    },
    {
        "id": "rule-payment-terms",
        "name": "Non-standard payment terms",
        "trigger": "payment_terms",
        "description": "Terms beyond Net 60 require approval",
        "threshold": {"max_days": 60},
        "enabled": True,
        "auto_expire_hours": 12,
    },
    {
        "id": "rule-margin-floor",
        "name": "Margin below floor (15%)",
        "trigger": "margin_below_floor",
        "description": "Computed margin after discount drops below 15% gross margin floor",
        "threshold": {"min_margin_pct": 15},
        "enabled": True,
        "auto_expire_hours": 2,
    },
]


@dataclass
class ApprovalRequest:
    id: str
    deal_id: str
    account: str
    title: str
    trigger: str
    value: str
    risk: str
    due: str
    recommendation: str
    guardrail: str
    status: str = "pending"
    created_at: str = ""
    updated_at: str = ""
    decision_by: Optional[str] = None
    decision_note: Optional[str] = None
    metadata: Optional[dict] = None

    def __post_init__(self):
        now = datetime.now(timezone.utc).isoformat()
        if not self.created_at:
            self.created_at = now
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
        CREATE TABLE IF NOT EXISTS approval_requests (
            id TEXT PRIMARY KEY,
            deal_id TEXT NOT NULL,
            account TEXT NOT NULL,
            title TEXT NOT NULL,
            trigger TEXT NOT NULL,
            value TEXT NOT NULL,
            risk TEXT NOT NULL,
            due TEXT NOT NULL,
            recommendation TEXT NOT NULL,
            guardrail TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            decision_by TEXT,
            decision_note TEXT,
            metadata TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status);
        CREATE INDEX IF NOT EXISTS idx_approval_deal ON approval_requests(deal_id);
        CREATE INDEX IF NOT EXISTS idx_approval_created ON approval_requests(created_at);
    """)
    conn.commit()
    conn.close()


def create_request(req: ApprovalRequest, db_path: Optional[Path] = None) -> ApprovalRequest:
    conn = get_conn(db_path)
    conn.execute(
        """INSERT INTO approval_requests
           (id, deal_id, account, title, trigger, value, risk, due,
            recommendation, guardrail, status, created_at, updated_at,
            decision_by, decision_note, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            req.id, req.deal_id, req.account, req.title, req.trigger,
            req.value, req.risk, req.due, req.recommendation, req.guardrail,
            req.status, req.created_at, req.updated_at,
            req.decision_by, req.decision_note,
            json.dumps(req.metadata) if req.metadata else None,
        ),
    )
    conn.commit()
    conn.close()
    return req


def update_status(
    request_id: str,
    new_status: str,
    decision_by: Optional[str] = None,
    decision_note: Optional[str] = None,
    db_path: Optional[Path] = None,
) -> Optional[ApprovalRequest]:
    """Transition an approval request to a new status."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_conn(db_path)
    conn.execute(
        """UPDATE approval_requests
           SET status = ?, updated_at = ?, decision_by = ?, decision_note = ?
           WHERE id = ?""",
        (new_status, now, decision_by, decision_note, request_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM approval_requests WHERE id = ?", (request_id,)).fetchone()
    conn.close()
    if row:
        return _row_to_request(dict(row))
    return None


def get_pending(db_path: Optional[Path] = None) -> list[ApprovalRequest]:
    conn = get_conn(db_path)
    rows = conn.execute(
        "SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY created_at ASC"
    ).fetchall()
    conn.close()
    return [_row_to_request(dict(r)) for r in rows]


def get_by_deal(deal_id: str, db_path: Optional[Path] = None) -> list[ApprovalRequest]:
    conn = get_conn(db_path)
    rows = conn.execute(
        "SELECT * FROM approval_requests WHERE deal_id = ? ORDER BY created_at DESC",
        (deal_id,),
    ).fetchall()
    conn.close()
    return [_row_to_request(dict(r)) for r in rows]


def expire_old(db_path: Optional[Path] = None) -> int:
    """Auto-expire pending requests past their deadline. Returns count expired."""
    now = datetime.now(timezone.utc).isoformat()
    conn = get_conn(db_path)
    cursor = conn.execute(
        """SELECT id FROM approval_requests
           WHERE status = 'pending' AND due < ?""",
        (now,),
    )
    ids = [r["id"] for r in cursor.fetchall()]
    if ids:
        placeholders = ",".join("?" for _ in ids)
        conn.execute(
            f"""UPDATE approval_requests
                SET status = 'expired', updated_at = ?
                WHERE id IN ({placeholders})""",
            [now] + ids,
        )
        conn.commit()
    conn.close()
    return len(ids)


def _row_to_request(row: dict) -> ApprovalRequest:
    metadata = row.get("metadata")
    if isinstance(metadata, str):
        metadata = json.loads(metadata) if metadata else None
    return ApprovalRequest(
        id=row["id"],
        deal_id=row["deal_id"],
        account=row["account"],
        title=row["title"],
        trigger=row["trigger"],
        value=row["value"],
        risk=row["risk"],
        due=row["due"],
        recommendation=row["recommendation"],
        guardrail=row["guardrail"],
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        decision_by=row.get("decision_by"),
        decision_note=row.get("decision_note"),
        metadata=metadata,
    )


if __name__ == "__main__":
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"

    if cmd == "init":
        init_db()
        print("Approval engine DB initialized.")

    elif cmd == "pending":
        init_db()
        items = get_pending()
        if not items:
            print("No pending approvals.")
        else:
            for r in items:
                print(f"[{r.id}] {r.account} — {r.title} (due: {r.due})")

    elif cmd == "status":
        init_db()
        conn = get_conn()
        counts = conn.execute(
            "SELECT status, COUNT(*) as cnt FROM approval_requests GROUP BY status"
        ).fetchall()
        conn.close()
        print("Approval Engine Status:")
        for row in counts:
            print(f"  {row['status']}: {row['cnt']}")

    else:
        print(f"Unknown command: {cmd}")
        print("Usage: python approval_engine.py [init|pending|status]")

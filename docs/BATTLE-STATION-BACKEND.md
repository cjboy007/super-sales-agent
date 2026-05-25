# SSA Battle Station Backend Architecture

## Data Layer

Two SQLite databases power the Battle Station UI:

### `data/approval_engine.db` — Approval Engine

Tracks human-gated decisions. When an Agent (Iron, Pricing, etc.) encounters a situation requiring human review, it creates an approval request.

**Rules (default):**
| Rule | Trigger | Threshold | Auto-Expire |
|------|---------|-----------|-------------|
| Discount > 5% | price_discount | 5% | 4h |
| Discount > 10% | price_discount | 10% | 2h |
| New customer first order | new_customer_first | 1st PO | 24h |
| Order > $500K | high_value | $500,000 | 8h |
| Competitor undercut | competitor_detected | 10% below | 6h |
| Non-standard terms | payment_terms | > Net 60 | 12h |
| Margin below floor | margin_below_floor | < 15% | 2h |

**State machine:**
```
pending → approved (human approves)
pending → rejected (human rejects)
pending → expired (past due time, auto)
```

**Usage (Python):**
```python
from shared.approval_engine import init_db, create_request, ApprovalRequest

init_db()
req = ApprovalRequest(
    id="amphenol-counter-001",
    deal_id="amphenol",
    account="Amphenol Asia",
    title="Counter-offer: 8% discount",
    trigger="price_discount",
    value="$847K",
    risk="Medium margin exposure",
    due="2026-05-23T14:00:00Z",
    recommendation="Approve 8% discount with LME clause",
    guardrail="External send blocked until approved",
)
create_request(req)
```

### `data/agent_state.db` — Agent State Tracker

Tracks lifecycle of all Agent tasks (Shadow, Iron, Warden, Oracle, Phoenix).

**Agents:**
| Name | Role |
|------|------|
| shadow | Customer intel and background research |
| iron | Email triage, drafts, and customer outreach |
| warden | Product specs and knowledge base maintenance |
| oracle | Market trends and pricing intelligence |
| phoenix | System health and safety review |

**State machine:**
```
queued → running → completed
queued → running → failed → queued (retry)
queued → running → approval_gated → running (after human approves)
queued → cancelled
```

**Usage (Python):**
```python
from shared.agent_state_tracker import init_db, create_task, update_task_status

init_db()

# Agent starts work
create_task("shadow-20260523-001", "shadow", "Research: TE Connectivity", "te-connectivity")

# Progress update
update_task_status("shadow-20260523-001", "running", progress=50, current_step="Scraping BOM data")

# Task complete
update_task_status("shadow-20260523-001", "completed", output_summary="47 SKUs matched")
```

## API Endpoints

| Endpoint | Purpose | Params |
|----------|---------|--------|
| `GET /api/approvals` | List approval requests | `?status=pending`, `?deal_id=xxx` |
| `GET /api/agent-state` | Agent tasks + summaries | `?agent=shadow`, `?limit=20` |

## Integration with Battle Station UI

The Battle Station components (`CommandCenter`, `DomainRadar`, `FocusMode`) should read SSA-owned live state from the API routes above.

`web-frontend/src/lib/battle-station-data.ts` is seed/sample data only and should stay a fallback, not the source of truth.

Current live surfaces:

- `web-frontend/src/app/page.tsx`
- `web-frontend/src/app/agent-status/page.tsx`
- `web-frontend/src/app/inbox/page.tsx`
- `web-frontend/src/app/inbox/[emailId]/page.tsx`
- `web-frontend/src/app/quotations/page.tsx`

These surfaces should stay readable without OpenClaw or Hermes.

## How Agents Report State

### Option A: CLI calls (simplest)
```bash
# In a cron job or skill script
python3 shared/agent_state_tracker.py create shadow "Research: TE Connectivity" te-connectivity
# ... do work ...
python3 shared/agent_state_tracker.py complete shadow-20260523-001 "47 SKUs matched"
```

### Option B: Programmatic (in Python skills)
```python
from shared.agent_state_tracker import create_task, update_task_status
# ... as shown above
```

### Option C: HTTP API
Remote agents or external services should use explicit SSA API routes, but only through SSA-owned state and approval rules.

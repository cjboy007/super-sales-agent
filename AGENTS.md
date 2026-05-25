# AGENTS.md

## Project

Super Sales Agent, abbreviated SSA.

Primary repository:

```text
/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent
```

## Runtime Independence

SSA is a **standalone application**. It runs locally or on any server with:
- Node.js 20+ (Next.js frontend + API routes)
- Python 3.11+ (workers, approval engine, agent state tracker)
- SQLite (data persistence, WAL mode)
- LLM API access (DashScope/OpenAI-compatible, or mock mode for testing)

**SSA does NOT require** OpenClaw, Hermes, PHOENIX, Codex, or any agent framework to operate.

These tools are optional development/operator aids:
- **OpenClaw**: optional orchestration layer for multi-agent coordination (not needed for SSA runtime)
- **PHOENIX**: optional safety review agent (not needed for SSA runtime)
- **Hermes**: historical reference for kanban patterns (not needed for SSA runtime)
- **Codex**: optional development execution tool (not needed for SSA runtime)

## Architecture Principle

LLM suggests, extracts, drafts, translates, and summarizes.
Deterministic SSA code controls state, approvals, pricing rules, sending, retries, persistence, permissions, and external side effects.

### LLM API is used for:
- Email intent classification
- Structured extraction from messy emails/docs
- Lead/company research summaries
- Draft generation/rewrite
- Translation and tone adaptation
- Competitor/pricing reasoning summaries
- AI recommendation panels in Battle Station

### LLM API is NOT used for:
- Approval lifecycle decisions
- Sending emails
- Price-floor enforcement
- Quote totals, discounts, currency math
- Cron scheduling or worker dispatch
- DB CRUD correctness
- Auth/config/secrets/path validation
- External API execution
- Idempotency, retries, audit logs, rollback

## Role

Development agents (Claude Code, Codex, etc.) are the development execution layer for SSA.

They may:

- inspect source code
- propose implementation plans
- edit scoped files after approval or when the task explicitly allows edits
- run local verification commands
- update technical documentation
- add tests or improve test runners

OpenClaw, PHOENIX, and Codex are optional operator tools — not runtime dependencies.

## Hard safety boundaries

Do not read, print, summarize, copy, or commit secrets.

Forbidden paths and patterns:

```text
.env
.env.*
*.env
hero-pumps/.env
skills/email-smart-reply/.env
skills/imap-smtp-email/.env
skills/imap-smtp-email/profiles/*.env
```

Forbidden without explicit Jaden approval:

- SSH to `qwensales.com`
- run deploy scripts that provision, deploy, restart, rollback, or modify production
- PM2 restart on production
- Nginx config changes on production
- delete files or directories
- rewrite Git history
- force push
- migrate credentials
- send emails to real customers
- call real OKKI, SMTP, IMAP, Feishu, payment, or bank APIs
- modify production database or production state files

If a task needs any forbidden action, stop and ask Jaden.

## Repository map

```text
web-frontend/       Next.js web app (Battle Station UI)
ssa-runtime/        Standalone runtime: config, LLM adapter, side-effect gate
shared/             Python runtime modules (approval engine, agent state tracker)
skills/             Sales automation skills
scripts/            Utility scripts
tests/              Test plans, fixtures, and test runner
deploy/             Production deployment scripts, approval required
farreach/           Business automation modules
hero-pumps/         Hero Pump campaign system
data/               SQLite databases (gitignored)
docs/               Architecture and migration documents
```

## Frontend preference

Use Tailwind CSS for frontend styling when the existing app supports it. Avoid introducing plain vanilla CSS unless the local codebase already requires it.

## Architecture Decision (2026-05-23)

SSA runs on a **lightweight orchestration layer + LLM API + relational database**. It does NOT depend on Hermes or any heavy AI agent framework.

### Core Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Orchestration | Python cron + SQLite task queue | Worker scheduling, state machine, cron triggers |
| LLM | Direct API calls (DashScope / others) | Text classification, extraction, generation, translation |
| CRM Database | SQLite (current) / PostgreSQL (scale) | Customer profiles, leads, deals, email history, quotes |
| Approval Engine | `shared/approval_engine.py` + SQLite DB | Human-gated decisions with rule-based triggers |
| Agent State | `shared/agent_state_tracker.py` + SQLite DB | Task lifecycle: queued → running → completed/failed |
| Frontend | Next.js + Tailwind | Battle Station UI (CommandCenter, FocusMode) |
| API | Next.js route handlers | Bridge between SQLite and React components |

### Design Principles

1. **No framework bloat** — No LangChain, no LlamaIndex, no heavy agent frameworks. Each task has explicit input → prompt → output schema.
2. **SQLite-first** — All persistent state lives in SQLite databases under `data/`. WAL mode for concurrent reads.
3. **Workers are dumb** — Python scripts that do one thing, report status, exit. No persistent state in memory between runs.
4. **LLM is a function** — Call it like you call any other API. No streaming unless the UI needs it. Strict JSON schemas for output parsing.
5. **Human-in-the-loop is first-class** — The approval engine is core, not an afterthought. Every critical decision has a pending → approved/rejected lifecycle.
6. **Battle Station is read-optimized** — The UI polls API endpoints for real-time display. Workers write to DB, UI reads. Simple, reliable, no WebSocket needed unless scale demands it.

### Code Organization

```
super-sales-agent/
├── shared/                          ← Shared Python runtime modules
│   ├── approval_engine.py           ← Approval rules, state machine, SQLite CRUD
│   ├── agent_state_tracker.py       ← Task lifecycle, per-agent summaries
│   └── *.ts                         ← TypeScript interfaces for frontend
├── data/                            ← SQLite databases (gitignored)
│   ├── approval_engine.db           ← Approval requests
│   ├── agent_state.db               ← Agent task records
│   └── crm.db                       ← Future: customer/leads/deals database
├── web-frontend/                    ← Next.js Battle Station UI
│   └── src/app/api/                 ← REST endpoints reading shared/ Python modules
├── skills/                          ← Sales automation skills (email, quotes, etc.)
├── farreach/                        ← Business automation modules
└── hero-pumps/                      ← Hero Pump campaign system
```

### How Workers Report State

**Pattern A: CLI (cron jobs, shell scripts)**
```bash
python3 shared/agent_state_tracker.py create shadow "Research: TE Connectivity" te-connectivity
# ... do work ...
python3 shared/agent_state_tracker.py complete shadow-20260523-001 "47 SKUs matched"
```

**Pattern B: Programmatic (Python skills)**
```python
from shared.agent_state_tracker import create_task, update_task_status
task = create_task("iron-001", "iron", "Draft reply to Amphenol", "amphenol")
# ... work ...
update_task_status(task.id, "completed", output_summary="Draft sent")
```

**Pattern C: Approval gate (when worker needs human review)**
```python
from shared.approval_engine import create_request, ApprovalRequest
req = ApprovalRequest(id="req-001", deal_id="amphenol", account="Amphenol", ...)
create_request(req)
update_task_status(task.id, "approval_gated")
# Worker blocks here. Resumes when human approves via Battle Station UI.
```

## Default workflow

Before editing:

1. Confirm current directory is the primary repository.
2. Inspect `git status --short`.
3. Identify the smallest safe edit scope.
4. Avoid unrelated formatting churn.
5. Avoid reading forbidden files.

After editing:

1. Run the smallest meaningful verification.
2. Report changed files.
3. Report commands run and results.
4. Report risks and rollback steps.

## Verification commands

Use the narrowest command that proves the change.

Common commands:

```bash
# Web frontend
cd web-frontend
npm run lint
npm run build

# Test overview
bash tests/run-tests.sh

# Skill specific
cd skills/<skill-name>
npm test
```

If a command is missing or broken, report the blocker. Do not invent success.

## Output format

Every development task must end with:

```text
## Execution Complete
- What changed:
- Files changed:
- Verification:
- Risks:
- Rollback:
- Next step:
```

## Current status

SSA is a standalone application. Development tools (Claude Code, Codex, etc.) operate on this repository directly.

Codex migration documents in `docs/` are retained as historical baseline only.

Safety constraints remain in force:
- No real customer emails, external API calls, or production state changes without explicit Jaden approval
- No secrets exposure
- No production deployment without approval

# SSA Architecture

SSA is a standalone sales-ops runtime. The source of truth is SSA-owned state in SQLite-backed tables and deterministic code, not an external agent framework, not OKKI, and not the LLM.

## Core Rule

- Deterministic SSA code owns state, approvals, pricing rules, sending, retries, persistence, and audit logs.
- LLM only handles fuzzy work: classify, extract, summarize, translate, draft, and rank.
- OKKI is an integration target behind a seam, not the backbone.
- OpenClaw, Hermes, PHOENIX, and Codex are operator or development tools, not runtime dependencies.

## Runtime Layers

```text
web-frontend/   Next.js Battle Station UI, API routes, and SQLite bridge
ssa-runtime/    Config, LLM provider adapters, OKKI adapter, side-effect gate
shared/         Approval engine and agent-state tracker
data/           SQLite databases and local state
tests/          Smoke tests and runtime checks
skills/         Workflow modules and integration adapters
farreach/       Business automation workspace
hero-pumps/     Campaign workspace
config/         Shared integration config, not source-of-truth state
```

## Current UI Shell

The visible SSA shell is organized around the Battle Station component set:

- `web-frontend/src/app/page.tsx` main Battle Station cockpit
- `web-frontend/src/app/inbox/[emailId]/page.tsx` Focus Mode approval flow
- `web-frontend/src/app/leads/page.tsx`
- `web-frontend/src/app/inbox/page.tsx`
- `web-frontend/src/app/emails/page.tsx`
- `web-frontend/src/app/quotations/page.tsx`
- `web-frontend/src/app/documents/page.tsx`
- `web-frontend/src/app/intelligence/page.tsx`
- `web-frontend/src/app/agent-status/page.tsx`
- `web-frontend/src/app/settings/page.tsx`
- `web-frontend/src/components/battle-station/*` shared cockpit shell
- `web-frontend/src/components/inbox/*` focused email and draft controls

## SSA-Owned Backbone

The SSA-owned backbone is the combination of:

- `data/approval_engine.db`
- `data/agent_state.db`
- `data/crm.db` and related local tables when enabled
- `shared/approval_engine.py`
- `shared/agent_state_tracker.py`
- `web-frontend/src/app/api/*`
- `web-frontend/src/lib/db.ts`
- `web-frontend/src/lib/customer-side-effects.ts`
- `ssa-runtime/*`

This is the code path that must remain usable without OpenClaw or Hermes.

The `ssa-runtime/` folder is a seam, not an agent framework. Its job is to concentrate config loading, LLM provider calls, OKKI adapter behavior, and side-effect approval checks behind small interfaces.

## What LLM Can Do

- Intent classification
- Structured extraction from messy input
- Lead and company summaries
- Draft generation and rewrite
- Translation and tone adaptation
- Competitor and pricing reasoning summaries
- Optional recommendation panels in Battle Station

## What LLM Must Not Do

- Approval decisions
- Sending mail
- Price-floor enforcement
- Quote math
- Scheduling and worker dispatch
- Database CRUD correctness
- Config/secrets/path validation
- External API execution
- Idempotency, retries, or audit logging

## Integration Seams

### OKKI

OKKI is reached through `ssa-runtime/okki-adapter.ts` and the `skills/okki*` modules. It should be treated as a sync target and trail writer only.

Workflow modules may create OKKI sync intents, but they must not claim a real OKKI write unless the call goes through the runtime adapter and side-effect gate.

### LLM

All LLM calls go through `ssa-runtime/llm-provider.ts` and `ssa-runtime/llm-pipeline.ts`. Mock mode must remain available for local testing.

### UI

Battle Station reads from SSA-owned API routes such as:

- `/api/approvals`
- `/api/agent-state`
- `/api/audit`
- `/api/events`
- `/api/inbox`
- `/api/quotations`

Battle Station also writes approval state back through `/api/approvals`, so human approval becomes SSA-owned DB state instead of a local-only UI flag.

Customer-facing UI/API actions follow this rule:

```text
draft/recommendation -> approval request -> side-effect gate -> adapter execution
```

The UI may save drafts and approval requests locally without external calls. It must not send email, write OKKI trails, notify Feishu, or trigger payment/bank actions until SSA-owned approval state allows the side-effect gate to open.

## Tree Rules

- Keep current runtime code in `web-frontend/`, `ssa-runtime/`, `shared/`, and `data/`.
- Keep integration code in `skills/`, `farreach/`, `hero-pumps/`, and `config/`.
- Keep historical or adjacent workspaces such as `legacy CRM UI/`, `dashboard/`, `context-layer/`, `data-api/`, `generated-website/`, `evolution/`, `mail-archive/`, `memory/`, `logs/`, `output/`, and `templates/` out of the runtime path.

## Reference Docs

- [Project Structure](./PROJECT-STRUCTURE.md)
- [SSA Boundary Audit](./SSA-BOUNDARY-AUDIT.md)
- [Battle Station Backend](./BATTLE-STATION-BACKEND.md)

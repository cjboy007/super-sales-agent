# SSA Boundary Audit

This audit classifies the current repo into runtime core, integration seams, and historical or adjacent workspaces.

## Top-Level Directory Classification

| Class | Directories | Runtime meaning |
|---|---|---|
| Runtime core | `web-frontend/`, `ssa-runtime/`, `shared/`, `data/`, `tests/` | Current SSA surface. A developer should be able to run this without OpenClaw or Hermes. |
| Integration/business | `skills/`, `farreach/`, `hero-pumps/`, `config/` | Produces drafts, documents, exports, sync intents, and optional adapter behavior. Does not own SSA state. |
| Support | `docs/`, `scripts/`, `deploy/`, `.github/` | Documentation, utility commands, runbooks, and CI/deploy metadata. |
| Historical/adjacent | `legacy CRM UI/`, `dashboard/`, `context-layer/`, `data-api/`, `generated-website/`, `evolution/`, `mail-archive/`, `memory/`, `logs/`, `output/`, `templates/` | Not part of the current runtime path unless explicitly revived. |

## Runtime Core

| Area | Files / folders | Notes |
|---|---|---|
| UI/API | `web-frontend/` | Battle Station, Focus Mode, secondary pages, API routes |
| SQLite bridge | `web-frontend/src/lib/db.ts`, `web-frontend/src/lib/ssa-paths.ts` | Portable DB/path bridge for approvals and agent state |
| Side-effect wrapper | `web-frontend/src/lib/customer-side-effects.ts` | Route-level wrapper around the runtime side-effect gate |
| Runtime | `ssa-runtime/` | Config, LLM adapter, side-effect gate, OKKI adapter |
| Shared state | `shared/` | Approval engine and agent-state tracker |
| Local data | `data/` | SQLite state and audit records |
| Validation | `tests/` | Runtime checks and smoke tests |

## Integration Seams

| Area | Files / folders | Notes |
|---|---|---|
| LLM | `ssa-runtime/llm-provider.ts`, `ssa-runtime/llm-pipeline.ts`, selected workflow modules | Helper layer only; mock mode must remain available |
| OKKI | `ssa-runtime/okki-adapter.ts`, `skills/okki*`, `tests/*okki*` | External sync target, not source of truth |
| Email | `skills/imap-smtp-email`, `web-frontend/src/app/api/emails/*`, `web-frontend/src/app/api/inbox/*` | Customer-facing send stays human-gated |
| Documents / quotes | `skills/quotation-workflow`, `web-frontend/src/app/quotations`, `web-frontend/src/app/documents` | SSA-owned workflow with optional export adapters |
| Audit log | `web-frontend/src/app/api/audit/route.ts`, `web-frontend/src/lib/db.ts` | SSA-owned history for drafts, quotes, and event records |
| State events | `web-frontend/src/app/api/events/route.ts`, `web-frontend/src/lib/events.ts` | Read-optimized runtime stream |
| Shared config | `config/` | Integration config only. Do not treat as approval/task/CRM source of truth. |

## LLM-Heavy Modules That Are Acceptable

These modules still use the LLM, but only for fuzzy work and not for state authority:

- `ssa-runtime/llm-provider.ts`
- `ssa-runtime/llm-pipeline.ts`
- `farreach/headless-api.js`
- `farreach/handlers/email-inbox.js`
- `skills/email-smart-reply`
- `skills/workflow-engine`

## OKKI-Heavy Modules That Are Acceptable

These modules integrate with OKKI but do not own SSA state:

- `ssa-runtime/okki-adapter.ts`
- `skills/okki`
- `skills/okki-email-sync`
- `skills/okki-integration`
- `skills/okki-sync-mail`

## Remaining Adapter Migration Candidates

These are not current runtime blockers while they stay in integration or adjacent workspaces. They become blockers if a task promotes them into the SSA runtime path without routing through `ssa-runtime/`.

### Direct LLM callers

Class: integration debt. LLM use is acceptable for fuzzy work, but these modules should use `ssa-runtime/llm-provider.ts` or `ssa-runtime/llm-pipeline.ts` before becoming runtime modules.

- `farreach/headless-api.js`
- `farreach/handlers/email-inbox.js`
- `farreach/intent-classifier-llm.js`
- `farreach/negotiation-pipeline.js`
- `farreach/product-matcher.js`
- `skills/imap-smtp-email/intent-recognition.js`
- `skills/imap-smtp-email/reply-generation.js`
- `skills/email-smart-reply/scripts/reply-generation.js`
- `skills/product-doc-reader/scripts/extract_vision.py`

### Direct OKKI writers

Class: integration debt. OKKI is a sync target only; these modules must not become SSA source-of-truth code. Before promotion, OKKI writes should become sync intents or call `ssa-runtime/okki-adapter.ts` behind the side-effect gate.

- `farreach/sales-orchestrator.js`
- `skills/imap-smtp-email/okki-sync.js`
- `skills/imap-smtp-email/auto-capture.js`
- `skills/imap-smtp-email/imap-watcher.js`
- `skills/follow-up-engine/scripts/okki-integration.js`
- `skills/after-sales/api/controllers/okki_sync_controller.js`
- `skills/logistics/api/controllers/okki_sync_controller.js`

## Historical Or Adjacent Workspaces

These folders should be treated as historical, generated, or adjacent unless a task explicitly revives them:

- `legacy CRM UI/`
- `dashboard/`
- `context-layer/`
- `data-api/`
- `generated-website/`
- `evolution/`
- `mail-archive/`
- `memory/`
- `logs/`
- `output/`
- `templates/`

## Remaining Legacy References

Current SSA runtime code should not hardcode workstation paths. Any remaining absolute-path references are classified as follows:

- `hero-pumps/scripts/*`, `hero-pumps/tracking/*`, `hero-pumps/orchestrator/*` — adjacent Hero Pumps campaign tooling. Normalize before reviving as SSA runtime workers.
- `hero-pumps/follow-up-state.json`, `hero-pumps/iron-prompts/*`, test reports, and archived outputs — generated or historical artifacts, not runtime core.
- `data-api/` — legacy local data service/logs. Keep out of the current runtime path unless it is intentionally revived.
- `config/` — shared integration config. Do not store SSA-owned approval, task, quote, or CRM authority here.
- Older OKKI notes in `skills/` and `docs/` — integration history. OKKI remains an adapter/sync target, not SSA state authority.
- Older OpenClaw/Codex/PHOENIX docs such as `docs/CODEX-MIGRATION-PLAN-2026-05-15.md`, `docs/MONOREPO_SETUP.md`, and `CODEX.md` — documentation-only historical references unless explicitly updated by a task.

## Decision

SSA’s backbone is deterministic local state. LLM and OKKI are both seams around that backbone, not the backbone itself.

## Current Runtime Tightening Slice

Implemented safety rule:

- `ssa-runtime/side-effect-gate.ts` blocks all customer-facing side effects in development and test mode.
- In production mode, the side-effect gate requires an approval ID whose SSA approval record has `status = 'approved'`.
- `/api/emails/send` and `/api/inbox/[emailId]/send` enter through the side-effect gate before SMTP or Farreach email paths can run.
- `/api/inbox/[emailId]/reply` has an SSA runtime fallback through `web-frontend/src/lib/llm-runtime.ts`, so reply drafting can run without the Farreach HTTP service.
- `web-frontend/src/lib/email-delivery.ts` provides the SSA-owned local SMTP transport used by `/api/emails/send` and as a fallback for `/api/inbox/[emailId]/send` when Farreach is offline.
- `/api/quotations/generate` now writes SSA-owned quote records and audit events even when the export workflow script is unavailable.
- `/api/documents/generate` now renders SSA-owned fallback HTML artifacts when the trade-doc export scripts are unavailable.
- `/api/dashboard/overview` now reads non-hero agent activity from SSA-owned agent state instead of scanning a Farreach research folder.
- `ssa-runtime/context-builder.ts` now passes DB path and customer email as process arguments, not shell text, when it asks Python to read local context.
- `skills/workflow-engine/lib/actions/create-okki-trail-action.js` is dry-run only; OKKI trail sync must go through `ssa-runtime/okki-adapter.ts` plus the side-effect gate.

This keeps LLM output, workflow actions, and OKKI sync as assistant/integration layers. SSA-owned approval state remains the authority for any customer-facing execution.

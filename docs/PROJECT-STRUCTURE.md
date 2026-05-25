# SSA Project Structure

This is the canonical tree for the current SSA repo. It separates the live runtime from integration workspaces, support material, and historical/adjacent code.

## Runtime Surface

New SSA runtime work should land in this surface unless there is a specific reason to extend an integration workspace.

```text
super-sales-agent/
├── web-frontend/                    Next.js Battle Station UI and API bridge
│   ├── src/app/                     Battle Station, Focus Mode, secondary pages
│   ├── src/app/api/                 SSA-owned HTTP routes
│   ├── src/components/battle-station/
│   │                                Shared shell, radar, timeline, approvals
│   ├── src/components/inbox/       Focus-mode email and draft controls
│   ├── src/lib/db.ts               SQLite bridge for approvals, agent state,
│   │                                drafts, quotes, and audit
│   ├── src/lib/agent-runtime.ts    SSA-owned agent state mapping
│   ├── src/lib/email-delivery.ts   Local SMTP delivery helper
│   ├── src/lib/llm-runtime.ts      Runtime-safe LLM wrapper and mock fallback
│   ├── src/lib/customer-side-effects.ts
│   │                                Email/send gate wrapper
│   └── src/lib/ssa-paths.ts        Portable repo path resolver
├── ssa-runtime/                     Runtime seams
│   ├── config.ts                    Env/path config, no workstation paths
│   ├── llm-provider.ts              Direct LLM adapter with mock mode
│   ├── llm-pipeline.ts              Fuzzy-work prompt pipeline
│   ├── side-effect-gate.ts          Human approval gate for external writes
│   └── okki-adapter.ts              OKKI sync adapter only
├── shared/                          Deterministic state modules
│   ├── approval_engine.py           Approval state machine and SQLite CRUD
│   ├── agent_state_tracker.py       Task lifecycle and agent summaries
│   ├── approval-engine.ts           TypeScript approval types/rules
│   └── agent-state-tracker.ts       TypeScript agent-state types
├── data/                            Local SQLite databases and runtime state
└── tests/                           Runtime, safety, and smoke checks
```

Runtime call path:

```text
operator UI
  -> web-frontend/src/app/api/*
  -> web-frontend/src/lib/db.ts for SSA-owned SQLite state
  -> ssa-runtime/* for config, LLM, adapters, and side-effect gating
  -> shared/* and data/*.db for deterministic state
```

Current visible UI surfaces:

- `/` main Battle Station
- `/inbox/[emailId]` Focus Mode approval screen
- `/leads`, `/inbox`, `/emails`, `/quotations`, `/documents`, `/intelligence`, `/agent-status`, `/settings` secondary command surfaces

Customer-facing side effects are not runtime shortcuts. Email sends, OKKI trail writes, Feishu notifications, payments, bank actions, and other external writes must enter through `ssa-runtime/side-effect-gate.ts` before an adapter can execute.

## Integration And Business Workspaces

```text
skills/         Workflow modules and reusable sales automation capabilities
farreach/       Farreach-specific automation, dashboards, and lead handling
hero-pumps/     Hero Pumps campaign and quotation content
config/         Shared integration configuration, not source-of-truth runtime state
```

These modules may produce drafts, recommendations, documents, exports, and sync intents. They do not own approval state, agent state, quote authority, or customer-facing side effects.

## Supporting Material

```text
docs/           Architecture notes, migration plans, and operational guides
deploy/         Deployment scripts and production runbooks, approval required
scripts/        Utility scripts for local maintenance and test workflows
.github/        CI/workflow metadata
```

Root instruction files such as `AGENTS.md`, `CLAUDE.md`, and `CODEX.md` are development/operator guidance. They are not runtime dependencies.

## Adjacent Or Historical Workspaces

These folders exist in the repo, but they are not the current SSA runtime surface:

```text
legacy CRM UI/              Earlier CRM UI experiment
dashboard/           Static/generated dashboard prototype
context-layer/       Earlier customer context bridge
data-api/            Legacy local data server/logs
generated-website/   Generated Next.js website artifact
evolution/           Historical auto-evolution/test workflow
mail-archive/        Archived/generated mail logs
memory/              Historical notes
logs/                Generated local logs
output/              Generated documents, quotes, PDFs, and pipeline outputs
templates/           Historical/generated templates
```

Do not add new SSA runtime logic to these folders unless the folder is explicitly revived and this document is updated.

## Placement Rules

- Put current runtime code in `web-frontend/`, `ssa-runtime/`, `shared/`, or `data/`.
- Put LLM call shape, mock mode, and provider adapters in `ssa-runtime/`.
- Put approval/task persistence in `shared/` or `web-frontend/src/lib/db.ts`.
- Put integrations and workflow implementations in `skills/`, `farreach/`, or `hero-pumps/`.
- Put shared integration config in `config/` only when it is not SSA-owned runtime state.
- Put documentation in `docs/`.
- Leave historical or generated folders alone unless the task explicitly revives them.

# Super Sales Agent

SSA is a standalone sales-ops system with a Next.js Battle Station, local runtime modules, SQLite-backed state, and a small worker/tooling layer.

For the canonical directory map, see [docs/PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md).

## Backbone

- Deterministic SSA code owns approvals, tasks, drafts, quotes, state, and audit logs.
- LLM is a helper for fuzzy work only.
- OKKI is an integration seam, not the source of truth.
- OpenClaw, Hermes, PHOENIX, and Codex are optional operators, not runtime dependencies.

## Canonical Tree

The repo is intentionally split into one runtime surface, integration workspaces, and historical/adjacent material.

```text
super-sales-agent/
├── web-frontend/      # Current SSA UI, API routes, SQLite bridge
├── ssa-runtime/       # Runtime seams: config, LLM adapters, side-effect gate, OKKI adapter
├── shared/            # Deterministic approval and task-state modules
├── data/              # Local SQLite databases and runtime state
├── tests/             # Runtime, safety, and smoke checks
├── skills/            # Workflow modules and integration adapters
├── farreach/          # Farreach-specific automation workspace
├── hero-pumps/        # Hero Pumps campaign workspace
├── config/            # Shared integration configuration, not the SSA source of truth
├── docs/              # Architecture, migration, and runbook docs
├── deploy/            # Production deployment scripts and runbooks, approval required
└── scripts/           # Utility scripts
```

## Current Runtime Surface

- `web-frontend/`
- `ssa-runtime/`
- `shared/`
- `data/`
- `tests/`

## What Not To Treat As Runtime

- `deploy/`
- `docs/`
- historical or adjacent directories such as `legacy CRM UI/`, `dashboard/`, `generated-website/`, `context-layer/`, `data-api/`, `evolution/`, `mail-archive/`, `memory/`, `output/`, `logs/`, and `templates/`

## Main Entry Points

- `web-frontend/` for the Battle Station UI
- `ssa-runtime/` for adapters and side-effect gating
- `shared/` for approval and task-state helpers
- `tests/` for validation
- `docs/ARCHITECTURE.md` for the architecture map

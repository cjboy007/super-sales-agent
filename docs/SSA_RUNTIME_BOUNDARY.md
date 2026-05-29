# SSA Runtime Boundary

SSA should run as a normal local sales operations system. The git repo is for source code, docs, config templates, tests, and intentional fixtures. Runtime data does not belong in the repo.

## Runtime Dependencies

SSA runtime may depend on:

- Next.js frontend and local API routes.
- SQLite or another explicit SSA-owned database.
- Worker scripts started directly by SSA.
- LLM APIs through small provider adapters.
- Human approval state stored by SSA.

SSA runtime must not depend on OpenClaw, Hermes, PHOENIX, Codex, or any agent framework. Those tools may supervise development, generate suggestions, or run operator workflows, but SSA must still run without them.

## OpenClaw-for-Sales Direction

SSA should become the sales-specific operating layer that OpenClaw used to provide generically:

| OpenClaw Primitive | SSA Sales OS Primitive |
| --- | --- |
| Skills | Sales packs |
| Agent tasks / cron jobs | Runtime jobs and worker scripts |
| Exec approvals | Side-effect decisions and approval records |
| Workspace memory/context | SSA-owned sales memory |
| Agent supervision UI | Battle Station cockpit and focus mode |
| Model provider runtime | LLM provider adapters |

The runtime exposes this contract at:

```bash
GET /api/runtime?action=manifest
```

That manifest is the current source of truth for implemented capabilities and remaining gaps.

## Data Locations

Use `SSA_DATA_ROOT` when a custom runtime data directory is needed. If it is not set, SSA code should use:

```bash
~/.ssa/data
```

Recommended local paths:

- Farreach company data: `~/.ssa/data/companies/farreach/`
- Hero Pumps company data: `~/.ssa/data/companies/hero-pumps/`
- Runtime job queue: `~/.ssa/data/runtime/ssa-runtime.db`
- Logs: `~/.ssa/logs/`
- Temporary experiments: `~/.ssa/tmp/`

Company folders are the default home for business material:

```bash
~/.ssa/data/companies/<workspace>/inbox/
~/.ssa/data/companies/<workspace>/mail/
~/.ssa/data/companies/<workspace>/leads/
~/.ssa/data/companies/<workspace>/documents/
~/.ssa/data/companies/<workspace>/quotations/
~/.ssa/data/companies/<workspace>/intelligence/
~/.ssa/data/companies/<workspace>/memory/
~/.ssa/data/companies/<workspace>/approvals/
~/.ssa/data/companies/<workspace>/events/
~/.ssa/data/companies/<workspace>/operator-commands/
```

`~/.ssa/data/runtime/ssa-runtime.db` is a shared local scheduler index. Runtime rows carry `workspace_id`; company artifacts and customer-facing material stay under `companies/<workspace>/`.

## Standalone Workers

SSA workers must be runnable without Hermes or OpenClaw. The first mailbox worker is:

```bash
node scripts/workers/inbox-monitor.mjs --workspace farreach
node scripts/workers/inbox-monitor.mjs --workspace hero-pumps
node scripts/workers/inbox-monitor.mjs --workspace farreach --source himalaya --himalaya-account farreach
```

The worker supports two read-only source modes:

- `local`: reads optional local scan input from:

```bash
~/.ssa/data/companies/<workspace>/inbox/incoming.json
~/.ssa/data/companies/<workspace>/inbox/incoming.jsonl
```

- `himalaya`: runs `himalaya envelope list --account <account> --folder INBOX --output json`, then records only normalized envelope metadata in SSA state/events.

It writes dedupe state to:

```bash
~/.ssa/data/companies/<workspace>/inbox/monitor-state.json
```

and writes runtime events to:

```bash
~/.ssa/data/companies/<workspace>/events/events.json
```

The worker never sends email and does not call OKKI, Feishu, payment, bank, or customer-facing APIs. Himalaya mode performs a read-only mailbox listing through the local Himalaya CLI config. Any future send/reply/write adapter must go through the side-effect gate and explicit runtime flags before any external call.

Hermes may optionally call the compatibility wrappers:

```bash
bash farreach/scripts/inbox-monitor-scan.sh
bash hero-pumps/scripts/inbox-monitor-scan.sh
```

Those wrappers delegate to the SSA-owned worker. They are not the source of runtime behavior.

The wrappers default to `--source himalaya`; set `SSA_INBOX_SOURCE=local` when a local-only dry run is needed.

## Side Effect Policy

External side effects are blocked by default. Do not call real OKKI, SMTP, IMAP, Feishu, payment, bank, or customer-facing APIs unless Wilson explicitly enables the matching runtime flag.

Examples:

- `SSA_ENABLE_REAL_IMAP=true`
- `SSA_ENABLE_REAL_EMAIL_SEND=true`
- `SSA_ENABLE_REAL_CRM_WRITE=true`
- `SSA_ENABLE_REAL_FEISHU=true`
- `SSA_ENABLE_REAL_PAYMENT=true`
- `SSA_ENABLE_REAL_BANK=true`

Human approval in the UI is not enough by itself. Real execution still requires the explicit environment flag and an adapter that checks the side-effect gate.

## Hermes / Operator Tool Rules

Hermes and other operator tools must not write generated data into this repo. Before writing any file, classify it:

- Source code, docs, templates, tests, and intentional fixtures may live in the repo.
- Runtime output, generated reports, mailbox scans, news data, intelligence data, screenshots, cache files, temporary HTML/PDF/CSV/JSON, and logs must live under `~/.ssa`, normally under `~/.ssa/data/companies/<workspace>/...` when they belong to a company.

Run this before and after Hermes work:

```bash
scripts/check-repo-boundary.sh
```

The check fails if common generated/runtime artifacts appear as dirty files in the repo.

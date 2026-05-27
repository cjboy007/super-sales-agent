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

## Data Locations

Use `SSA_DATA_ROOT` when a custom runtime data directory is needed. If it is not set, SSA code should use:

```bash
~/.ssa/data
```

Recommended local paths:

- Intelligence/news/trade data: `~/.ssa/data/intelligence/`
- Farreach runtime data: `~/.ssa/data/farreach/`
- Hero Pumps runtime data: `~/.ssa/data/hero-pumps/`
- Mailbox scans and IMAP output: `~/.ssa/data/mail/`
- Generated quotes/documents: `~/.ssa/data/documents/`
- Logs: `~/.ssa/logs/`
- Temporary experiments: `~/.ssa/tmp/`

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
- Runtime output, generated reports, mailbox scans, news data, intelligence data, screenshots, cache files, temporary HTML/PDF/CSV/JSON, and logs must live under `~/.ssa`.

Run this before and after Hermes work:

```bash
scripts/check-repo-boundary.sh
```

The check fails if common generated/runtime artifacts appear as dirty files in the repo.

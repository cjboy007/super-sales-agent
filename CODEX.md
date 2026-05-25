# Historical note

SSA is no longer using Codex as the primary development execution workflow. The active workflow is Claude Code MCP. See `CLAUDE.md` and `docs/CLAUDE-MCP-MIGRATION-PLAN-2026-05-15.md`.

---

# CODEX.md

## Project

Super Sales Agent, abbreviated SSA.

Primary repository:

```text
/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent
```

This is the only Codex working directory unless Jaden or PHOENIX explicitly says otherwise.

## Operating role

Codex is the development execution layer for SSA.

Codex may:

- inspect source code
- propose architecture changes
- edit scoped files
- add or update tests
- run local verification commands
- update technical documentation

Codex must not take over OpenClaw orchestration, memory, reminders, Feishu approval, production alerts, or deployment confirmation.

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

Do not modify production servers.

Forbidden without explicit Jaden approval:

- SSH to `qwensales.com`
- running files under `deploy/` that provision, deploy, restart, rollback, or change production
- PM2 restart on production
- Nginx config changes on production
- deleting files or directories
- Git history rewrite
- force push
- credential migration
- sending emails to real customers
- calling real OKKI, SMTP, IMAP, Feishu, payment, or bank APIs

If a task needs any item above, stop and ask PHOENIX or Jaden for approval.

## Repository map

Important directories:

```text
web-frontend/       Next.js web app
skills/             Sales automation skills
scripts/            Utility scripts
tests/              Test plans, fixtures, and test runner
deploy/             Production deployment scripts, approval required
farreach/           Business automation modules
hero-pumps/         Hero Pump campaign system
shared/             Shared runtime modules
docs/               Architecture and migration documents
```

There is also a Phoenix-side SSA copy:

```text
/Users/wilson/.openclaw/agents/phoenix/workspace/monorepo/super-sales-agent
```

Treat it as a source for comparison only. Do not use it as the working repository unless explicitly instructed.

## Default workflow

Before editing:

1. Confirm current directory is the primary repository.
2. Inspect `git status --short`.
3. Identify the smallest safe edit scope.
4. Avoid unrelated formatting churn.

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

If a command is missing or broken, do not invent success. Report the blocker and suggest a minimal fix.

## Output format for every Codex task

```text
## Execution Complete
- What changed:
- Files changed:
- Verification:
- Risks:
- Rollback:
- Next step:
```

## Migration status

Current approved phase: Phase 0 and Phase 1 only.

Allowed now:

- baseline documentation
- Codex working rules
- sensitive path list without reading contents
- migration plan copy under docs

Not allowed yet:

- cleaning `.next/` Git index
- merging Phoenix-side SSA copy
- deleting files
- production deploy
- server changes

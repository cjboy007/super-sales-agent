# CLAUDE.md

## Project

Super Sales Agent, abbreviated SSA.

Primary repository:

```text
/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent
```

This is the only working repository unless Jaden or PHOENIX explicitly says otherwise.

## Role

Claude Code is the development execution layer for SSA.

Claude may:

- inspect source code
- propose implementation plans
- edit scoped files after approval or when the task explicitly allows edits
- run local verification commands
- update technical documentation
- add tests or improve test runners

OpenClaw remains responsible for orchestration, memory, reminders, Feishu review, health checks, and user-facing coordination.

PHOENIX remains responsible for safety review, migration diagnosis, and final verification.

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

If a task needs any forbidden action, stop and ask PHOENIX or Jaden.

## Repository map

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

There is a Phoenix-side SSA copy:

```text
/Users/wilson/.openclaw/agents/phoenix/workspace/monorepo/super-sales-agent
```

Treat it as reference material only. Do not use it as the working repository unless explicitly instructed.

## Frontend preference

Use Tailwind CSS for frontend styling when the existing app supports it. Avoid introducing plain vanilla CSS unless the local codebase already requires it.

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

## Current migration decision

SSA development execution is moving to Claude Code MCP workflow.

Codex migration documents are retained as historical baseline only.

Current allowed phase:

- create and update Claude workflow docs
- run Claude Code in plan mode for diagnosis
- run local read-only inspections

Not allowed yet:

- project-wide refactor
- merging Phoenix-side SSA copy
- deleting files
- cleaning Git index
- production deployment
- server changes

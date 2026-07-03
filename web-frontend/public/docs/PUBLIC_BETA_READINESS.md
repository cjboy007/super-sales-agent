# Super Sales Agent — Deployment Guide

Super Sales Agent is an open-source sales CRM and agent cockpit.
It contains customer records, mailbox metadata, generated documents, and side-effect approvals.
Treat it as a customer-data application and secure accordingly.

## Quick Start

```bash
# 1. Copy the example environment file
cp deploy/.env.example deploy/.env

# 2. Fill in at minimum: DEEPSEEK_API_KEY (or OPENAI_API_KEY / OPENROUTER_API_KEY)
#    and optionally IMAP/SMTP credentials if you want live email.

# 3. Set a persistent data root outside the repository
export SSA_DATA_ROOT=/var/www/ssa/shared/data   # or any writable path

# 4. Start the app
cd web-frontend && npm install && npm run dev
```

No activation code, phone verification, or beta token is required.
The app opens directly to the onboarding wizard on first run.

## LLM Provider Setup

Set exactly one of these in your `.env` file:

```bash
DEEPSEEK_API_KEY=sk-...           # Recommended: cheapest, fastest for sales tasks
OPENAI_API_KEY=sk-...             # OpenAI-compatible endpoint
OPENROUTER_API_KEY=sk-or-v1-...  # Routes to any model via OpenRouter
```

Without a key the runtime falls back to a local mock that returns canned responses.
The mock is useful for UI testing but cannot do real agent work.

Optionally override the model:

```bash
SSA_LLM_MODEL=deepseek-v4-flash   # default when using DeepSeek
```

## Worker / Scheduler Setup

The background task runner (`shared/worker.js`) picks up scheduled follow-ups,
syncs mailboxes, and runs automation jobs. Start it separately:

```bash
node shared/worker.js
```

Or use PM2 for production:

```bash
pm2 start ecosystem.config.js
```

## Side-Effect Safety Gate

All destructive actions — sending email, writing CRM records, generating invoices,
processing payments — require a human approval marker before execution.
This gate is **preserved** and cannot be bypassed from the UI.

Enable real side-effects only after review:

```bash
SSA_ENABLE_REAL_EMAIL_SEND=false      # flip to true when SMTP is confirmed
SSA_ENABLE_REAL_IMAP=false            # flip to true to enable inbox sync
SSA_ENABLE_REAL_CRM_WRITE=false       # flip to true for live CRM writes
SSA_ENABLE_REAL_FEISHU=false          # Feishu / Lark integration
SSA_ENABLE_REAL_PAYMENT=false         # payment adapter
```

Leave all false for a read-only demo or first-run evaluation.

## Deployment Readiness Checklist

Open `/health` in the browser to see a live readiness panel. It checks:

- LLM provider responds (not mock)
- Mailbox account configured (IMAP reachable if enabled)
- Worker process alive
- Data root writable

All green = ready for live customer work.

## Data Root

Runtime state lives outside the repository at `SSA_DATA_ROOT`.
Default: `~/.ssa/data/` in development, `/var/www/ssa/shared/data` in production.

Never commit this directory. It contains:

- `config.json` — LLM API key, email credentials
- `crm.db` — customer database (SQLite)
- `security/` — session tokens and audit log

## Security Notes

- Set `chmod 600 deploy/.env` in production.
- Rotate `SSA_API_KEY` and `SSA_OBS_API_KEY` before exposing the backend port.
- `HEADLESS_API_KEY` should be a long random string if the headless worker is exposed.
- Never store API keys in the repository. Use `SSA_DATA_ROOT/config.json` or `.env`.

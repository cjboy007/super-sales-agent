# Super Sales Agent — Pre-Alpha Bug & Issue Report

**Date:** 2026-06-11
**Reviewer:** Kiro (automated code review)
**Scope:** Full monorepo (`super-sales-agent/`) — runtime, skills, scripts, web-frontend, shared modules

---

## CRITICAL (data loss, money errors, security)

### 1. SMTP password committed to git and pushed to GitHub

**Location:** `hero-pumps/archive/2026-04-22-old-data/test-smtp.js:9`

A real SMTP password was tracked in git and pushed to `origin/main`. Anyone with repo access could read the production mail credentials. The password must be rotated immediately, and the file must be purged from history (BFG or `git filter-repo`).

### 2. Real bank account numbers committed to public-facing repo

**Location:** `config/bank-accounts.json`

Full ICBC and HSBC bank details (account numbers, SWIFT codes) are tracked in git on a GitHub repo. If the repo ever becomes public or is cloned by unauthorized parties, your banking details are exposed. These should live in a secrets manager or at minimum an untracked file.

### 3. Payment-notice generator defaults to WRONG (legacy) bank account

**Location:** `skills/payment-notice-workflow/scripts/generate_payment_notice.py:66-72`

When `bank_info` is missing from input data, the fallback is the **legacy HSBC** account (marked `active: false` in the config). The primary ICBC account is never mentioned as a default here. A customer receiving this notice would wire money to the wrong bank.

### 4. customer_stages table UNIQUE constraint scoped to email alone, not (project, email)

**Location:** `shared/sales-state-db.js:61`

`email TEXT NOT NULL UNIQUE` means two workspaces (farreach, hero-pumps) sharing the same DB cannot have the same customer email. The `ON CONFLICT(email)` upsert at line 112 will silently overwrite farreach customer data with hero-pumps data if the same address appears in both.

### 5. Shell injection in follow-up engine (Farreach path)

**Location:** `shared/follow-up-engine.js:228`

The subject and body are interpolated into a shell command string with only double-quote escaping. A customer name or email subject containing backticks, `$(...)`, or `"` sequences can execute arbitrary commands. Uses `exec()` (shell) instead of `execFile()` (no shell).

### 6. Approval tokens are never consumed or invalidated after use

**Location:** `skills/approval-engine/src/approval-store.js`

`getApproval()` simply returns the record; nothing marks it as "used." The same approval ID can be replayed indefinitely to send the same (or different) emails through `verifyApprovalToken` and `verifyLegacyOutboundSafety`, bypassing the intended one-shot gate.

---

## HIGH (broken functionality, duplicate sends, data corruption)

### 7. Scheduler drops confirmSend and approvalId — scheduled emails become drafts

**Location:** `skills/imap-smtp-email/lib/scheduler.js:34-41`

`serializeMailOptions()` preserves `from`, `to`, `subject`, `body`, etc., but omits `confirmSend` and `approvalId`. When `processScheduledFile` later calls `sendEmail(record.mailOptions)`, the missing flags cause the email to be saved as a draft instead of actually sent — silently failing the user's intent.

### 8. Bank config can diverge between quotation-workflow and payment-notice

**Location:** `scripts/sync-bank-config.sh`

Documents a manual `cp` sync. The quotation generator reads from `config/bank-accounts.json` (via `bank-config.js`), but the payment-notice generator uses its own hardcoded defaults (HSBC). There is no automated check that all document generators use the same current bank account. If the sync is forgotten, customers receive documents with conflicting bank details.

### 9. Farreach reply-processor has a broken IMAP_CLI path

**Location:** `farreach/reply-processor.js:23`

Path is `/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/scripts/imap.js` — this file does not exist (the correct path is under `monorepo/super-sales-agent/skills/...`). The farreach reply-processor will crash on every invocation.

### 10. Inbox monitor `seen` state grows unbounded

**Location:** `scripts/workers/inbox-monitor.mjs:571`

Every processed email is added to `state.seen` but there is no pruning, TTL, or max-size logic. Over months of production use, the JSON state file will grow to hundreds of thousands of entries, increasingly slowing down reads/writes and eventually causing OOM or very long startup delays.

### 11. Inbox monitor state writes are non-atomic and racy

**Location:** `scripts/workers/inbox-monitor.mjs:581`

`writeJson(stateFile, state)` does a plain `fs.writeFileSync` to the same path. If the process crashes mid-write (or two workers run concurrently for the same workspace), the state file can be truncated/corrupted, causing already-processed emails to be reprocessed (duplicate CRM entries).

### 12. shared/reply-processor.js and farreach/reply-processor.js have diverged

These are two copies of the same module with different IMAP paths, different intent rules, different state file locations, and different feature sets. There is no mechanism to detect or prevent further drift. Bugs fixed in one won't be fixed in the other.

### 13. Pre-send validator only checks domain match, not full recipient identity

**Location:** `scripts/pre-send-validator.js:79`

The validator compares email domains (e.g., `@company.com`), not full addresses. If two different contacts at the same company exist, sending a quote meant for contact A to contact B's address passes validation silently.

### 14. Pricing engine uses floating-point arithmetic for money

**Location:** `skills/pricing-engine/scripts/pricing-engine.js:449-462`

All price calculations use native JS floating-point (`*`, `+`, `/`). While `roundTo` helps for display, intermediate calculations accumulate errors. For large orders (thousands of units × multi-decimal unit prices), the total can be off by cents. Financial software should use integer-cent math or a Decimal library.

---

## MEDIUM (operational issues, defense-in-depth gaps, correctness)

### 15. No noreply/bounce/mailing-list guard in the email decision policy

**Location:** `skills/imap-smtp-email/lib/email-decision-policy.js`

The spam filter checks `intent === 'spam'` but there is no explicit blocklist for `noreply@`, `mailer-daemon@`, `no-reply@`, or emails with `List-Unsubscribe` / `Auto-Submitted` headers. The system could auto-reply to bounce notifications, creating loops.

### 16. confirm-before-send.js is advisory only — not enforced in the send path

**Location:** `scripts/confirm-before-send.js`

Prints info and asks for terminal confirmation, but it is a standalone CLI script. The actual `sendEmail()` in `email-sender.js` never calls it. An automated agent or API call bypasses this entirely. The name implies it's a gate, but it's decorative.

### 17. Quotation/PI HTML generators do not escape customer-provided values

**Location:** `skills/pi-workflow/scripts/generate_pi.py`, `skills/quotation-workflow/scripts/generate_quotation_html.py`, `skills/payment-notice-workflow/scripts/generate_payment_notice.py`

Customer names, addresses, and product descriptions are interpolated directly into HTML f-strings without `html.escape()`. If customer data contains `<script>` or `<img onerror=...>`, the generated PDF/HTML can execute scripts when previewed in a browser.

### 18. SQLite task queue uses execFileSync for every DB operation

**Location:** `web-frontend/src/lib/runtime/task-queue.ts:307-322`

Every `exec()` and `query()` spawns a new `sqlite3` subprocess. This means no connection pooling, no prepared statements, and no transactional guarantees between the claim query and the subsequent `get`. Under load, the fork overhead will dominate latency and may hit file-descriptor or process limits.

### 19. placeholder@reply.local used as fallback recipient in reply commands

**Location:** `skills/imap-smtp-email/scripts/smtp.js:332,348`

The `reply` and `reply-all` commands use `to: options.to || 'placeholder@reply.local'` and then proceed through `prepareSendOptions` and `sendEmail`. If the reply-to lookup fails to override `to`, the email is sent (or draft-saved) addressed to a non-existent address, wasting the approval flow.

### 20. balance_due not validated against total_amount - deposit_amount

**Location:** `skills/payment-notice-workflow/scripts/generate_payment_notice.py:63`

`balance_due = payment.get('balance_due', total_amount)` trusts the caller. If the caller provides inconsistent numbers (balance_due ≠ total - deposit), the notice shows a wrong balance. There is no cross-check.

### 21. Exchange-rate stale cache used silently on API failure

**Location:** `skills/pricing-engine/scripts/exchange-rate.js:204-206`

When the rate API fails, the system silently uses a potentially days-old cached rate without flagging it to the caller. A quotation generated during an API outage may use yesterday's rate, which could be significantly off for volatile pairs.

### 22. BankConfig Python singleton caches forever — never sees config file changes

**Location:** `scripts/bank_config.py:65-66`

Once `self._config` is loaded, `load()` returns the cached value on every subsequent call. In a long-running process, if the bank config is updated on disk, the Python module continues using stale data until process restart. The JS version has the same issue (`scripts/bank-config.js:28`).

### 23. Middleware skips all /api/ routes — API auth relies solely on per-route checks

**Location:** `web-frontend/src/middleware.ts:7`

The Next.js middleware explicitly passes through all `/api/*` paths without any token check. Authentication is left to each individual route handler calling `requireWorkspaceAccess`. If a developer adds a new API route and forgets to add the auth call, it's open to anyone.

---

## LOW (maintainability, robustness)

### 24. Hardcoded absolute paths throughout the codebase

**Location:** `shared/follow-up-engine.js:27-28,32,36`, `shared/reply-processor.js:25`

Paths like `/Users/wilson/.openclaw/workspace/monorepo/...` are baked in. The project cannot run on any other machine, CI, or deployment without editing these.

### 25. hero-pumps/.env is gitignored but config/bank-accounts.json is not

The `.gitignore` correctly blocks `*.env` but explicitly tracks the bank config JSON. This is inconsistent — the bank config is arguably more sensitive (it's customer-facing financial data).

### 26. crm-ui/tsconfig.tsbuildinfo committed to git

**Location:** `crm-ui/tsconfig.tsbuildinfo`

This is a build artifact that changes on every compile and creates noisy diffs. Should be gitignored.

### 27. No rate-limiting on the follow-up engine batch loop

**Location:** `shared/follow-up-engine.js:363-364`

The delay between sends is 2-3 minutes (random). But there's no overall daily cap. If the DB accumulates hundreds of due follow-ups, the engine will send them all in one long run, potentially triggering provider rate limits or spam flags.

### 28. hero-pumps/orchestrator creates a new SMTP transporter per email

**Location:** `hero-pumps/orchestrator/hero-orchestrator.js:202,208`

`createHeroTransporter()` + `transporter.close()` on every single send. This defeats connection pooling and forces a TLS handshake per email, making batch sends slow and fragile under load.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 8 |
| Medium | 9 |
| Low | 5 |
| **Total** | **28** |

## Recommended Fix Priority (before alpha)

1. **Rotate leaked SMTP credential** (#1) — immediate
2. **Fix payment-notice bank default** (#3) — one-line fix, high impact
3. **Fix customer_stages UNIQUE to (project, email)** (#4) — schema migration
4. **Replace shell exec with execFile** (#5) — security
5. **Make approval tokens single-use** (#6) — add `consumed_at` field
6. **Remove/untrack bank-accounts.json from git** (#2) — move to secrets
7. **Add confirmSend/approvalId to scheduler serialization** (#7)
8. **Fix broken farreach IMAP_CLI path** (#9)

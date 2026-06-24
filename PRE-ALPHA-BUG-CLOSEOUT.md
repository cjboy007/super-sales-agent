# Pre-Alpha Bug Closeout

Date: 2026-06-24

This note closes the remaining open items from `PRE-ALPHA-BUG-REPORT.md` against the current working tree. Items that require external action are called out separately because repo edits cannot rotate credentials or rewrite remote history safely from this workspace.

## Remaining Items

| Item | Status | Evidence |
| --- | --- | --- |
| #1 SMTP password exposure | Current tree fixed; external action required | `hero-pumps/archive/2026-04-22-old-data/test-smtp.js` now reads `HERO_PUMPS_SMTP_PASS` / `SMTP_PASS` from env. Secret scan found no hardcoded SMTP password in the checked runtime/config surface. Still required outside this repo: rotate the previously exposed SMTP credential and purge the old secret from GitHub history with an approved history-rewrite process. |
| #2/#25 Bank account exposure | Current tree fixed; external action required | `config/bank-accounts.json` contains placeholders only. `.gitignore` keeps `config/bank-accounts.local.json` untracked and bank loaders support `SSA_BANK_ACCOUNTS_PATH`. Numeric bank-account scan found no real account number in tracked config/runtime files. Still required outside this repo: treat any previously exposed real account data as historical exposure and remove it from remote history if this repo will be shared. |
| #6 Approval replay | Fixed | `skills/imap-smtp-email/lib/outbound-safety.js` now consumes approved `email.send` side-effect decisions by marking them `executed` before real send proceeds. Legacy approval-store IDs are rejected by the real send gate. Covered by parent-visible `tests/pre-alpha-approval-replay.test.js` plus `skills/imap-smtp-email/test/outbound-safety.test.js` and `skills/imap-smtp-email/test/email-sender-approval-token.test.js`. Note: `skills/imap-smtp-email` is tracked by the parent repo as a gitlink-style nested tree, so its internal file changes must be carried with that nested tree. |
| #11 Inbox monitor race/corruption | Fixed | `scripts/workers/inbox-monitor.mjs` writes state atomically and now uses a per-workspace lock file with stale-lock handling. Covered by `scripts/workers/inbox-monitor.test.mjs`. |
| #12 Reply processor drift | Fixed | `farreach/reply-processor.js` now delegates to `../shared/reply-processor` instead of carrying a divergent copy. Covered by `tests/pre-alpha-reply-processor-drift.test.js`. |
| #14 Pricing money math | Fixed | `skills/pricing-engine/scripts/pricing-engine.js` now uses scaled integer helpers for customer-facing totals and batch sums. Covered by `skills/pricing-engine/test/pricing-money-math.test.js`. |
| #18 Runtime task queue SQLite subprocess model | Bounded pre-alpha mitigation | `web-frontend/src/lib/runtime/task-queue.ts` still uses the sqlite3 CLI, but `claimNext()` now returns the full `UPDATE ... RETURNING *` row instead of claiming then doing a second lookup. Covered by `web-frontend/src/lib/runtime/task-queue.test.ts`, including a test that fails if a post-claim read is used. |
| #21 Exchange-rate stale cache | Fixed | Pricing now uses `getRateWithMeta()` for formula and override currency conversion, and propagates stale-rate warning metadata to pricing results. Covered by `skills/pricing-engine/test/pricing-exchange-rate-warning.test.js`. |
| #23 API auth middleware gap | Guarded | Middleware still excludes `/api/*`, but `web-frontend/src/app/api/api-auth-coverage.test.ts` scans every API route and fails unless it uses a recognized auth/signed-public marker or is an explicit public exception. |
| #24 Hardcoded absolute paths | Runtime fixed | Runtime scripts named in the original report and additional scanned runtime scripts now use repo-relative paths or env overrides. Covered by `tests/pre-alpha-runtime-paths.test.js`. Historical docs, archived task records, and audit metadata still contain local paths and are non-runtime cleanup debt. |
| #26 `crm-ui/tsconfig.tsbuildinfo` tracked | Fixed | Removed from Git index with `git rm --cached crm-ui/tsconfig.tsbuildinfo`; `.gitignore` already contains `*.tsbuildinfo`. `git ls-files '*.tsbuildinfo'` returns no tracked build-info files. |
| #27 Follow-up daily cap | Fixed | `shared/follow-up-engine.js` applies `SSA_FOLLOW_UP_DAILY_CAP`, project config, or default cap `25`, and supports `--daily-cap`. Covered by `shared/follow-up-engine.test.js`. |

## Verification Run

- `node --test tests/pre-alpha-approval-replay.test.js scripts/workers/inbox-monitor.test.mjs shared/follow-up-engine.test.js tests/pre-alpha-reply-processor-drift.test.js tests/pre-alpha-runtime-paths.test.js skills/pricing-engine/test/pricing-money-math.test.js skills/pricing-engine/test/pricing-exchange-rate-warning.test.js`
- `node --test skills/imap-smtp-email/test/outbound-safety.test.js skills/imap-smtp-email/test/email-sender-approval-token.test.js`
- `cd web-frontend && npm test -- src/lib/runtime/task-queue.test.ts src/app/api/api-auth-coverage.test.ts`
- `git ls-files hero-pumps/archive/2026-04-22-old-data/test-smtp.js config/bank-accounts.json crm-ui/tsconfig.tsbuildinfo '*.tsbuildinfo'`
- SMTP credential scan across `hero-pumps`, `config`, `skills`, `scripts`, `shared`, and `web-frontend/src`
- Bank-account-number scan across `config`, `scripts`, `skills`, `shared`, and `web-frontend/src`

## External Required

The local repo cannot prove historical remediation for #1 and #2/#25. Before any public or broader repo sharing:

1. Rotate the exposed SMTP/app password in the email provider.
2. Rewrite/purge GitHub history containing the old SMTP secret and real bank details with an approved BFG or `git filter-repo` workflow.
3. Invalidate old clones or notify anyone with access to historical snapshots.

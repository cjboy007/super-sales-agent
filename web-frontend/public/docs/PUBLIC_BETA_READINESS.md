# Super Sales Agent Public Beta Readiness

Super Sales Agent can be piloted as a controlled sales CRM and agent cockpit. Treat
it as a customer-data application: it contains customer records, mailbox metadata,
generated documents, customer activity, order status, and side-effect approvals.

## Required Environment

Set a persistent runtime data root before starting the app:

```bash
export SSA_DATA_ROOT="$HOME/.ssa/data"
```

Runtime files stay under:

- `~/.ssa/data/config.json` for local settings.
- `~/.ssa/data/runtime/ssa-runtime.db` for queued runtime jobs.
- `~/.ssa/data/companies/<workspace>/` for leads, documents, mail logs, events,
  memory, approvals, generated files, recent intake sessions, and uploads.
- `~/.ssa/logs/` for process logs and legacy watcher logs.

The Jaden/CRM worker and the legacy IMAP watcher both resolve runtime output
from `SSA_DATA_ROOT` by default. They should not write mailbox archives,
decision records, worker state, or intelligence files back into the repository.

The repo boundary check should remain clean after normal usage:

```bash
scripts/check-repo-boundary.sh
```

## Beta Auth

Local development stays open when no beta auth or phone trial mode is configured.
For the hosted experience page, prefer phone-based trial access. A verified
mainland China mobile number receives one 14-day trial. The browser keeps a
secure trial session cookie until the original trial expiry, so users do not
need an SMS code on every visit. If the cookie is cleared or the user changes
devices, another SMS verification restores the same trial window and does not
reset the 14-day clock.

Small-server defaults should be conservative:

```bash
export SSA_TRIAL_ACCESS_ENABLED=true
export SSA_TRIAL_DAYS=14
export SSA_TRIAL_EXPIRED_CONTACT_PHONE=1xxxxxxxxxx
export SSA_TRIAL_DAILY_NEW_USERS_LIMIT=5
export SSA_TRIAL_MAX_ACTIVE_USERS=30
export SSA_TRIAL_SMS_COOLDOWN_SECONDS=60
export SSA_TRIAL_SMS_PHONE_DAILY_LIMIT=3
export SSA_TRIAL_SMS_IP_DAILY_LIMIT=10
export SSA_TRIAL_HEAVY_DAILY_LIMIT=20
```

Use `SSA_TRIAL_REGISTRATION_ENABLED=false` to stop new trial signups without
turning off existing valid trial sessions. Use `SSA_TRIAL_READ_ONLY=true` as an
operator switch for deployments that need to keep the experience available while
real writes and heavy work are paused.

Aliyun SMS credentials stay in runtime environment variables only. Prefer
Aliyun PNVS SMS verification for a no-qualification trial login:

```bash
export SSA_TRIAL_SMS_PROVIDER=aliyun-pnvs
export ALIYUN_PNVS_ACCESS_KEY_ID="..."
export ALIYUN_PNVS_ACCESS_KEY_SECRET="..."
export ALIYUN_PNVS_SIGN_NAME="gifted-system-sign-name"
export ALIYUN_PNVS_TEMPLATE_CODE="gifted-system-template-code"
export ALIYUN_PNVS_REGION_ID=cn-hangzhou
```

The PNVS path uses Aliyun `SendSmsVerifyCode` and `CheckSmsVerifyCode`.
`TemplateParam` defaults to `{"code":"##code##","min":"5"}` so Aliyun generates
and verifies the code. If the gifted template uses different variables, set
`ALIYUN_PNVS_TEMPLATE_PARAM_JSON` to the exact JSON required by that template.

The older `SSA_TRIAL_SMS_PROVIDER=aliyun` path uses standard SMS `SendSms`. For
mainland China standard SMS, the Aliyun account must first have an approved SMS
qualification, then an approved signature, then an approved verification-code
template bound to that signature. The app cannot send real standard SMS until
both `ALIYUN_SMS_SIGN_NAME` and `ALIYUN_SMS_TEMPLATE_CODE` are approved values.

The SMS template should only include the verification code and a short product
purpose. Do not place the local deployment contact phone in the SMS template;
the app shows `1xxxxxxxxxx` on expired, full, or closed trial states.

Trial records, SMS challenges, sessions, and usage quota counters are stored in
`SSA_DATA_ROOT/security/trial-access.json` with owner-only permissions. OTP
responses never return the code. In local tests, set `SSA_TRIAL_SMS_PROVIDER=mock`
to avoid sending real SMS.

Legacy beta access tokens are still supported for private self-hosted or admin
deployments. For any external beta deployment that uses tokens, configure at
least one server-side token. The preferred self-hosted path is to generate a
runtime token file outside the repository:

```bash
node scripts/configure-beta-access.mjs create \
  --name acme-alpha \
  --workspaces acme-alpha

node scripts/configure-beta-access.mjs status
```

The `create` command prints the new token once so it can be shared with the
intended beta users. For closed alpha, create one non-wildcard workspace token
per external company or user. Do not share a `farreach`, `hero-pumps`, or
wildcard token with normal alpha users. The `status` command only reports token
names and workspace scopes. The saved file lives under
`SSA_DATA_ROOT/security/beta-auth.json` with owner-only permissions, so it can be
rotated without changing product code.

For invite-style sharing, create a non-wildcard workspace pass with a redemption
limit. This lets one pass be shared by a small group while the beta access page
stops accepting it after the configured number of redemptions:

```bash
node scripts/configure-beta-access.mjs create \
  --name acme-alpha-invite \
  --workspaces acme-alpha \
  --max-redemptions 5
```

Redemption counts are stored under
`SSA_DATA_ROOT/security/beta-auth-redemptions.json` without saving the plaintext
pass.

When using this file-based setup for an external beta, also set
`SSA_BETA_AUTH_REQUIRED=true` so protected pages route first-time visitors to
`/beta-access` before any CRM screen renders. API requests still validate the
actual token on the server against the runtime token file.

Environment tokens are also supported for hosted deployments:

```bash
export SSA_BETA_AUTH_TOKENS='[
  {"name":"acme-alpha","token":"replace-with-long-random-token","workspaces":["acme-alpha"],"maxRedemptions":5},
  {"name":"ops-admin","token":"replace-with-admin-token","workspaces":["*"]}
]'
```

Clients send `Authorization: Bearer <token>`. Scoped tokens can only read and
mutate their allowed workspaces. Admin operations such as settings require a
wildcard token. The token creation script refuses wildcard workspaces unless
`--allow-wildcard` or `--admin` is passed explicitly:

```bash
node scripts/configure-beta-access.mjs create \
  --name ops-admin \
  --workspaces '*' \
  --allow-wildcard
```

Legacy single-token self-hosting is still supported, but it grants wildcard
workspace access and must not be used for shared closed-alpha deployments:

```bash
export SSA_BETA_AUTH_TOKEN="replace-with-long-random-token"
```

When beta auth is configured, protected app pages route first-time visitors to
`/beta-access` before showing customer, inbox, quote, intelligence, settings, or
operations screens. The page stores the provided access token in the browser
session cookie so the existing workspace-scoped API gates can authorize data
requests. Local development remains open when no beta token is configured.

## LLM Setup

The web runtime is DeepSeek-first:

```bash
export SSA_LLM_PROVIDER=deepseek
export DEEPSEEK_API_KEY="sk-..."
export SSA_LLM_MODEL=deepseek-v4-flash
```

OpenRouter is also supported:

```bash
export SSA_LLM_PROVIDER=openrouter
export OPENROUTER_API_KEY="sk-or-..."
export SSA_LLM_MODEL=deepseek/deepseek-v4-flash
```

OpenAI remains available as a fallback by setting `SSA_LLM_PROVIDER=openai`,
`OPENAI_API_KEY`, and an OpenAI model such as `gpt-4o-mini`.

If `SSA_LLM_PROVIDER` is unset, SSA auto-detects `DEEPSEEK_API_KEY` first, then
`OPENAI_API_KEY`, then `OPENROUTER_API_KEY`. Without a supported key, it falls
back to the local mock LLM so the UI still works but responses are deterministic
placeholders.

## Production Start

The frontend is configured with Next standalone output. Build and start it with:

```bash
cd web-frontend
npm ci
npm run build
PORT=3000 HOSTNAME=0.0.0.0 npm run start:standalone
```

`npm run start` is still useful for local Next testing, but production should use
`npm run start:standalone`. The standalone script copies `.next/static` into the
standalone bundle before starting so browser assets are served correctly.

## Resident Worker

Run one resident Jaden/CRM worker per workspace under a process supervisor:

```bash
cd web-frontend
npm run worker

# or from the repo root
node scripts/workers/jaden-worker.mjs \
  --workspace farreach \
  --worker-id jaden-farreach-1 \
  --max-jobs 5 \
  --max-attempts 3 \
  --interval-ms 5000
```

The worker does three things on every tick:

- syncs new inbox email into customer CRM activity;
- extracts payment, shipment, refund, after-sales, and exception order signals
  from inbound mail into customer order activity;
- queues customer background-check jobs for newly discovered inbound customers;
- consumes persisted SQLite runtime jobs.

Task durability comes from `SSA_DATA_ROOT/runtime/ssa-runtime.db`. The worker
claims jobs with leases and records retries/failures, so a process restart does
not drop queued jobs. Dangerous actions still go through the side-effect gate,
so retrying a job cannot silently send real mail or write an external CRM unless
the matching real-action flag and approval flow are both satisfied.

Operational commands:

```bash
node scripts/workers/jaden-worker.mjs --workspace farreach --once
node scripts/workers/jaden-worker.mjs --status --worker-id jaden-farreach-1
curl http://127.0.0.1:3000/api/health
```

Generate a supervised resident-worker config before any external beta:

```bash
node scripts/workers/jaden-worker-supervisor.mjs generate \
  --platform launchd \
  --workspace farreach \
  --worker-id jaden-farreach-1 \
  --data-root "$SSA_DATA_ROOT"

# Linux servers
node scripts/workers/jaden-worker-supervisor.mjs generate --platform systemd --workspace farreach --worker-id jaden-farreach-1 --data-root "$SSA_DATA_ROOT"

# PM2-based deployments
node scripts/workers/jaden-worker-supervisor.mjs generate --platform pm2 --workspace farreach --worker-id jaden-farreach-1 --data-root "$SSA_DATA_ROOT"
```

The generator writes one supervisor config and one `*.supervisor.json` command
manifest. The config uses an always-restart policy, sets `SSA_DATA_ROOT`, starts
the worker on boot/load, and keeps logs under the runtime worker log folder. By
default generated files are written to `SSA_DATA_ROOT/runtime/supervisors`, not
the repo. The manifest contains the exact install, start, stop, restart,
supervisor-status, and worker-health commands for the selected platform. Use the
health command or `/api/health` to confirm the worker heartbeat after every
restart.

`/api/health` reports worker status, queue counts, failed-job alerts, beta auth
configuration, side-effect safety state, and a business-facing beta readiness
checklist. The checklist covers beta access control, first-run guidance,
resident worker health, worker recovery setup, customer starting data, mailbox
sync, customer activity, order timeline coverage, real-action safety, and
operator recovery. The resident worker health check confirms a fresh heartbeat
and healthy queue; the worker recovery check separately verifies that a reviewed
supervisor manifest exists for the workspace with an always-restart policy plus
start, stop, restart, and health controls. The mailbox sync check confirms that
incoming mail capture is configured, automatic capture is enabled, and the
worker has recently synced inbound mail into CRM. It also returns a first-run
guide with links for onboarding, demo data, email setup, customer import, and
customer CRM review. It intentionally does not return the runtime data root,
environment variable names, local paths, mailbox host/account details, worker
commands, worker job IDs, provider names, channel audit, or internal
document/order IDs.

Use `/agent-status` for operator recovery. It shows worker readiness, queue
counts, safety-gate state, the beta readiness checklist, the first-run path, and
a failed-work list with customer-facing labels, clean failure reasons, attempt
counts, and a retry action. The failed-work panel uses an opaque operation id for
the retry request; it does not show raw job IDs, workflow names, providers,
channel audit, or local paths.

## Side-Effect Safety

Real external side effects remain disabled unless the matching server-side flag
is explicitly set:

```bash
SSA_ENABLE_REAL_IMAP=true
SSA_ENABLE_REAL_EMAIL_SEND=true
SSA_ENABLE_REAL_CRM_WRITE=true
SSA_ENABLE_REAL_FEISHU=true
SSA_ENABLE_REAL_PAYMENT=true
SSA_ENABLE_REAL_BANK=true
SSA_ENABLE_REAL_DOCUMENT_GENERATION=true
SSA_ENABLE_REAL_DOCUMENT_PREVIEW=true
```

Real customer sends require three gates: the current explicit runtime flag, an
adapter that checks the side-effect gate, and an approved server-side
`email.send` side-effect decision ID that matches the recipient and subject. A
human approval marker in the browser request body is not trusted as execution
authorization. Cold outbound also requires Hunter verification to return
`valid`; risky, invalid, unknown, or missing verification blocks real send unless
the operator sets `SSA_ALLOW_UNVERIFIED_EMAIL_SEND=true` as an explicit emergency
override.

Real document generation uses the same approval model. Setting
`SSA_ENABLE_REAL_DOCUMENT_GENERATION=true` only makes the runtime eligible to
generate files; quotation, PI, CI, and PL generation still requires an approved
server-side `document.generate` decision ID that matches the requested customer,
document type, and document payload. Without that approved record, the request is
captured in the approval log and no file-generation script runs.

Older CLI/batch senders import the same outbound safety guard. They should not be
part of the public beta operator path; use the web review flow for real customer
sends so the approval, verification, and local audit trail stay together.

## Customer CRM Operating Path

External users should start from `/jadenos/onboarding`, then use:

- `/leads` for the customer list and customer detail view;
- `/inbox` for incoming email review and reply drafting;
- `/documents` and quote/PI flows for trade documents;
- `/agent-status` for worker health, queue readiness, failed-work review, and
  retry actions.

For a one-click first-run experience, seed demo data before inviting testers:

```bash
curl -X POST http://127.0.0.1:3000/api/demo/seed?project=farreach
```

After seeding, `/leads` should show demo customers, a primary contact, an inbound
email activity, and PI/order milestones. `/agent-status` should show which beta
readiness items are ready and which still need setup.

To prove the email-to-CRM path before a real mailbox is connected, use the
operator page or onboarding page to run one demo email drill. This writes a
local inbound order email into the customer timeline, contact list, order
milestones, and lifecycle status. It is intentionally marked as a local demo and
does not make the real mailbox-sync readiness gate ready; external beta still
requires connecting work email and seeing the resident worker sync fresh inbound
mail.

The customer detail view should stay business-facing: customer information,
primary contacts, background-check score/rating, recent orders, activity
timeline, and next-step suggestions. Backend path fields, channel audit, worker
details, `jobId`, provider names, and workflow internals belong only in runtime
logs or operations tooling.

Customer status is computed from CRM signals: archived override, background
risk, active order/PI/confirmed quote, inbound email, inactivity, and prospect
fallback. Status changes are represented in the customer timeline with a short
business explanation. Orders aggregate quotes, RFQs, and PI records, and PI
records emit payment, shipment, after-sales, refund, and exception timeline
events. Inbound order emails are also converted into CRM order activity, so a
new payment, shipment, refund, after-sales, or exception email can update the
customer timeline even before a formal PI record is imported.

Lifecycle rules are explicit and priority-based:

- manual overrides for `Prospect`, `Active Customer`, `Dormant`, `Risk`, and
  `Archived` outrank automation;
- archived/closed profiles move to `Archived`;
- background risk, red lines, overdue payment, or order exceptions move to
  `Risk`;
- PI/order, confirmed quote, active profile, or inbound customer email moves to
  `Active Customer`;
- inactive profile or 180-day inactivity moves to `Dormant`;
- otherwise the customer remains `Prospect`.

Each status explanation includes the rule id, priority, entry condition, exit
condition, signals, and whether a manual override was applied. Customer pages may
show these business explanations, but must not show job IDs, workflow internals,
providers, channel audit, or local paths.

## Readiness Gates

Run these before public beta deployment:

```bash
rm -rf web-frontend/.next
scripts/check-repo-boundary.sh
cd web-frontend
npm test
npm run lint
npm run build
npm audit --omit=dev --audit-level=moderate
```

Before opening an external beta, also verify:

- beta access is configured in the deployed runtime, either with
  `SSA_DATA_ROOT/security/beta-auth.json`, `SSA_BETA_AUTH_TOKENS`, or
  `SSA_BETA_AUTH_TOKEN`;
- `SSA_BETA_AUTH_REQUIRED=true` is set when beta access uses the runtime token
  file instead of environment tokens;
- visiting `/leads` without the beta access cookie routes to `/beta-access`, and
  a valid token opens the customer CRM without exposing setup details;
- at least one resident worker has a generated supervisor config, uses an
  always-restart policy, and is visible in `/api/health` as both a healthy
  resident worker and a ready worker recovery setup;
- work email is connected, automatic capture is enabled, and `/api/health`
  reports mailbox sync ready after the worker processes inbound mail;
- a fresh inbound email creates customer activity in the customer timeline;
- a fresh inbound order email creates payment/shipment/exception order activity
  in the customer timeline without exposing internal PI/QT/PO numbers;
- all `SSA_ENABLE_REAL_*` flags are unset unless the specific real adapter has
  been approved for the beta cohort;
- `/leads` renders without console errors and without exposing backend audit
  fields, local paths, worker/job details, or internal document/order IDs.

The dependency gate is expected to pass cleanly. Next is pinned to the patched
15.5.x line, and PostCSS is overridden to the patched 8.5.15 release so the
standalone production bundle does not retain the vulnerable nested PostCSS copy.

## Beta Limitations

The runtime manifest still marks these areas as beta limitations:

- Reusable sales tool registry is not complete.
- LLM provider registry and budget policy are not complete.
- Battle Station controls for scheduled playbooks are not complete.
- Self-serve account creation, password reset, and tenant billing are not part
  of this beta; use server-side beta tokens and workspace scopes.

These are not blockers for a controlled private/public beta if the beta promise
is "sales cockpit plus gated local workflows." They are blockers for a general
self-serve public launch.

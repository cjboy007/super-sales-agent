# SSA API for Agents

This document is for OpenClaw, Hermes, Codex, local workers, and any other agent that needs to call Super Sales Agent through HTTP.

SSA is a standalone sales runtime. Agents may supervise it, write local context into it, and call its API, but SSA must keep running without OpenClaw or Hermes.

## Runtime Contract

Base URL:

```text
http://localhost:<web-frontend-port>
```

In local development the usual command is:

```bash
cd web-frontend
npm run dev
```

All HTTP routes are under `/api/*`. The web app is a Next.js App Router server, so the API port is the same port as `web-frontend`.

Persistent runtime data is outside the repo:

```text
SSA_DATA_ROOT                    default: ~/.ssa/data
companies/<workspace>/           company-scoped data
runtime/ssa-runtime.db           SQLite runtime job queue
runtime/workers/*.json           worker heartbeat/status
runtime/supervisors/             generated supervisor configs
```

Built-in workspaces:

```text
farreach       Farreach Electronic, export B2B cables/electronics
hero-pumps     Hero Pump, export B2B circulator pumps
```

Always pass a workspace when calling from an external agent:

```text
GET  /api/customers?project=farreach
POST /api/memory       body.workspaceId = "farreach"
POST /api/runtime      body.workspaceId = "farreach"
```

SSA accepts both `project` and `workspaceId`. Use `workspaceId` in JSON bodies and `project` in query strings for consistency.

## Access Contract

SSA open-source runtime does not require activation codes or bearer tokens. API routes resolve workspace context from `project`, `workspaceId`, or request body fields.

If no workspace is provided, unresolved workspace defaults to `farreach`. Secure shared or public deployments at the network, reverse-proxy, host, or platform layer.

Workspace resolution rules:

```text
explicit workspace in request -> token must allow that workspace
one-workspace scoped token     -> workspace can be omitted, but omission is discouraged
wildcard token in protected runtime -> workspace is required on most workspace-scoped API calls
```

Admin-only APIs require wildcard workspace access (`workspaces: ["*"]`):

```text
/api/config
/api/worker-supervisor
```

## Response Contract

Most JSON responses use:

```json
{
  "success": true,
  "data": {}
}
```

Errors use:

```json
{
  "success": false,
  "error": "message"
}
```

Some older/read-model endpoints return their model directly or include pagination fields at top level. Agents should check `success === false` first, then consume either `data` or the top-level payload.

When an external action is requested, responses may include:

```json
{
  "action": {
    "actionId": "email-send-...",
    "title": "Customer email send",
    "status": "blocked",
    "blocked": true,
    "canRetry": true,
    "reason": "External action is blocked by default..."
  }
}
```

## Safety Rules

External side effects are blocked by default. SSA can record the request and create an approval item without executing it.

Side-effect kinds and enable flags:

| Kind | Flag |
| --- | --- |
| `email.send` | `SSA_ENABLE_REAL_EMAIL_SEND=true` |
| `crm.write` | `SSA_ENABLE_REAL_CRM_WRITE=true` |
| `data.read` | `SSA_ENABLE_REAL_DATA_READ=true` |
| `imap.fetch` | `SSA_ENABLE_REAL_IMAP=true` |
| `feishu.notify` | `SSA_ENABLE_REAL_FEISHU=true` |
| `payment.write` | `SSA_ENABLE_REAL_PAYMENT=true` |
| `bank.read` | `SSA_ENABLE_REAL_BANK=true` |
| `document.generate` | `SSA_ENABLE_REAL_DOCUMENT_GENERATION=true` |
| `document.preview` | `SSA_ENABLE_REAL_DOCUMENT_PREVIEW=true` |

Important distinction:

```text
/api/approvals
  Business approval cards for deals, risks, discounts, guardrails.

/api/runtime?action=side-effects
/api/runtime POST action approve-side-effect / reject-side-effect / retry-side-effect
  Runtime side-effect decisions that gate real email, CRM, IMAP, document, payment, bank, and notification actions.
```

For real email, CRM write, and document generation, agents must follow this sequence:

1. Request the action. SSA records a side-effect decision.
2. Read the returned `action.actionId` or side-effect `decisionId`.
3. Ask a human/operator to approve it.
4. Approve through `/api/runtime` only when allowed.
5. Retry/execute with the approved `decisionId`.
6. The matching `SSA_ENABLE_REAL_*` flag must also be true.

Approval alone is not enough. The environment flag alone is not enough for email, CRM write, and document generation.

## Recommended Agent Flow

Use this order when attaching a new agent:

```text
1. GET  /api/health?project=<workspace>
2. GET  /api/runtime?action=manifest
3. GET  /api/runtime?action=workspaces
4. POST /api/assistant/query for questions
5. POST /api/memory to add durable context
6. POST /api/operator-command for page-aware user instructions
7. POST /api/runtime for long-running workflows
8. GET  /api/runtime?action=side-effects to review external action gates
9. GET  /api/events as an SSE stream if live activity is needed
```

Do not write generated data into this repo. Put company material under `SSA_DATA_ROOT/companies/<workspace>/...`, or use SSA APIs that do it for you.

## Core Runtime Logic

### Runtime Jobs

`POST /api/runtime` can enqueue a `RuntimeJob`.

Workflow types:

```text
lead.import
company_intel.run
email.reply
follow_up.plan
quotation.prepare
intake.product_doc.process
operator.command
side_effect.request
```

General workflow execution:

```text
enqueue job
-> SQLite queue under SSA_DATA_ROOT/runtime/ssa-runtime.db
-> optional Jaden worker claims job
-> workflow-specific local work
-> LLM classify/summarize where needed
-> side-effect decision if an external action would be needed
-> runtime event under companies/<workspace>/events/events.json
```

Special local-only workflows:

```text
company_intel.run
  normalizes lead
  collects company-intel channels
  writes dossier
  no external side effect decision for ordinary local completion

intake.product_doc.process
  reads uploaded product doc
  runs product-doc-reader
  updates intake analysis and memory index
  records events
```

### Worker Loop

The resident worker can run without web request lifecycle:

```bash
cd web-frontend
npm run worker
npm run worker:status
npm run worker:supervisor
```

Direct command:

```bash
node scripts/workers/jaden-worker.mjs --workspace farreach --worker-id jaden-local --max-jobs 5 --max-attempts 3
```

Each worker tick:

```text
sync inbox into customer CRM/timeline
upsert customer records
queue company-intel for new inbound customers
claim queued runtime jobs
run up to maxJobs
retry until maxAttempts
record heartbeat under SSA_DATA_ROOT/runtime/workers
```

Use `--no-inbox-sync` only for isolated queue tests.

### Inbox Flow

```text
GET /api/inbox
-> optional imap.fetch side-effect if Farreach bridge is enabled
-> if allowed and bridge works, read bridge inbox
-> otherwise read local SSA inbox memory/mock fallback
-> sync messages into customer timeline
```

Reply flow:

```text
GET  /api/inbox/[emailId]
POST /api/inbox/[emailId]/reply
POST /api/inbox/[emailId]/select
POST /api/inbox/[emailId]/send
```

`send` never blindly sends. It creates `email.send`, requires an approved matching decision for real send, verifies recipient email unless explicitly overridden, and records customer memory.

### Lead Flow

```text
POST /api/runtime action=import-leads
or GET/POST /api/leads
-> write CSV/JSON to workspace leads path
-> invalidate local memory cache
-> write memory episode
-> upsert customer accounts
-> queue company-intel jobs
```

### Intake Flow

```text
POST /api/intake multipart or JSON
-> create/update intake session
-> store uploads under companies/<workspace>/intake/uploads/<intakeId>
-> local triage: item type, destination, matches, actions
-> optional LLM recommendation
-> product-doc files queue intake.product_doc.process
-> GET /api/intake lists recent sessions
-> POST /api/intake/[intakeId]/synthesize creates a markdown handoff document
```

Upload limits:

```text
max file size: 50 MB
max total request upload size: 150 MB
max files per request: 8
kept sessions: latest 25
```

### Document And Quote Flow

Quick Quote:

```text
GET  /api/documents/quick-quote/reference
POST /api/documents/quick-quote/modify
POST /api/documents/quick-quote/export-pi
```

`export-pi` is local archiving. It writes an HTML PI, price-cost JSON, product-material index, file manifest, price memory, and a local git commit under the customer package directory.

Trade docs:

```text
GET  /api/documents/pi-records
POST /api/documents/generate
GET  /api/documents/generate
```

`POST /api/documents/generate` only supports `CI` and `PL` from a saved PI record. Generate/export the PI through Quick Quote first.

Legacy quotation generation:

```text
GET  /api/quotations
POST /api/quotations/generate
```

Real file generation is approval and flag gated by `document.generate`.

## API Reference

### Health, Config

| Method | Path | Purpose | Input |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Lightweight status. | optional `project`/`workspaceId` |
| `GET` | `/api/config` | Read masked settings. | none |
| `POST` | `/api/config` | Update settings. Masked secrets are preserved. | partial settings |
| `PUT` | `/api/config` | Import settings. | partial settings |
| `GET` | `/api/system/resources` | Read system resources; `action=reload` clears cache. | optional `action=reload` |

Health example:

```bash
curl "$BASE/api/health?project=farreach"
```

### Runtime

`GET /api/runtime` actions:

| Action | Purpose |
| --- | --- |
| omitted / `snapshot` | Workspaces, packs, recent jobs, side effects, events |
| `jobs` | Recent runtime jobs |
| `manifest` | Product/runtime manifest and capability boundary |
| `workspaces` | Local workspaces |
| `side-effects` | Recent side-effect decisions; query `limit` max 500 |
| `failed-jobs` | Failed operations; query `limit` max 100 |
| `packs` | Sales packs |

`POST /api/runtime` body forms:

Register workspace:

```json
{
  "action": "register-workspace",
  "workspace": {
    "id": "demo-exporter",
    "name": "Demo Exporter",
    "brandName": "Demo Exporter",
    "industry": "Export sales",
    "capabilities": { "emailSync": false, "quotations": true, "crm": "csv", "documents": true },
    "packs": ["email-reply", "follow-up"]
  }
}
```

Import leads:

```json
{
  "action": "import-leads",
  "workspaceId": "farreach",
  "input": {
    "fileName": "leads.csv",
    "csv": "company,email,country\nExample Buyer,buyer@example.com,USA"
  }
}
```

Queue or run workflow:

```json
{
  "workspaceId": "farreach",
  "workflow": "email.reply",
  "input": {
    "customer": "Example Buyer",
    "subject": "RFQ",
    "body": "Please quote USB-C cable."
  },
  "run": false
}
```

Retry failed job:

```json
{
  "action": "retry-job",
  "input": { "operationId": "<operationId from failed-jobs>" }
}
```

Request CRM write:

```json
{
  "action": "request-crm-write",
  "workspaceId": "farreach",
  "input": {
    "customerName": "Example Buyer",
    "contactEmail": "buyer@example.com",
    "subject": "Follow-up note",
    "summary": "Buyer asked for updated PI."
  }
}
```

Execute approved CRM write:

```json
{
  "action": "execute-crm-write",
  "workspaceId": "farreach",
  "input": { "decisionId": "crm-write-..." }
}
```

Side-effect decision operations:

```json
{
  "action": "approve-side-effect",
  "input": {
    "decisionId": "email-send-...",
    "by": "openclaw",
    "note": "Approved by Wilson in operator review"
  }
}
```

```json
{ "action": "reject-side-effect", "input": { "decisionId": "...", "by": "hermes", "note": "Incorrect recipient" } }
```

```json
{ "action": "retry-side-effect", "input": { "decisionId": "..." } }
```

### Assistant

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/assistant/query` | Local-first sales question router. Searches SSA memory/index first; optionally uses Tavily for current/external questions; refuses direct side-effect execution. |

Body:

```json
{
  "workspaceId": "farreach",
  "question": "What do we know about Example Buyer and the latest quote?",
  "customerName": "Example Buyer",
  "context": { "surface": "openclaw" }
}
```

Response data includes:

```text
answer
confidence
intent.taskType
routing.localFirst / usedLocal / usedWeb / webSearchStatus
evidence.local[]
evidence.web[]
safety.blockedSideEffect / requiredApproval / sideEffectKinds
warnings[]
llm.provider/source/confidence
```

### Memory

| Method | Path | Purpose | Input |
| --- | --- | --- | --- |
| `GET` | `/api/memory` | Search memory. | `project`, `query`, `limit`, optional `customerId`, `customerName`, `kinds=fact,episode`, `authorities=authoritative,imported,suggested` |
| `GET` | `/api/memory?mode=timeline` | Customer timeline summary. | same as search |
| `GET` | `/api/memory?mode=customer-context` | Facts, episodes, timeline for a customer. | same as search |
| `POST` | `/api/memory` | Write fact/episode memory. | JSON body |

Write memory body:

```json
{
  "workspaceId": "farreach",
  "kind": "episode",
  "customerName": "Example Buyer",
  "title": "Hermes imported call notes",
  "body": "Buyer needs CE certificate before confirming PI.",
  "tags": ["hermes", "call-note"],
  "source": { "type": "hermes", "id": "call-20260615" },
  "authority": "imported",
  "confidence": 0.9,
  "idempotencyKey": "hermes:farreach:call-20260615"
}
```

Allowed source types:

```text
operator, lead, email, quotation, document, approval, workflow, intake, system, llm, openclaw, hermes, external-memory
```

### Customers, Leads, Pipeline

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/customers` | Customer directory; filters `query/search`, `status`, `country`, pagination `page`, `pageSize` |
| `POST` | `/api/customers` | `set-status-override` or `clear-status-override` |
| `GET` | `/api/customers/context` | Customer 360 view; query `query` or `customer` |
| `GET` | `/api/leads` | Paginated leads; filters `search`, `score`, `country`, `page`, `pageSize` |
| `GET` | `/api/leads?action=combined` | Stats, countries, and leads in one response |
| `GET` | `/api/leads?action=stats` | Lead stats |
| `GET` | `/api/leads?action=countries` | Lead countries |
| `GET` | `/api/leads?action=company-intel` | Read company-intel dossier for lead fields in query |
| `GET` | `/api/leads?action=reload` | Invalidate lead cache |
| `POST` | `/api/leads` | `queue-company-intel` |
| `GET` | `/api/pipeline/funnel` | Pipeline funnel |
| `GET` | `/api/dashboard/overview` | Dashboard overview |
| `GET` | `/api/dashboard/trends` | Dashboard trend series |

Queue company intel:

```json
{
  "workspaceId": "farreach",
  "action": "queue-company-intel",
  "lead": {
    "companyName": "Example Buyer",
    "country": "USA",
    "email": "buyer@example.com",
    "homepage": "https://example.com",
    "score": "Hot"
  },
  "force": false
}
```

Customer status override:

```json
{
  "workspaceId": "farreach",
  "action": "set-status-override",
  "customerId": "example.com",
  "status": "active",
  "reason": "Operator confirmed active opportunity"
}
```

### Inbox And Email

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/inbox` | Inbox list; query `limit` max 100 |
| `GET` | `/api/inbox/[emailId]` | Inbox email detail |
| `POST` | `/api/inbox/[emailId]/reply` | Draft reply using bridge or local LLM |
| `POST` | `/api/inbox/[emailId]/select` | Select reply style `steady`, `aggressive`, or `creative`; returns full email |
| `POST` | `/api/inbox/[emailId]/send` | Request or execute approved inbox reply send |
| `POST` | `/api/emails/send` | Request or execute approved direct email send |
| `GET` | `/api/emails/drafts` | Draft summary list |
| `GET` | `/api/emails/pending` | Pending emails |
| `GET` | `/api/emails/sent` | Sent log; query `page`, `limit` |
| `GET` | `/api/emails/stats` | Email stats |
| `POST` | `/api/email-connection/test` | Test `imap` or `smtp`; gated by side-effect flags |

Draft reply:

```json
{
  "workspaceId": "farreach",
  "from": "buyer@example.com",
  "subject": "RFQ USB-C Cable",
  "body": "Please quote 5000 pcs.",
  "language": "en"
}
```

Direct email:

```json
{
  "workspaceId": "farreach",
  "to": "buyer@example.com",
  "subject": "Re: RFQ USB-C Cable",
  "body": "Dear Buyer,\n\n...",
  "html": false,
  "decisionId": "email-send-..."
}
```

If `decisionId` is omitted or not approved, SSA records the request locally and returns `blocked: true`.

Email connection test:

```json
{ "workspaceId": "farreach", "kind": "smtp" }
```

### Quotations And Documents

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/quotations` | Paginated quotation list; filters `search`, `type`, `status`, `page`, `pageSize` |
| `GET` | `/api/quotations?action=stats` | Quotation stats |
| `GET` | `/api/quotations?action=types` | Quotation types |
| `GET` | `/api/quotations?action=reload` | Invalidate quotation cache |
| `POST` | `/api/quotations/generate` | Request/execute `QT`, `PI`, or `SPL` generation |
| `POST` | `/api/documents/templates` | Upload document template samples as multipart `files` |
| `GET` | `/api/documents/generate` | List generated trade docs |
| `POST` | `/api/documents/generate` | Request/execute `CI`/`PL` generation from saved PI |
| `GET` | `/api/documents/pi-records` | PI records; query `query` |
| `GET` | `/api/documents/quick-quote/reference` | Customer, price, PI, quote, and exchange-rate references |
| `POST` | `/api/documents/quick-quote/modify` | Modify quick quote from instruction |
| `POST` | `/api/documents/quick-quote/export-pi` | Archive quick quote as PI package |

Generate legacy quotation:

```json
{
  "workspaceId": "farreach",
  "type": "QT",
  "customer": "Example Buyer",
  "items": [
    { "name": "USB-C cable", "qty": 5000, "unitPrice": 1.8 }
  ],
  "terms": "FOB Shenzhen",
  "notes": "Valid 14 days",
  "decisionId": "document-generate-..."
}
```

Generate CI/PL from saved PI:

```json
{
  "workspaceId": "farreach",
  "docTypes": ["CI", "PL"],
  "decisionId": "document-generate-...",
  "data": {
    "company": { "name": "Farreach Electronic", "address": "", "phone": "", "email": "" },
    "customer": { "company_name": "Example Buyer", "contact": "", "email": "buyer@example.com", "phone": "", "address": "", "country": "USA" },
    "shipment": { "date": "2026-06-15", "vessel": "", "departure_port": "Shenzhen", "destination_port": "Los Angeles", "incoterms": "FOB", "country_of_origin": "China", "marks": "N/M" },
    "currency": "USD",
    "freight": 0,
    "insurance": 0,
    "products": [
      {
        "description": "USB-C cable",
        "specification": "2m",
        "hs_code": "854442",
        "quantity": 5000,
        "unit_price": 1.8,
        "net_weight_kg": 0,
        "gross_weight_kg": 0,
        "dimensions_cm": "",
        "package_type": "Carton",
        "packages": 50
      }
    ],
    "pi_info": { "pi_no": "PI-20260615-001", "valid_until": "2026-06-30" },
    "ci_info": { "ci_no": "CI-20260615-001", "ci_date": "2026-06-15", "payment_terms": "30% deposit" },
    "pl_info": { "pl_no": "PL-20260615-001" }
  }
}
```

Quick quote reference:

```text
GET /api/documents/quick-quote/reference?project=farreach&customer=Example%20Buyer&products=USB-C%20cable,HDMI%20cable&currency=USD&scope=all
```

Scopes:

```text
all, customers, prices, exchange
```

Quick quote modify:

```json
{
  "workspaceId": "farreach",
  "quote": { "...": "QuickQuoteData" },
  "message": "Set margin to 22%, freight 350, payment terms 30% deposit before production."
}
```

Quick quote export:

```json
{
  "workspaceId": "farreach",
  "quote": { "...": "QuickQuoteData" }
}
```

### Files

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/files` | Serve a file by opaque `token` or absolute `path`; `download=true` for attachment |
| `GET` | `/api/files/preview` | Preview file. PDF/HTML returns direct links; Office conversion is `document.preview` gated |
| `POST` | `/api/files/open` | Open a whitelisted local file on the host OS |

Agents should prefer `downloadUrl` returned by document/quotation APIs. It contains an opaque token:

```text
/api/files?token=file_...&project=farreach&download=true
```

Workspace file allowlist includes:

```text
companies/<workspace>/customers
companies/<workspace>/documents
companies/<workspace>/intake/uploads
companies/<workspace>/quotations
selected repo sample output directories
```

Hidden dot-directories inside a workspace are not served through workspace file APIs.

### Intake

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/intake` | List recent intake sessions |
| `POST` | `/api/intake` | Create/update intake session from JSON or multipart upload |
| `POST` | `/api/intake/[intakeId]/synthesize` | Create markdown synthesis from uploaded/readable files |

JSON intake:

```json
{
  "workspaceId": "farreach",
  "sessionId": "",
  "message": "Please classify this RFQ context.",
  "pastedText": "Buyer asks for HDMI 2.1 cable quotation..."
}
```

Multipart intake fields:

```text
workspaceId or project
sessionId
message
pastedText
files[]       up to 8 files
```

Synthesize:

```json
{
  "workspaceId": "farreach",
  "instruction": "Create a concise handoff for quotation preparation.",
  "title": "Example Buyer RFQ synthesis"
}
```

### Intelligence

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/intelligence/news` | Cached filtered sales news |
| `GET` | `/api/intelligence/competitors` | Cached competitor signals |
| `GET` | `/api/intelligence/alerts` | Cached alerts |
| `GET` | `/api/intelligence/trends` | Cached trend data |
| `GET` | `/api/intelligence/insights` | Cached insights |
| `POST` | `/api/intelligence/refresh` | Refresh RSS/news, copper, FX, SEC competitor data; keeps old cache on failure |

Refresh returns:

```json
{
  "success": true,
  "data": {
    "status": "updated",
    "updatedAt": "...",
    "newsCount": 42,
    "competitorCount": 10,
    "cached": false,
    "message": "Market intelligence was refreshed."
  }
}
```

Use GET first. Call refresh only when the agent explicitly needs current market context.

### Approvals

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/approvals` | List business approval cards; optional `id` |
| `POST` | `/api/approvals` | Create/update a business approval card |
| `PATCH` | `/api/approvals` | Update approval status/decision note |

Create/update card:

```json
{
  "workspaceId": "farreach",
  "id": "example-discount",
  "dealId": "example-buyer",
  "account": "Example Buyer",
  "title": "Discount approval",
  "triggerType": "pricing",
  "value": "USD 45,000 PI",
  "risk": "Margin below target",
  "due": "Today",
  "recommendation": "Approve 5% discount only if MOQ confirmed.",
  "guardrail": "No customer email until side-effect approval.",
  "status": "pending",
  "metadata": { "source": "openclaw" }
}
```

Patch:

```json
{
  "workspaceId": "farreach",
  "id": "example-discount",
  "status": "approved",
  "decisionBy": "Wilson",
  "decisionNote": "Approved with MOQ condition"
}
```

Status values:

```text
pending, approved, rejected
```

### Operator Command

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/operator-command` | Store a page-aware operator instruction, plan it through Jaden planner, enqueue runtime jobs, publish live event, write customer memory |

Body:

```json
{
  "workspaceId": "farreach",
  "page": "customer-context",
  "url": "/customers?query=Example%20Buyer",
  "message": "Prepare a follow-up plan for this buyer, but do not send anything.",
  "context": {
    "customerName": "Example Buyer",
    "surface": "openclaw"
  }
}
```

Response is intentionally high level:

```json
{
  "success": true,
  "data": {
    "status": "queued_for_local_runtime",
    "sideEffects": "blocked",
    "queuedTasks": 1,
    "plan": {
      "source": "jaden-planner",
      "jobs": [{ "title": "Email follow-up" }]
    }
  }
}
```

### Events

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/events` | Server-Sent Events stream for live agent and email activity |

No in-app activation or bearer token is required. Agents can use any HTTP client that supports Server-Sent Events.

Event names:

```text
agent-update
email-progress
new-lead
email-sent
research-complete
operator-command
```

The stream sends:

```text
initial email-progress snapshot
initial agent-update activity snapshot
live events
heartbeat agent-update every 5 seconds
```

### Agents

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/agents` | List configured sales agents/personas |
| `GET` | `/api/agents/[id]` | Get one agent/persona |
| `GET` | `/api/agent-state` | Runtime agent state summary; query `limit` |

### Worker Supervisor

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/worker-supervisor` | Admin-only. Generate worker supervisor setup or request start/stop/restart/health control. |

Prepare supervisor:

```json
{
  "workspaceId": "farreach",
  "platform": "launchd",
  "workerId": "jaden-farreach-1",
  "intervalMs": 5000,
  "maxJobs": 5,
  "maxAttempts": 3
}
```

Supported platforms:

```text
launchd, systemd, pm2
```

Request control:

```json
{
  "workspaceId": "farreach",
  "action": "request-control",
  "workerId": "jaden-farreach-1",
  "control": "restart"
}
```

Control values:

```text
start, stop, restart, health
```

The API records an operator-review request. It does not silently run arbitrary shell control commands for an external agent.

### Demo

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/demo/seed` | Seed local demo customers, activity, orders. Local-only. |
| `POST` | `/api/demo/email-crm` | Run local email-to-CRM drill. Local-only. |

Use these only for demos and smoke tests.

## End-To-End Examples

### Ask A Safe Question

```bash
curl -sS "$BASE/api/assistant/query" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "farreach",
    "question": "Summarize the latest local context for Example Buyer.",
    "customerName": "Example Buyer"
  }'
```

### Add Hermes Memory

```bash
curl -sS "$BASE/api/memory" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "farreach",
    "kind": "fact",
    "customerName": "Example Buyer",
    "title": "Compliance requirement",
    "body": "Buyer requires CE and RoHS documents before PI confirmation.",
    "tags": ["compliance", "hermes"],
    "source": { "type": "hermes", "id": "req-001" },
    "authority": "imported",
    "confidence": 0.95,
    "idempotencyKey": "hermes:farreach:example-buyer:ce-rohs"
  }'
```

### Request A CRM Write, Then Approve And Execute

Request:

```bash
curl -sS "$BASE/api/runtime" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "request-crm-write",
    "workspaceId": "farreach",
    "input": {
      "customerName": "Example Buyer",
      "contactEmail": "buyer@example.com",
      "subject": "RFQ follow-up",
      "summary": "Buyer requested CE and RoHS before PI confirmation."
    }
  }'
```

Approve:

```bash
curl -sS "$BASE/api/runtime" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve-side-effect",
    "input": {
      "decisionId": "crm-write-...",
      "by": "Wilson",
      "note": "Approved local CRM timeline update"
    }
  }'
```

Execute after `SSA_ENABLE_REAL_CRM_WRITE=true`:

```bash
curl -sS "$BASE/api/runtime" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "execute-crm-write",
    "workspaceId": "farreach",
    "input": { "decisionId": "crm-write-..." }
  }'
```

### Queue A Background Sales Task

```bash
curl -sS "$BASE/api/runtime" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "farreach",
    "workflow": "follow_up.plan",
    "input": {
      "customer": "Example Buyer",
      "notes": "Needs compliance docs before PI confirmation."
    },
    "run": false
  }'
```

Then let `jaden-worker` process it, or set `"run": true` for synchronous execution when the caller can wait.

## Agent Do/Don't

Do:

```text
Pass workspaceId/project on every workspace API.
Use bearer auth.
Use /api/assistant/query for questions.
Use /api/memory for durable facts from OpenClaw/Hermes.
Use /api/operator-command for user/page instructions that should become planned jobs.
Use /api/runtime?action=side-effects before retrying customer-facing actions.
Use API-returned downloadUrl for files.
Treat blocked/approval responses as successful safety behavior.
```

Don't:

```text
Do not assume missing auth/workspace behavior in production.
Do not call SMTP/OKKI/IMAP/payment/bank systems directly from an agent when SSA owns the workflow.
Do not write generated customer/runtime data into the repo.
Do not pass arbitrary file paths to /api/files; use returned file tokens.
Do not treat /api/approvals as the real external-action execution gate.
Do not claim an email/CRM/document action happened unless side-effect status is executed.
```

## Source Map

Key source files:

```text
web-frontend/src/app/api/*/route.ts                 HTTP routes
web-frontend/src/lib/runtime/sales-runtime.ts       main runtime facade
web-frontend/src/lib/runtime/types.ts               public runtime types
web-frontend/src/lib/runtime/workspace-access.ts    workspace resolution
web-frontend/src/lib/runtime/side-effect-gate.ts    external action gate
web-frontend/src/lib/runtime/workflow.ts            runtime job execution
web-frontend/src/lib/runtime/task-queue.ts          SQLite queue
web-frontend/src/lib/runtime/jaden-worker.ts        worker tick
scripts/workers/jaden-worker.mjs                    worker CLI
web-frontend/src/lib/runtime/inbox.ts               inbox/reply/send flow
web-frontend/src/lib/runtime/email-send.ts          direct email send gate
web-frontend/src/lib/runtime/crm-write.ts           CRM write gate
web-frontend/src/lib/runtime/documents.ts           quotation/trade doc gate
web-frontend/src/lib/runtime/intake.ts              intake session flow
web-frontend/src/lib/runtime/assistant-router.ts    local-first assistant query
```

# OpenClaw for Salespeople Readiness

Super Sales Agent can be piloted as "OpenClaw for salespeople." It does not
include an in-app sign-in system; put it behind the same private network,
gateway, or deployment boundary you use for OpenClaw. Treat the app as a sales
operator console with
customer data, mailbox metadata, generated documents, and side-effect approvals.

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

The repo boundary check should remain clean after normal usage:

```bash
scripts/check-repo-boundary.sh
```

## LLM Setup

The web runtime is DeepSeek-first:

```bash
export SSA_LLM_PROVIDER=deepseek
export DEEPSEEK_API_KEY="sk-..."
export SSA_LLM_MODEL=deepseek-v4-pro
```

OpenRouter is also supported:

```bash
export SSA_LLM_PROVIDER=openrouter
export OPENROUTER_API_KEY="sk-or-..."
export SSA_LLM_MODEL=deepseek/deepseek-v4-pro
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

Real customer sends require three gates: the explicit runtime flag, an adapter
that checks the side-effect gate, and a human approval marker from the review UI
or API request. Cold outbound also requires Hunter verification to return
`valid`; risky, invalid, unknown, or missing verification blocks real send unless
the operator sets `SSA_ALLOW_UNVERIFIED_EMAIL_SEND=true` as an explicit emergency
override.

Older CLI/batch senders import the same outbound safety guard. They should not be
part of the public beta operator path; use the web review flow for real customer
sends so the approval, verification, and local audit trail stay together.

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

The dependency gate is expected to pass cleanly. Next is pinned to the patched
15.5.x line, and PostCSS is overridden to the patched 8.5.15 release so the
standalone production bundle does not retain the vulnerable nested PostCSS copy.

## Beta Limitations

The runtime manifest still marks these areas as beta limitations:

- Runtime workflow workers need standalone worker entrypoints and retry policy.
- Reusable sales tool registry is not complete.
- LLM provider registry and budget policy are not complete.
- Battle Station controls for scheduled playbooks are not complete.

These are not blockers for a controlled private/public beta if the beta promise
is "sales cockpit plus gated local workflows." They are blockers for a general
self-serve public launch.

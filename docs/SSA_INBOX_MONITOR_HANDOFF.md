# SSA Inbox Monitor Handoff

## Summary

SSA now owns the inbox monitor runtime. Hermes can still schedule it, but Hermes is no longer the source of inbox logic.

The monitor works for both business inboxes:

- Farreach: Himalaya account `farreach`
- Hero Pumps: Himalaya account `heropumps`

The implementation is read-only. It lists inbox envelopes through Himalaya, deduplicates messages in SSA-owned state, and writes runtime events for SSA to consume. It does not send email, call SMTP, write OKKI, call Feishu, or touch payment/bank APIs.

## Runtime Flow

```text
Hermes cron, optional
  -> Hermes wrapper script
  -> SSA project script
  -> SSA inbox worker
  -> Himalaya CLI read-only envelope list
  -> SSA-owned state/events under ~/.ssa
```

SSA can also run the same worker directly without Hermes.

## Scripts

Run Farreach:

```bash
bash /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/farreach/scripts/inbox-monitor-scan.sh
```

Run Hero Pumps:

```bash
bash /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/hero-pumps/scripts/inbox-monitor-scan.sh
```

Hermes wrappers call the same SSA worker:

```bash
/Users/wilson/.hermes/scripts/farreach-inbox-monitor.sh
/Users/wilson/.hermes/scripts/hero-pumps-inbox-monitor.sh
```

Direct worker commands:

```bash
node /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/scripts/workers/inbox-monitor.mjs --workspace farreach --source himalaya --himalaya-account farreach

node /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/scripts/workers/inbox-monitor.mjs --workspace hero-pumps --source himalaya --himalaya-account heropumps
```

## Source Modes

Default script mode is Himalaya:

```text
SSA_INBOX_SOURCE=himalaya
```

Dry-run local-file mode is still available:

```bash
SSA_INBOX_SOURCE=local bash farreach/scripts/inbox-monitor-scan.sh
SSA_INBOX_SOURCE=local bash hero-pumps/scripts/inbox-monitor-scan.sh
```

Local mode reads:

```text
~/.ssa/data/companies/<workspace>/inbox/incoming.json
~/.ssa/data/companies/<workspace>/inbox/incoming.jsonl
```

## SSA-Owned State

Dedupe state:

```text
~/.ssa/data/companies/<workspace>/inbox/monitor-state.json
```

Runtime events:

```text
~/.ssa/data/companies/<workspace>/events/events.json
```

This means repeat cron runs do not keep reporting the same email.

## Safety Boundary

Current allowed behavior:

- Read inbox envelope metadata through Himalaya.
- Store dedupe state under `~/.ssa`.
- Store SSA runtime events under `~/.ssa`.
- Print a compact report only when new mail is found.

Current blocked behavior:

- No real email sending.
- No SMTP calls.
- No OKKI writes.
- No Feishu calls.
- No payment or bank calls.
- No secrets printed.

Future send/reply/write features must go through SSA's explicit approval and side-effect gates.

## Verification Already Performed

- Worker unit tests pass.
- Wrapper scripts pass in local dry-run mode.
- Farreach Himalaya read-only probe works.
- Hero Pumps Himalaya read-only probe works.
- Frontend build passes after marking runtime-backed API routes dynamic.

## Operational Note

Hermes is optional. If Hermes is down, SSA can still run the inbox monitor directly with the worker command above.

If Himalaya is unavailable or misconfigured, SSA can still run in local-file mode by setting:

```bash
export SSA_INBOX_SOURCE=local
```

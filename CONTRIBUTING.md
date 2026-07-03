# Contributing

Thanks for helping improve Super Sales Agent.

## Local Setup

```bash
cp web-frontend/.env.example web-frontend/.env.local
cd web-frontend
npm install
npm run dev
```

Keep `SSA_LLM_PROVIDER=mock` unless your change explicitly needs a provider integration.

## Before Opening A Pull Request

Run the checks that match your change:

```bash
scripts/check-repo-boundary.sh

cd web-frontend
npm test
npm run test:workers
npm run build
```

If a check cannot be run, explain why in the pull request.

## Safety Rules

- Do not commit `.env` files, credentials, real tokens, API keys, private URLs, customer data, prospect lists, mailbox exports, generated documents, logs, screenshots, or rendered videos.
- Keep runtime data under `SSA_DATA_ROOT`, normally `~/.ssa/data`.
- Preserve the default behavior that real external side effects are disabled.
- New email, CRM, payment, bank, document-generation, or fulfillment actions must go through the side-effect gate.
- Add or update `.env.example` files when introducing configuration.
- Use fictional example companies, contacts, domains, and phone numbers in tests and docs.

## Code Style

- Prefer existing patterns over new abstractions.
- Keep changes scoped to the behavior being changed.
- Add focused tests for bug fixes and risky behavior changes.
- Avoid broad formatting-only diffs.

## Documentation

Public docs should be useful from a clean checkout. Avoid references to private machines, private deployment hosts, internal operator names, or unpublished infrastructure unless the document explicitly explains them as optional local integrations.

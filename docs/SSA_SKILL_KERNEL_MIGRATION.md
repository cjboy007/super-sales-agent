# SSA Skill Kernel Migration

SSA Skill Kernel v0 keeps `SKILL.md` as the canonical skill package format, but the runtime now expects machine-readable frontmatter so skills can be indexed, matched, and gated without reading full Markdown bodies on every request.

## Required Frontmatter

Each migrated skill should start with YAML frontmatter:

```yaml
---
name: quotation-workflow
description: Generate quotation drafts and gated quotation documents
version: 1.0.0
tags: [quotation, pricing, rfq, document]
category: sales-document
inputs: [customer, items, terms]
outputs: [quotation_draft, document_request]
side_effects: [document.generate]
permissions: [workspace.read, document.generate.request]
entrypoints:
  cli: scripts/generate-all.sh
tests:
  unit: npm test
status: beta
---
```

Optional:

```yaml
platforms: [node, python, browser]
```

## Status Semantics

- `stable` and `beta` are indexed as enabled by default.
- `draft`, `pending`, and `disabled` are indexed but not returned for executable matching by default.
- `/learn` proposals are always created as `pending`, `generated`, and disabled.
- `deprecated` skills remain valid metadata but should not be selected for new workflows unless explicitly requested by future tooling.

## Side Effects

Allowed `side_effects` values match SSA runtime side-effect kinds:

- `email.send`
- `crm.write`
- `data.read`
- `imap.fetch`
- `feishu.notify`
- `payment.write`
- `bank.read`
- `document.generate`
- `document.preview`
- `price.discount`

Declaring a side effect does not grant execution permission. High-risk actions must still go through `SalesToolRegistry` and SSA's side-effect gate.

## Migration Process

1. Add the required frontmatter to each `skills/<name>/SKILL.md`.
2. Keep the existing Markdown body intact for LLM execution.
3. Run an explicit reindex with `reindexSkillsFromDirectory("skills")`.
4. Review invalid skills returned by the reindex result.
5. Keep incomplete or generated skills as `pending` or `disabled` until tests and safety mapping are reviewed.

## Runtime Boundary

The Skill Kernel stores metadata in `SSA_DATA_ROOT/runtime/ssa-skill-kernel.db`. Runtime listing and matching use SQLite/FTS5. Filesystem scanning should happen only during install, update, or explicit reindex.

## `/learn` Proposals

SSA can create pending skills from:

- pasted procedures
- workflow summaries
- local path source files
- URL source text through an injectable fetcher

Generated proposals are written under `SSA_DATA_ROOT/runtime/learn-proposals/`, indexed as `generated`, and disabled by default. They should be reviewed, tested, and explicitly promoted before use in executable matching.

Promotion requires an approver and approval note. Approval changes the generated skill status to `beta`, marks it enabled in the SQLite index, and keeps the original proposal record for audit.

Existing skills can also receive pending patch proposals. A patch proposal stores proposed Markdown in SQLite and does not alter the active `SKILL.md` until approval writes the file and reindexes the skill.

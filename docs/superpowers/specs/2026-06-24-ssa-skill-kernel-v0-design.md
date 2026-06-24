# SSA Skill Kernel v0 Design

## Goal

Build a Hermes-compatible but SSA-native skill system. SSA keeps `SKILL.md` as the portable package format while adding deterministic indexing, matching, loading, safety mapping, and human-reviewed `/learn`-style skill creation.

## Principles

- `SKILL.md` stays canonical: YAML frontmatter plus Markdown body.
- Runtime discovery uses SQLite + FTS5, not repeated filesystem scans.
- Matching is programmatic first: frontmatter fields, tags, category, side effects, permissions, and FTS-ranked text.
- Full Markdown bodies are loaded only after a skill is selected.
- The existing `SalesToolRegistry` remains the safety contract for customer-visible side effects.
- Self-improvement creates pending skill proposals; it does not silently enable or execute new behavior.
- SSA must not require Hermes, OpenClaw, Codex, or any agent framework at runtime.

## External References

- Hermes Skills System: `https://hermes-agent.nousresearch.com/docs/user-guide/features/skills`
- Hermes overview of the built-in learning loop: `https://github.com/nousresearch/hermes-agent`
- Agent Skills specification for progressive disclosure: `https://agentskills.io/specification`

## Runtime Components

### `skill-kernel.ts`

Owns the Hermes-compatible parser, frontmatter validator, SQLite schema, importer, matcher, loader, registry bridge, and learn proposal flow. Keeping v0 in one focused module avoids scattering a new runtime subsystem before the contract settles.

### Skill Index

The index lives under `SSA_DATA_ROOT/runtime/ssa-skill-kernel.db`.

Tables:

- `skill_index`: one row per indexed skill.
- `skill_index_fts`: FTS5 table over name, description, tags, category, body excerpt, and searchable text.
- `skill_learn_proposals`: pending `/learn`-style proposals.

Filesystem scans happen only through explicit importer/reindex calls. Runtime listing and matching query SQLite.

### Skill Metadata

SSA-compatible skills require these frontmatter fields:

- `name`
- `description`
- `version`
- `tags`
- `category`
- `inputs`
- `outputs`
- `side_effects`
- `permissions`
- `entrypoints`
- `tests`
- `status`

Optional:

- `platforms`

`status` is one of `draft`, `pending`, `disabled`, `beta`, `stable`, or `deprecated`. Pending and disabled skills are indexed but not returned for executable matching unless explicitly requested.

### Matching Flow

1. Caller submits text and optional filters.
2. Skill Kernel queries SQLite using filters for enabled status, side effects, permissions, category, and tags.
3. FTS5 ranks metadata and short body excerpts.
4. Deterministic scoring boosts exact tag, category, side effect, and permission matches.
5. Result returns metadata only, not the full Markdown body.
6. Caller loads the body separately with `loadSkillBody(name)`.

### Sales Tool Bridge

Skills declare `side_effects` and `permissions`; `SalesToolRegistry` declares approved runtime tools for those side effects. The bridge returns matching sales tools for a skill but never executes them. Execution still goes through `enforceSalesToolForSideEffect` and the side-effect approval gate.

`enforceSkillSideEffect` is the Skill Kernel wrapper for high-risk actions. It verifies the skill is enabled and declares the requested side effect, then delegates to `SalesToolRegistry` enforcement so idempotency, approval metadata, and side-effect kind checks stay centralized.

### `/learn`-Style Flow

SSA v0 supports a proposal flow:

1. Accept a source payload: pasted procedure, workflow summary, local path, or URL.
2. Gather source text directly from pasted text/workflow summary/local file, or through an injectable URL fetcher.
3. Create a Hermes-compatible `SKILL.md` draft with SSA frontmatter.
4. Validate required metadata.
5. Persist a proposal as `pending` and `disabled`.
6. Index the draft as non-executable.
7. Return a review packet with path, validation issues, source summary, and suggested verification.
8. Promote new skills only through an explicit approval call that records approver and note, rewrites status to `beta`, and enables matching.
9. Patch existing skills only through a pending patch proposal that leaves the active `SKILL.md` unchanged until approval writes the proposed Markdown and reindexes it.

URL fetch behavior is injectable so tests and operator surfaces can control network access and source trust. Generated proposals stay disabled even when source gathering succeeds.

Existing-skill patches are also gated. The proposal stores the proposed Markdown and review metadata in SQLite; approval records approver/note, writes the file, and reindexes the skill.

## Error Handling

- Invalid frontmatter returns structured validation errors.
- Missing SQLite CLI raises a clear runtime error from the index layer.
- Existing skills without SSA frontmatter can be indexed as `pending` compatibility entries only if the caller enables compatibility mode.
- Pending/generated skills are never matched as executable candidates by default.

## Testing

Tests cover:

- parsing YAML frontmatter and Markdown body
- rejecting missing required SSA fields
- indexing and listing from SQLite without runtime scans
- deterministic matching by tag, description, side effect, and permission
- loading full body only after selection
- mapping skill side effects to registered sales tools
- creating a pending `/learn` proposal that cannot be executable by default
- approving learned skills and existing-skill patches only through explicit review APIs

## Migration

Existing `skills/*/SKILL.md` files should be upgraded incrementally. Minimal migration adds required SSA frontmatter while preserving current Markdown bodies. The importer can surface validation issues so migration can be tracked without blocking existing runtime behavior.

# SSA Skill Kernel v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Hermes-compatible, SQLite-indexed SSA Skill Kernel with deterministic matching, progressive loading, sales-tool safety bridging, and pending `/learn` proposals.

**Architecture:** Add a focused runtime module under `web-frontend/src/lib/runtime/skill-kernel.ts` and tests beside it. The module parses `SKILL.md`, validates SSA frontmatter, indexes metadata in SQLite/FTS5, matches without loading full bodies, loads bodies on demand, links side effects to `SalesToolRegistry`, and creates pending learn proposals.

**Tech Stack:** TypeScript, Vitest, Node `fs/path/child_process`, SQLite CLI with FTS5, existing SSA data path helpers, existing `SalesToolRegistry`.

---

### Task 1: Skill Parsing and Validation

**Files:**
- Create: `web-frontend/src/lib/runtime/skill-kernel.test.ts`
- Create: `web-frontend/src/lib/runtime/skill-kernel.ts`

- [ ] **Step 1: Write failing parser and validator tests**

Create tests that parse Hermes-compatible frontmatter and reject missing SSA fields.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd web-frontend && npx vitest run src/lib/runtime/skill-kernel.test.ts`

Expected: FAIL because `skill-kernel.ts` does not exist.

- [ ] **Step 3: Implement minimal parser and validator**

Implement `parseSkillMarkdown`, `validateSkillFrontmatter`, and exported metadata types.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web-frontend && npx vitest run src/lib/runtime/skill-kernel.test.ts`

Expected: PASS for parser and validator tests.

### Task 2: SQLite Index and Progressive Loading

**Files:**
- Modify: `web-frontend/src/lib/runtime/skill-kernel.test.ts`
- Modify: `web-frontend/src/lib/runtime/skill-kernel.ts`

- [ ] **Step 1: Write failing SQLite index tests**

Add tests for `skillIndexDbPath`, `indexSkillMarkdown`, `listIndexedSkills`, `matchSkills`, and `loadSkillBody`.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd web-frontend && npx vitest run src/lib/runtime/skill-kernel.test.ts`

Expected: FAIL because SQLite APIs are not implemented.

- [ ] **Step 3: Implement index schema and APIs**

Use SQLite CLI and FTS5 following `memory-index.ts` patterns. Store metadata and body path in `skill_index`, body excerpts and metadata in `skill_index_fts`, and keep full body loading separate.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web-frontend && npx vitest run src/lib/runtime/skill-kernel.test.ts`

Expected: PASS for indexing, listing, matching, and loading.

### Task 3: Sales Tool Bridge and Learn Proposal

**Files:**
- Modify: `web-frontend/src/lib/runtime/skill-kernel.test.ts`
- Modify: `web-frontend/src/lib/runtime/skill-kernel.ts`

- [ ] **Step 1: Write failing bridge and learn tests**

Add tests that high-risk skill side effects map to registered sales tools and that `/learn` proposals are indexed as pending/disabled.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd web-frontend && npx vitest run src/lib/runtime/skill-kernel.test.ts`

Expected: FAIL because bridge and learn APIs are not implemented.

- [ ] **Step 3: Implement bridge and proposal APIs**

Implement `salesToolsForSkill` and `createSkillLearnProposal`. Proposal output includes review metadata and never marks a generated skill executable.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web-frontend && npx vitest run src/lib/runtime/skill-kernel.test.ts`

Expected: PASS for all skill-kernel tests.

### Task 4: Migration Notes and Focused Verification

**Files:**
- Create: `docs/SSA_SKILL_KERNEL_MIGRATION.md`
- Modify: `web-frontend/src/lib/runtime/index.ts`

- [ ] **Step 1: Document migration path**

Add notes for upgrading existing `skills/*/SKILL.md` files with SSA frontmatter and describe pending/disabled behavior.

- [ ] **Step 2: Export runtime APIs**

Export Skill Kernel APIs from the runtime index if that file already acts as the public runtime barrel.

- [ ] **Step 3: Run focused tests**

Run: `cd web-frontend && npx vitest run src/lib/runtime/skill-kernel.test.ts src/lib/runtime/sales-tool-registry.test.ts src/lib/runtime/sales-tool-registry-enforcement.test.ts`

Expected: PASS.

- [ ] **Step 4: Run type/build-adjacent verification if feasible**

Run: `cd web-frontend && npm run test -- src/lib/runtime/skill-kernel.test.ts`

Expected: PASS or document why the project test runner does not support path filtering.


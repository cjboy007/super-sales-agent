# Standalone Inbox Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an SSA-owned inbox monitor that can run locally without Hermes, while Hermes can optionally call it through thin wrappers.

**Architecture:** The worker reads local mailbox scan input from `~/.ssa/data/companies/<workspace>/inbox/incoming.json` or `.jsonl`, dedupes by message id, writes monitor state/events under `~/.ssa/data/companies/<workspace>/`, and prints a compact cron-friendly report only when new actionable mail appears. Project wrappers only delegate to the worker.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON/JSONL local files, `~/.ssa/data` runtime storage.

---

### Task 1: Worker Core

**Files:**
- Create: `scripts/workers/inbox-monitor.mjs`
- Test: `scripts/workers/inbox-monitor.test.mjs`

- [x] **Step 1: Write failing tests**

Use `node:test` to verify local JSON/JSONL scans, stateful dedupe, missing-input no-op, and runtime event output.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test scripts/workers/inbox-monitor.test.mjs`
Expected: FAIL because `scripts/workers/inbox-monitor.mjs` is not implemented yet.

- [x] **Step 3: Implement worker**

Create a dependency-free ESM module exporting `runInboxMonitor`, `parseArgs`, and `main`.

- [x] **Step 4: Run tests to verify pass**

Run: `node --test scripts/workers/inbox-monitor.test.mjs`
Expected: PASS.

### Task 2: Optional Hermes Wrappers

**Files:**
- Create: `farreach/scripts/inbox-monitor-scan.sh`
- Create: `hero-pumps/scripts/inbox-monitor-scan.sh`

- [x] **Step 1: Add thin wrappers**

Each wrapper resolves the repo root and runs `node scripts/workers/inbox-monitor.mjs --workspace <id> --quiet-empty`.

- [x] **Step 2: Smoke wrapper without external services**

Run: `SSA_DATA_ROOT="$(mktemp -d)" bash farreach/scripts/inbox-monitor-scan.sh`
Expected: exit 0 and no output when no local inbox file exists.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/SSA_RUNTIME_BOUNDARY.md`
- Modify: `README.md`

- [x] **Step 1: Document optional Hermes usage**

Explain that Hermes may call wrappers, but SSA does not need Hermes and the worker does not call real IMAP unless a future approved adapter is added.

- [x] **Step 2: Verify**

Run:
- `node --test scripts/workers/inbox-monitor.test.mjs`
- `bash scripts/check-repo-boundary.sh` (currently fails on pre-existing repo-local runtime folders: `data/intelligence/`, `farreach/logs/`, `farreach/output/`, `shared/logs/`)
- `cd web-frontend && npm run build`

# Open Source Release Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the Super Sales Agent monorepo for a public open-source release without publishing it.

**Architecture:** Keep source code, templates, docs, tests, and sanitized examples in the repository. Move generated runtime material, credentials, customer/prospect data, private deployment details, and local operator artifacts out of the public tree or replace them with explicit examples.

**Tech Stack:** Next.js, Node.js, Vitest, shell worker scripts, Docker, GitHub Actions.

---

### Task 1: Repository Surface Audit

**Files:**
- Inspect: `.gitignore`
- Inspect: `.dockerignore`
- Inspect: `.github/workflows/*`
- Inspect: `README.md`
- Inspect: `SECRETS.md`
- Inspect: tracked data, generated artifact, and runtime directories

- [ ] **Step 1: List tracked files that look like runtime data or generated artifacts**

Run: `git ls-files | rg '(^|/)(data|logs|archive|captured|drafts|scheduled|temp|test-results|outputs?|cache|state|leads|research|reports)(/|$)|\.(pdf|docx|xlsx|png|jpg|jpeg|mp4|mov|webm|sqlite|db)$'`

Expected: A focused list of public-release review candidates.

- [ ] **Step 2: Scan for obvious secret and private deployment markers**

Run: `rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' '(api[_-]?key|secret|token|password|private[_-]?key|AKIA|BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY|47\.90\.253\.48|qwensales|wilson|OpenClaw|Hermes|PHOENIX)' .`

Expected: No real credentials. Private deployment and operator references are either removed from public release paths or documented as local-only history.

### Task 2: Public Documentation

**Files:**
- Modify: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `docs/OPEN_SOURCE_RELEASE.md`

- [ ] **Step 1: Rewrite the root README for outside contributors**

Keep project purpose, safety boundary, setup, development, testing, Docker, architecture overview, runtime data boundary, and release status in one current entry point.

- [ ] **Step 2: Add standard public project governance files**

Add MIT license, contribution guide, security policy, and contributor covenant-based code of conduct.

- [ ] **Step 3: Add an open-source release audit note**

Document what was sanitized, what remains local-only, and what maintainers must verify before publishing.

### Task 3: Public Configuration And CI

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Replace or modify: `.github/workflows/deploy-qwensales.yml`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/pull_request_template.md`
- Create: `web-frontend/.env.example`

- [ ] **Step 1: Remove private deployment workflow details**

Replace private-host deployment with public CI checks that install, test, and build the web app.

- [ ] **Step 2: Add public GitHub templates**

Use concise issue and pull request templates that ask for reproduction steps, safety implications, and tests.

- [ ] **Step 3: Add missing environment examples**

Document local-only runtime variables and optional provider keys without real values.

### Task 4: Sensitive Data And Generated Artifact Cleanup

**Files:**
- Modify or remove tracked runtime/generated files found by Task 1
- Create sanitized `.example` files where the code still needs structure
- Keep intentional source assets such as app icons and docs images only when they do not contain private data

- [ ] **Step 1: Remove tracked generated runtime output and prospect/customer archives**

Delete files that are generated, customer/prospect-specific, private deployment-specific, or local operator state.

- [ ] **Step 2: Replace necessary examples with sanitized examples**

Keep tiny examples with fictional companies, placeholder credentials, and no customer-identifying content.

- [ ] **Step 3: Update ignore rules**

Ensure future generated output, runtime data, logs, rendered media, local configs, and credentials remain ignored.

### Task 5: Verification

**Files:**
- Inspect: all modified files
- Run: repository boundary check
- Run: secret scan
- Run: web tests
- Run: worker tests
- Run: web build

- [ ] **Step 1: Run boundary and secret scans**

Expected: No tracked private deployment secrets, credentials, or sensitive generated data remain in the current tree.

- [ ] **Step 2: Run automated checks**

Expected: Web unit tests, worker tests, and build either pass or any failures are documented with exact causes.

- [ ] **Step 3: Review final diff**

Expected: Changes are scoped to public-release readiness and do not overwrite unrelated local edits.

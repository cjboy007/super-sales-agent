# SSA UI/UX Audit - 2026-06-09

## Scope

Audited the current `web-frontend` product UI across the main operator surfaces:

- `/` cockpit entry
- `/inbox`
- `/leads`
- `/quotations`
- `/intelligence`
- `/settings`
- `/intake`
- `/agent-status`
- `/focus`
- `/documents`

Evidence was captured locally in:

- `docs/product-design-audit/2026-06-09-ui-ux/screenshots/`
- `docs/product-design-audit/2026-06-09-ui-ux/screenshots-cli/`
- `docs/product-design-audit/2026-06-09-ui-ux/desktop-page-observations.json`

## Executive Summary

The product already has a clear operational direction: dense cockpit UI, explicit human approval gates, bilingual support, and module-specific work surfaces. The main UX risk is not visual polish alone. It is that the app often shows system state before user task state, and important recovery actions are either hidden, too generic, or pushed below the fold.

The highest-leverage improvements are:

1. Make the root cockpit route render reliably.
2. Redesign access/error/empty states around the next action.
3. Replace the mobile horizontal nav rail with a compact app switcher.
4. Normalize the visual system so dark/light modes feel like the same product.
5. Make each page start with the user’s immediate job, not diagnostics.

## Findings

### P0 - Root route is broken or unstable

Evidence:

- `screenshots-cli/00-home-1440.png`
- `screenshots/01-dashboard-desktop.png`

The `/` route did not render the cockpit. In one capture it showed a Next.js runtime overlay: `Invariant: Expected clientReferenceManifest to be defined`; in another it displayed a 404 page. The HTTP status can still return `200`, which makes this especially easy to miss in shallow health checks.

Impact:

- The logo and `Cockpit` nav item both point users to a broken first screen.
- A new user loses trust before reaching the main product.
- Automated uptime checks may pass while the visible page is unusable.

Recommendation:

- Treat this as the first fix.
- Add a route-level smoke test that asserts `/` contains cockpit-specific content, not just HTTP 200.
- Consider a temporary redirect from `/` to the most stable working route if the cockpit page remains risky.

### P1 - Access-required states block work but do not guide recovery consistently

Evidence:

- `screenshots-cli/02-leads-1440.png`
- `screenshots-cli/03-quotations-1440.png`
- `screenshots-cli/05-leads-mobile.png`
- `screenshots-cli/06-quotations-mobile.png`

`Customers` shows a helpful setup card with `Open Settings`. `Quotations` only shows `Workspace data is unavailable.` in a large empty area. `Inbox` shows `Failed to load inbox` with no recovery action.

Impact:

- The same underlying problem produces different UI patterns.
- Users must infer whether they need auth, data setup, email setup, or refresh.
- The main page metrics continue to show zeroes, which can look like “no data” instead of “no access.”

Recommendation:

- Create a shared `AccessRequiredState` and `LoadFailedState`.
- Each blocked panel should explain:
  - what is blocked
  - why it is blocked
  - the next action
  - whether any data is hidden for safety
- For blocked stats, show `--` or `Locked`, not `0`, when the data is unavailable.

### P1 - Mobile navigation is not task-safe

Evidence:

- `screenshots-cli/04-inbox-mobile.png`
- `screenshots-cli/05-leads-mobile.png`
- `screenshots-cli/06-quotations-mobile.png`
- `web-frontend/src/components/ui/AppTopBar.tsx:118`

On mobile, the full module list becomes a horizontal scroll row. At 390px wide, important destinations are cut off and the active page competes with language/theme controls and page actions.

Impact:

- Users cannot see the full product structure.
- Switching modules requires horizontal hunting.
- The top area consumes too much vertical space before the actual work begins.

Recommendation:

- Replace the mobile nav row with a single `Modules` button or segmented app switcher.
- Keep only the current page title, one primary page action, and a compact overflow menu in the header.
- Move language/theme controls into settings or an overflow menu on mobile.

### P1 - Page actions are hidden at common desktop widths

Evidence:

- `web-frontend/src/components/ui/AppTopBar.tsx:80`
- `web-frontend/src/components/ui/AppTopBar.tsx:112`

Page actions are shown inline only at `2xl`; otherwise they move into a second toolbar row. This means even on a 1440px desktop, `Refresh`, `Save`, `Reload`, and status badges sit in a separate band below navigation.

Impact:

- Primary actions feel secondary.
- The header grows taller and pushes actual work down.
- Users scanning from left to right do not see a stable action location.

Recommendation:

- Reserve a right-side action slot at desktop widths.
- Collapse low-frequency controls first, not the page’s primary action.
- Use a stable order: status, primary action, secondary menu.

### P1 - Visual system changes too much between dark and light modes

Evidence:

- `screenshots-cli/01-inbox-1440.png`
- `screenshots-cli/07-intelligence-1440.png`
- `screenshots-cli/08-settings-1440.png`

Dark mode uses a slate/cyber cockpit style with blue, purple, green, and amber accents. Light mode shifts into pale panels with strong brown/orange headers. The result feels like a different product rather than the same design system in a different theme.

Impact:

- Brand consistency weakens.
- Users may perceive light mode as older or less finished.
- Brown/orange headers dominate every page and flatten information hierarchy.

Recommendation:

- Define semantic tokens for `surface`, `panel`, `panel-header`, `accent`, `warning`, `danger`, and `success`.
- Keep hue meaning stable across themes.
- Use colored rails, badges, or small indicators for section tone instead of full-width brown header bands.

### P2 - The UI overuses cockpit language where plain task language would be faster

Evidence:

- Inbox: `AI assisted / human decision required / customer send locked`
- Quotations: `quote files / status review / files only`
- Settings: `security settings / secrets hidden / customer send locked`
- Many panels use labels such as `SCAN`, `READY`, `INTEL`, `LIVE`, `CHECKING`.

Impact:

- The product has a strong personality, but repeated system labels compete with user jobs.
- New users must learn product vocabulary before completing simple tasks.

Recommendation:

- Keep cockpit language for the home/workstation view.
- Use direct task labels inside modules:
  - `Needs review`
  - `No access yet`
  - `Connect mailbox`
  - `Create quote`
  - `Generate CI/PL`
- Reserve all-caps badges for machine state only.

### P2 - Empty states are too passive

Evidence:

- Inbox: `Failed to load inbox`
- Intelligence: `没有情报摘要`, `没有市场新闻`, `没有竞品动态`
- Documents: `还没有保存的 PI。请先从快速报价导出 PI。`

Impact:

- Users see that something is empty, but not always what to do next.
- Some pages are strong here, such as Documents linking the missing PI to Quick Quote conceptually, but the CTA is not consistently present near the message.

Recommendation:

- Standardize empty states as:
  - title
  - one sentence explaining why
  - primary next action
  - secondary diagnostic link when needed
- Example: `No saved PI yet` + `Export a PI from Quick Quote before generating CI/PL` + `Open Quick Quote`.

### P2 - High-density layouts need clearer hierarchy inside panels

Evidence:

- `screenshots-cli/09-focus-1440.png`
- `screenshots-cli/08-settings-1440.png`
- `screenshots-cli/03-quotations-1440.png`

The product is intentionally dense, which fits an operator tool. The issue is that many panels use similar borders, headers, text sizes, and badge styles, so the next decision is not always visually obvious.

Impact:

- In a sales workflow, users must identify “what needs my decision” quickly.
- Approval-heavy screens should make risk, recommendation, and final action visually dominant.

Recommendation:

- On approval/focus screens, promote the decision block:
  - recommendation
  - risk
  - customer-facing effect
  - approve/save/rewrite/reject
- Move long context and history into secondary columns or collapsible sections.
- Use fewer equal-weight panels on pages where one action matters most.

### P2 - Mixed language content weakens confidence

Evidence:

- Settings in Chinese mode still shows English content such as `Mailbox setup needs attention...`, `Add the mailbox account.`
- Leads filters show status options in English: `Prospect`, `Active Customer`, `Dormant`, `Risk`, `Archived`.
- Quotations selectors show `All` in Chinese mode.

Impact:

- The UI feels partially localized.
- Operators may wonder whether the system state is production-ready or developer-facing.

Recommendation:

- Audit all visible strings under `language === "zh"`.
- Localize select options, setup checklist copy, and error messages.
- Keep technical identifiers in English only when they are actual product terms.

## Recommended Work Plan

### Sprint 1 - Make the app trustworthy

- Fix `/` cockpit rendering and add a smoke test.
- Introduce shared blocked/error/empty states.
- Make auth-blocked stats show locked/unavailable instead of zero.
- Give `Inbox` and `Quotations` the same recovery clarity as `Customers`.

### Sprint 2 - Improve operator speed

- Redesign mobile header/navigation.
- Keep desktop primary actions in the top-right action slot at 1440px.
- Promote primary task actions on Quotes, Inbox, Documents, and Focus.
- Add consistent page-level loading and refresh feedback.

### Sprint 3 - Normalize the design system

- Consolidate theme tokens and reduce one-off color overrides.
- Align light mode with dark mode semantics.
- Reduce full-width colored headers; use subtle accents and status rails.
- Complete zh/en localization audit.

## Step Health

1. Root cockpit: poor. Visible route is broken in dev evidence.
2. Inbox: fair. Structure is strong, but failed load state has no recovery path.
3. Customers: fair. Access gate is clearer than other pages, but mobile density and zero-state stats need work.
4. Quotations: fair. Quick Quote path is useful, but auth error and mobile filter layout are weak.
5. Intelligence: fair. Clear dashboard structure, but light-mode visual system feels inconsistent.
6. Settings: fair. Useful setup surface, but too much equal-weight system information and mixed localization.
7. Intake: good direction. Task model is clear: drop files, explain, review. Needs evidence with real content.
8. Agent status: fair. Strong for internal operators, too diagnostic for first-run users.
9. Focus mode: promising. Best example of a real decision workflow, but decision hierarchy can be stronger.
10. Documents: fair. Workflow is clear, empty states should include direct CTAs.

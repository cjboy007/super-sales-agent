# Super Sales Agent — UI/UX Design Audit

Date: 2026-06-10
App: `web-frontend` at `http://localhost:3001`
Evidence: `screenshots/` (18 captures), `capture-metadata.json`

## Audit Scope

This audit evaluates the Super Sales Agent web UI across all primary operator surfaces. It covers layout, hierarchy, interaction patterns, first-run states, accessibility risks, and mobile behavior.

Surfaces reviewed:

1. Cockpit (light + dark)
2. Intake
3. Customers
4. Inbox
5. Outreach
6. Quotations
7. Shipment Documents
8. Intelligence
9. Operations
10. Settings (light + dark)
11. Beta Access gate
12. Onboarding
13. Quick Quote
14. Mobile (cockpit, menu, settings)

Target user: a salesperson or sales operator who needs to see what requires attention, review AI-prepared work, approve customer-facing actions, and complete setup without confusing system state with business state.

Accessibility scope: visual review of contrast, labeling, and information density from screenshots. This is not a full WCAG audit — keyboard order, focus management, screen reader output, and computed contrast ratios were not exhaustively verified.

---

## Evidence Index

| # | Screen | Assessment | File |
|---|--------|-----------|------|
| 1 | Cockpit (light) | Strong density, weak brand/hierarchy | `01-cockpit.png` |
| 2 | Intake | Good structure, unclear primary action | `02-intake.png` |
| 3 | Customers | Blocked by access gate; low contrast | `03-customers.png` |
| 4 | Inbox | Blocked by duplicate access panels | `04-inbox.png` |
| 5 | Outreach | Usable skeleton, empty state under-explains | `05-outreach.png` |
| 6 | Quotations | Good quick-entry, access state dominates | `06-quotes.png` |
| 7 | Shipment Documents | Functional but dense; needs grouping | `07-ship-docs.png` |
| 8 | Intelligence | Clean layout, empty without guidance | `08-intel.png` |
| 9 | Operations | Useful diagnostics, too many simultaneous alerts | `09-ops.png` |
| 10 | Settings (light) | Comprehensive setup, low contrast in panels | `10-settings.png` |
| 11 | Mobile cockpit (closed) | Works, but command bar competes with content | `11-mobile-cockpit-closed.png` |
| 12 | Mobile cockpit (menu) | Navigation is clear | `12-mobile-cockpit-menu-open.png` |
| 13 | Mobile settings | Reflows correctly, truncation reduces clarity | `13-mobile-settings.png` |
| 14 | Settings (dark) | Best visual treatment in the app | `14-dark-settings.png` |
| 15 | Cockpit (dark) | Strongest operator experience overall | `15-dark-cockpit.png` |
| 16 | Beta Access | Clean, calm first gate | `16-beta-access.png` |
| 17 | Onboarding | Comprehensive, high step density | `17-jadenos-onboarding.png` |
| 18 | Quick Quote | Strong core workflow; inline auth error disrupts | `18-quick-quote.png` |

---

## Strengths

1. **Coherent operator-console model.** Navigation, status cards, panels, badges, and command surfaces repeat consistently across modules. This is a real product pattern, not a template.

2. **Safety is visible.** Customer-facing actions are clearly described as gated, requiring review, or saved internally before sending. The approval model is sound.

3. **Quick Quote is the standout workflow.** It places customer terms and a live document preview side by side — the correct mental model for PI creation. This is the screen to protect and build around.

4. **Dark theme is production-quality.** The cockpit and settings screens have clear surface layering, strong contrast, and a confident product identity in dark mode. The amber accent system works well against dark backgrounds.

5. **Mobile structure is sound.** The module menu opens cleanly, content reflows without horizontal overflow, and primary information remains accessible.

---

## UX Findings

### Finding 1: Product identity is fragmented (P0)

Evidence:
- Cockpit says `OpenClaw for salespeople` → `01-cockpit.png`, `15-dark-cockpit.png`
- Beta Access says `Super Sales Agent` → `16-beta-access.png`
- Settings and onboarding reference `JadenOS` → `17-jadenos-onboarding.png`

**Impact:** Users cannot tell whether they are using OpenClaw, Super Sales Agent, or JadenOS. For a tool that handles customer-facing sales documents, this erodes trust immediately. A salesperson showing a quote to a customer doesn't want to wonder what product they're in.

**Recommendation:**
- Choose one product name for all top-bar and navigation contexts.
- Use secondary names only as feature labels (e.g., "Jaden" for the AI assistant, "JadenOS" for runtime diagnostics in Operations).
- Code target: `web-frontend/src/lib/battle-station-data.ts` around `topBar.title`.

---

### Finding 2: Access gates block pages without unified recovery (P0)

Evidence:
- Customers, Inbox, Quotations show large `Beta Access Required` panels → `03-customers.png`, `04-inbox.png`, `06-quotes.png`
- Quick Quote shows `Beta access token is invalid.` inline in the workflow → `18-quick-quote.png`
- Operations shows `Beta access token is invalid.` plus multiple checking/missing states → `09-ops.png`

**Impact:** The same underlying problem (missing or invalid access token) produces five different UI patterns across five pages. Users cannot tell whether the problem is their access setup, missing data, or a system failure. Pages with duplicate blocking panels feel broken rather than protected.

**Recommendation:**
- Build one global `AccessBanner` component that appears at the top of any gated page with a single action: "Save your access pass in Settings."
- Keep module content visible as a dimmed preview beneath the banner — don't hide the structure.
- In Quick Quote, move reference-loading auth errors into a small inline state inside the reference panel (`References locked — save access pass to load`), not a raw error in the main workflow.
- Code targets: `AccessRequiredState` in `web-frontend/src/components/ui/BattlePage.tsx`; Quick Quote reference errors in `web-frontend/src/components/quick-quote/QuickQuotePage.tsx`.

---

### Finding 3: Visual hierarchy is too flat — everything looks urgent (P1)

Evidence:
- Panels across Intake, Shipment Docs, and Settings all use the same heavy gradient header → `02-intake.png`, `07-ship-docs.png`, `10-settings.png`
- Operations stacks repeated alert-style sections with no differentiation → `09-ops.png`

**Impact:** When every panel has the same visual weight, operators must read everything instead of scanning for the next decision. Real alerts compete with decorative status chrome. The "operator dashboard" pattern only works if urgency has levels.

**Recommendation:**
- Reserve gradient/heavy headers for primary action panels and genuine alerts.
- Use quieter section headers (flat border, no gradient) for supporting panels, empty states, and setup explanations.
- In component terms: either split `BattlePanel` into `PrimaryPanel` / `SupportPanel` / `AlertPanel`, or add an `importance` prop (`primary | secondary | alert`) that controls visual weight.

---

### Finding 4: Light theme is significantly weaker than dark (P1)

Evidence:
- Compare `15-dark-cockpit.png` (strong layering, clear card boundaries, confident palette) against `01-cockpit.png` (washed out, borders blend, orange/brown muddles together).
- Dark settings (`14-dark-settings.png`) has clear panel separation; light settings (`10-settings.png`) collapses into a wall of similar-toned surfaces.

**Impact:** The product feels like two different quality levels depending on theme. Users who default to light mode (most users, especially in well-lit office environments) get the weaker experience. The amber/brown palette that works as an accent on dark backgrounds becomes the dominant tone on light, reducing contrast and state distinction.

**Recommendation:**
- Audit light theme CSS variables in `web-frontend/src/app/globals.css`. The issue is likely that semantic colors (card bg, border, muted text) are too close in lightness.
- Increase surface separation: white cards on a light gray page background, with the amber reserved for accents and interactive elements only.
- Target minimum 4.5:1 contrast for body text, 3:1 for large text and UI components (WCAG AA).

---

### Finding 5: Empty states are dead ends (P1)

Evidence:
- Intelligence shows `no insights found`, `no market news`, `no competitor mentions` → `08-intel.png`
- Outreach shows `no records` → `05-outreach.png`
- Intake splits the next action between upload and Ask Jaden with equal weight → `02-intake.png`

**Impact:** Empty screens communicate "nothing here" rather than "here's how to get started." Users cannot tell whether they need to connect a source, upload a file, run a demo, or configure an API key.

**Recommendation:**
Every empty state should answer three questions: what is empty, why it is empty, and the single next action. Examples:
- Intelligence: `No market signals yet. Connect research sources in Settings, or reload cached news.`
- Outreach: `No drafts. Create a review draft or connect your mailbox.`
- Intake: Make the primary action visually dominant (e.g., large drop zone) with the Jaden command as secondary.

---

### Finding 6: Global command bar competes with page-level AI (P1)

Evidence:
- Cockpit has a fixed bottom command bar → `01-cockpit.png`, `15-dark-cockpit.png`
- On mobile, it overlays the lowest card → `11-mobile-cockpit-closed.png`
- Other pages use inline `Ask Jaden About This Page` panels

**Impact:** Two input surfaces for the same AI assistant. Users don't know whether to use the global bar, the page panel, or the page's own primary button. On mobile, the command bar permanently reduces viewport by ~60px.

**Recommendation:**
- Keep one Jaden input model per screen. On cockpit: the bottom bar is the right pattern. On other pages: contextual page panels only.
- On mobile: collapse the cockpit command bar behind a floating action button or swipe-up drawer.

---

### Finding 7: Quick Quote needs first-use guidance (P2)

Evidence:
- Quick Quote has ~22 fields and a live preview side-by-side → `18-quick-quote.png`
- Required fields are visually identical to optional/internal reference fields.
- Auth errors appear inline in the main form flow.

**Impact:** The workflow is powerful, but a first-time user doesn't know the fastest path to a valid proforma invoice.

**Recommendation:**
- Add a narrow step indicator or completion checklist: Customer → Product line → Terms → Preview → Export.
- Visually mark required fields (customer, product description, quantity, unit price).
- Move reference/auth errors into the reference card area, not the primary form.

---

### Finding 8: Operations page has no signal priority (P2)

Evidence:
- Operations shows multiple simultaneous status sections, all styled as warnings → `09-ops.png`
- "Checking…" and "Missing" states appear alongside actual diagnostic results.

**Impact:** An operator glancing at this page can't tell if something is actively wrong or if the page is still loading initial checks. Everything looks like a problem.

**Recommendation:**
- Separate into: active issues (top, alert-styled), pending checks (loading skeleton), and healthy systems (collapsed or success-toned).
- Show a summary line at top: `2 issues · 3 checks pending · 5 healthy`.

---

## Accessibility Risks

| Risk | Evidence | WCAG Criterion |
|------|----------|----------------|
| Low contrast text in light-theme access panels | `03-customers.png`, `04-inbox.png`, `06-quotes.png` — pale text on amber/gray | 1.4.3 Contrast (Minimum) |
| Disabled buttons nearly invisible | `02-intake.png`, `05-outreach.png`, `10-settings.png` | 1.4.3 Contrast (Minimum) |
| Status conveyed by color + small badges only | `LIVE`, `READY`, `PENDING` badges across cockpit, ops | 1.4.1 Use of Color |
| Truncated labels hide meaning | Settings and mobile headers clip important workflow text | 1.3.1 Info and Relationships |
| Light-theme semantic colors too similar | `globals.css` collapses many states into brown/orange range | 1.4.11 Non-text Contrast |
| Keyboard/screen reader behavior unverified | Buttons, tabs, menus visible but focus order, traps, live regions untested | 2.1.1, 4.1.2, 4.1.3 |

**Next step for accessibility:** Run axe-core or Lighthouse on each route in both themes. Manually test keyboard navigation on Quick Quote (complex form) and the cockpit command bar (custom input).

---

## Priority Roadmap

### P0 — Do this week

| Item | Effort | Impact |
|------|--------|--------|
| Unify product name in top bar and navigation | Small (copy change) | Immediate trust improvement |
| Build shared `AccessBanner`, replace duplicate blocking panels | Medium (1 component + 5 page integrations) | Removes primary source of user confusion |
| Fix Quick Quote inline auth errors → contextual reference state | Small | Protects the best workflow in the product |

### P1 — Next sprint

| Item | Effort | Impact |
|------|--------|--------|
| Light theme contrast pass (CSS variables audit) | Medium | Half of users see a better product |
| Panel hierarchy: introduce importance levels | Medium | Scannability across all pages |
| Rich empty states for Intelligence, Outreach, Customers, Inbox | Medium | First-run experience stops feeling broken |
| Single Jaden input model per page (remove duplication) | Small–Medium | Reduces cognitive load |

### P2 — Following sprint

| Item | Effort | Impact |
|------|--------|--------|
| Mobile command bar → collapsed FAB/drawer | Small | Recovers viewport space |
| Quick Quote step indicator + required field markers | Medium | Guides first-time PI creation |
| Operations page signal priority + summary line | Medium | Makes diagnostics scannable |
| Truncation audit on headers and meta text | Small | Recovers clipped information |

---

## Evidence Limits

- Captured from local dev at `http://localhost:3001` — production may differ.
- Multiple pages were in access-gated or empty states, so this audit focuses on setup, empty, and blocked states rather than fully populated production workflows.
- No customer-facing actions were submitted.
- This is a visual UX and accessibility screen audit, not a code-level accessibility certification or full WCAG conformance review.
- Keyboard navigation, screen reader output, and focus management require a separate test pass.

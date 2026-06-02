---
name: company-intel
description: Use when a sales workflow needs single-company customer background research, buyer/contact discovery, email verification, lead-fit scoring, source-backed outreach angles, or company dossier generation.
---

# Company Intel

Company Intel is the deep customer background research skill for SSA/JadenOS. It turns one target company into a clean, source-backed sales dossier: who they are, what they sell, whether they are worth pursuing, who to contact, which emails are verified, and how to open the conversation.

It is complementary to `back-research`: use `back-research` for a large company list, then run `company-intel` only on the high-fit companies.

## When To Use

Use this skill when the user provides any of the following:

- A company name, website, email domain, LinkedIn/company page, Alibaba lead, or inquiry sender.
- A short list of companies that already passed a first screening.
- A request like "客户背调", "查这个客户", "找联系人", "验证邮箱", "生成客户档案", "判断值不值得跟", or "给开发信切入点".

Do not use this as the market-news skill. Industry news and competitor monitoring belong to `ssa-intelligence`; this skill is for a named company or account.

## Runtime Boundary

All generated runtime files must stay outside the repo.

Default data root:

```bash
SSA_DATA_ROOT="${SSA_DATA_ROOT:-$HOME/.ssa/data}"
```

Default output layout:

```text
$SSA_DATA_ROOT/companies/<workspace>/intelligence/clients/<client-slug>/
  client-intel.json
  client-intel.md
  sources.json
  email-candidates.json
```

Rules:

- Never write customer dossiers, downloaded pages, temporary HTML, generated Excel, or API responses into the git repo.
- If the user provides an export folder, write an extra copy there only after confirming the folder is outside the repo.
- Do not use project-specific paths such as old Google Drive aliases unless the current workspace settings explicitly define them.
- Keep raw search/cache artifacts bounded. The final dossier should contain source URLs and short evidence notes, not full copied pages.

## External Connectors

Company Intel can run in degraded mode with only web search. Optional connectors improve coverage:

| Connector | Purpose | Required |
|-----------|---------|----------|
| SearXNG / Tavily / Brave | Web search and source discovery | Recommended |
| Hunter / Apollo | Contact discovery and email verification | Optional |
| NeverBounce / ZeroBounce | Email verification fallback | Optional |
| OKKI / HubSpot / Salesforce | CRM handoff after review | Optional |
| Company GOAT | Public registry, funding, DNS, GitHub and Companies House enrichment | Optional |
| Contact GOAT | Email permutation and verification waterfall | Optional |

Environment/path conventions:

```bash
COMPANY_GOAT_PATH=/path/to/g6-company-goat
CONTACT_GOAT_PATH=/path/to/g6-contact-goat
HUNTER_API_KEY=...
APOLLO_API_KEY=...
```

Real side effects are gated:

- Do not create CRM records unless the matching connector is configured, the workspace has enabled it, and the user explicitly requested handoff.
- Do not send emails from this skill.
- Do not perform SMTP RCPT verification unless email verification is enabled for the workspace or the user explicitly approved it for the current run.
- SMTP verification must stop before `DATA`; it is verification only, never delivery.

## Workflow

```text
Phase 0: Normalize input and set workspace
Phase 1: Red-line screening
Phase 2: Company research
Phase 3: Product fit and sales angle
Phase 4: Contact discovery
Phase 5: Email verification
Phase 6: Scoring and reasoning
Phase 7: Dossier, handoff, and next actions
```

## Phase 0: Normalize Input

Normalize incoming data before searching.

Minimum normalized record:

```json
{
  "company_name": "Example GmbH",
  "website": "https://example.com",
  "domain": "example.com",
  "country": "DE",
  "source": "inquiry/email/manual/import",
  "workspace": "default"
}
```

If only an email is given, derive the domain and search for the company behind that domain. If only a company name is given, search for the official website and mark confidence.

## Phase 1: Red-Line Screening

Run red-line checks before spending time on deep research.

| Red line | Method | Action |
|----------|--------|--------|
| Sanctioned country/entity | Check public sanctions indicators and source country | Skip, record reason |
| Bankrupt/dissolved company | Search legal status, liquidation, bankruptcy, registry status | Mark `dead_or_inactive` |
| Fraud/scam/lawsuit cluster | Search company name plus scam, fraud, lawsuit, complaint | Mark `risk` |
| Domain/email mismatch | Compare official domain, email domain, MX records, website identity | Mark `suspicious` |
| Prohibited industry | Detect pornography, gambling, weapons, illegal goods | Skip, record reason |

Output must include the evidence URL or explicitly state that no public signal was found.

## Phase 2: Company Research

Gather facts from the official site plus independent sources.

Required checks:

1. Fetch or inspect the homepage, contact page, about page, product page, and team/career pages when available.
2. Search the company name plus country, domain, product terms, registry terms, news, acquisition, expansion, funding, exhibition, and hiring.
3. Cross-check important facts against at least two sources when possible.
4. Extract recent developments from the last 12 months. If none are found, write `未找到公开近况` and include which searches were checked.
5. Extract product portfolio with concrete categories. Do not reduce this to vague keywords.
6. Check public company registries for financial data before saying revenue is unavailable.

Financial data requirements:

- Recent revenue or turnover, if public.
- Profit/loss, if public.
- Employee count, if public.
- Three-year trend when available.
- Registry/source used and confidence.

Important: do not stop after the first general web search. Many countries expose financial data through public registries. Use the country-specific reference file before deciding that data is unavailable.

See `references/financial-data-extraction.md`.

## Phase 3: Product Fit And Sales Angle

Use the current workspace product profile, uploaded catalogs, onboarding answers, or user-provided product list. Do not hardcode one supplier's product line.

Output three parts:

1. Customer product portfolio: concrete categories, brands, OEM/private-label signals, price tier.
2. Fit map: `our_product_line -> customer_need`, with confidence and evidence.
3. Sales angle: price, certification, lead time, customization, factory capacity, compliance, regional supply chain, or another angle supported by the evidence.

Bad output:

```text
客户可能需要我们的产品，建议联系。
```

Good output:

```text
Fit: Cat6A patch cable and PoE cable -> customer sells CCTV and network installation kits.
Evidence: product page lists IP camera kits and network accessories.
Angle: reduce sourcing complexity by bundling certified network cable with camera accessories.
```

## Phase 4: Contact Discovery

Prioritize contacts by sales usefulness:

| Priority | Role |
|----------|------|
| 1 | Owner, Founder, CEO, Managing Director |
| 2 | Purchasing, Procurement, Sourcing, Supply Chain |
| 3 | Product Manager, Category Manager, Merchandising |
| 4 | Sales Director, Business Development, Channel Manager |
| 5 | Operations, Logistics, Finance when relevant |

Allowed sources:

- Official website team/contact pages.
- Public search snippets.
- Public LinkedIn search snippets, not authenticated scraping.
- Hunter/Apollo or similar connector if configured.
- Company emails already present in inbound mail or documents.

Separate `contacts` from `email_candidates`.

- `contacts` may contain only confirmed people and emails that are verified or directly sourced.
- `email_candidates` stores generated guesses and unverified addresses for review.
- Every contact must include `source_url` or `source_note`.

## Phase 5: Email Verification

Verification order:

1. Provider verification through Hunter/Apollo/NeverBounce/ZeroBounce when configured.
2. MX/DNS check for the domain.
3. SMTP RCPT check only when explicitly enabled.
4. Manual review state if verification cannot be performed.

SMTP rules:

- Stop at `RCPT TO`.
- Never send `DATA`.
- Wait between attempts.
- Record status as `verified`, `invalid`, `catch_all`, `unknown`, or `not_checked`.

Only `verified` emails can be used for automated scoring boosts or CRM handoff. Guessed or unknown emails stay in `email_candidates`.

## Phase 6: Scoring And Reasoning

Start from 50 points and adjust with evidence-backed signals.

| Signal | Score |
|--------|-------|
| Decision-maker email verified | +15 |
| Purchasing/sourcing contact verified | +12 |
| Strong product fit | +15 |
| Recent growth, hiring, funding, expansion, or exhibition | +10 |
| Company active for more than 3 years | +8 |
| Clear certification/quality/compliance concern | +5 |
| OEM/private-label or supplier-switch signal | +5 |
| All emails invalid | -20 |
| Website unavailable or very thin evidence | -10 |
| Product mismatch | -15 |
| Red-line risk without hard skip | -10 |

Ratings:

| Score | Rating | Action |
|-------|--------|--------|
| 75+ | Hot | Review now and draft outreach |
| 50-74 | Warm | Add to follow-up queue |
| Below 50 | Cold | Archive or monitor |

Every score adjustment must cite a source or a computed verification result.

## Phase 7: Dossier And Handoff

Generate both JSON and Markdown.

Required JSON shape:

```json
{
  "company": {
    "name": "Example GmbH",
    "country": "DE",
    "website": "https://example.com",
    "domain": "example.com",
    "status": "active",
    "confidence": "high"
  },
  "red_lines": [],
  "financial_data": {
    "revenue": null,
    "currency": null,
    "employees": null,
    "source": "Checked Handelsregister/North Data; revenue not public for small GmbH",
    "confidence": "medium"
  },
  "recent_developments": [
    {"date": "N/A", "event": "未找到公开近况", "source_url": ""}
  ],
  "product_portfolio": {
    "main_products": [],
    "brands": [],
    "oem_or_private_label": "unknown",
    "price_positioning": "unknown"
  },
  "sales_entry": {
    "product_match": "",
    "angle": "",
    "opener_business": "",
    "opener_product": "",
    "evidence": []
  },
  "contacts": [],
  "email_candidates": [],
  "lead_score": 0,
  "rating": "Hot/Warm/Cold",
  "recommended_next_actions": []
}
```

Required Markdown sections:

- Basic company information.
- Financial and registry findings.
- Recent developments.
- Product portfolio.
- Product fit and sales angle.
- Verified contacts.
- Email candidates requiring review.
- Score table.
- Recommended next actions.
- Source list.

CRM handoff is optional and must be reviewed. If enabled, send only verified contacts and source-backed fields.

## Batch Mode

For 50+ companies:

```text
back-research -> filter High/Warm fit -> company-intel deep dive -> outreach/review queue
```

Company Intel can process a small list, but it should not be the first pass for raw scraped lists. Deep research on unfiltered lists wastes time and creates noisy workspaces.

Batch output goes under:

```text
$SSA_DATA_ROOT/companies/<workspace>/intelligence/clients/
$SSA_DATA_ROOT/companies/<workspace>/intelligence/reports/company-intel-summary-YYYY-MM-DD.md
```

## Onboarding And Settings

SSA onboarding should encourage users to connect or define:

- Search provider: SearXNG, Tavily, or Brave.
- Email/contact provider: Hunter or Apollo.
- Optional verifier: NeverBounce, ZeroBounce, or provider verification.
- CRM connector: OKKI, HubSpot, Salesforce, or none.
- Product profile: main products, certifications, target industries, regions, minimum order rules, lead time advantages.
- Data root/export preference.

Users must be able to change these in Settings later.

## Relationship To Other SSA Skills

| Skill | Relationship |
|-------|--------------|
| `back-research` | Batch fast scan and fit scoring before deep research |
| `ssa-intelligence` | Market/news/competitor monitoring, not named-account dossiers |
| `email-smart-reply` | Uses company-intel facts to draft replies |
| `campaign-tracker` | Uses ratings and next actions for outreach planning |
| `okki-email-sync` | Optional CRM/email sync after review |
| `quotation-workflow` | Uses customer facts and requirements after inquiry qualification |

## Safety Rules

1. Do not fabricate facts, contacts, financials, or recent developments.
2. Every important claim needs a source URL or a clear `not_found` note.
3. Keep guessed emails out of `contacts`.
4. Do not send emails from this skill.
5. Do not create CRM records without explicit handoff approval.
6. Do not write runtime artifacts into the repo.
7. Do not scrape authenticated social pages.
8. Record uncertainty instead of hiding it.

## References

- `references/financial-data-extraction.md` — country registry and financial data extraction notes.
- `references/competitor-analysis-framework.md` — competitor/company analysis dimensions.
- `references/alibaba-openapi-limits.md` — Alibaba International OpenAPI boundaries.
- `references/excel-requirements-template.md` — optional inquiry requirements workbook template.

## Version History

| Version | Date | Change |
|---------|------|--------|
| v3.6-ssa | 2026-05-31 | Migrated Hermes company-intel into SSA/JadenOS, removed project-specific Farreach paths and hardcoded product claims, added SSA runtime boundary and connector gates. |
| v3.5 | 2026-05-31 | Hermes cleanup of non-background-research content. |
| v3.0 | 2026-05-28 | Added financial data extraction requirements and registry lookup guidance. |
| v2.0 | 2026-04-30 | Added red-line screening, scoring, batch mode, and reasoning layer. |

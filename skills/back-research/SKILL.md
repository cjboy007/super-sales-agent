---
name: back-research
description: Batch company background research and lead-fit scoring. Use when given company lists with names, emails, or websites and asked to search the web, enrich company information, rate fit high/medium/low, summarize evidence, or produce JSON research results. Uses self-hosted SearXNG as default search engine (no API key needed), with Tavily/Brave as fallback, plus caching, heuristic prefiltering, and optional batch LLM scoring.
---

# Back Research

Use `scripts/back_research.py` for batch lead/company background research.

## Quick Start

```bash
python3 scripts/back_research.py \
  --input companies.json \
  --output results.json \
  --llm auto \
  --pretty
```

Input can be either:

```json
[
  {"company_name":"Example Ltd", "email":"sales@example.com", "website":"https://example.com"}
]
```

or:

```json
{"companies":[{"name":"Example Ltd", "url":"example.com"}]}
```

## Environment

**Search engine (default: SearXNG, no API key needed):**

- Self-hosted SearXNG at `http://localhost:8080` (default, no API key required)
- Override with `--searxng-url` if running on a different host/port
- Alternative: `TAVILY_API_KEY` for Tavily or `BRAVE_API_KEY` for Brave Search

**LLM scoring (optional):**

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` default `https://api.openai.com/v1`
- `OPENAI_MODEL` default `gpt-4o-mini`

If no LLM key is present and `--llm auto`, the script falls back to deterministic heuristic scoring.

## Recommended Modes

- Fast cheap pass: `--llm never --search-concurrency 8`
- Balanced default: `--llm auto --llm-batch-size 10`
- Highest quality: `--llm always --llm-batch-size 8 --max-results 8`

## Key CLI Parameters

- `--search-provider auto|searxng|tavily|brave` (default: `searxng`)
- `--queries-per-company 2` — normally company query + domain/product query
- `--company-concurrency 12` — how many companies to process concurrently
- `--search-concurrency 8` — global concurrent search requests
- `--search-min-interval 0.15` — request spacing for rate limits
- `--cache .cache/back_research_cache.json` — avoids repeated search/LLM calls
- `--llm auto|always|never`
- `--llm-batch-size 10` — companies per LLM call
- `--llm-concurrency 2` — concurrent LLM calls
- `--keep-results 8` — raw search results retained per company

## Workflow

1. Load companies and normalize fields.
2. Generate up to N search queries per company.
3. Run SearXNG searches concurrently (or Tavily/Brave if configured) with retry, timeout, 429 backoff, and cache.
4. Score all companies with a keyword heuristic.
5. In `--llm auto`, send only ambiguous companies to LLM; obvious lows/highs stay heuristic.
6. Batch 8-10 companies per LLM request and require strict JSON output.
7. Merge LLM and heuristic results into one output JSON.

Read `DESIGN.md` for architecture, prompt, cost, and error-handling details.

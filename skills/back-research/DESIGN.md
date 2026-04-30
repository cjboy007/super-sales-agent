# Back Research Skill Design

## Goal

Given a JSON list of companies, collect web evidence and output structured lead-fit ratings:

```json
{
  "company_name": "...",
  "fit_rating": "high|medium|low",
  "quality_score": 0,
  "summary": "...",
  "evidence_urls": ["..."]
}
```

The design balances speed, cost, and reasoning quality.

## Architecture

### Two-stage pipeline

1. **Search + heuristic pass**
   - Run 2 queries per company by default:
     - `"Company Name" company products distributor cable electronics`
     - either `site:domain cable HDMI USB products` or `Company HDMI USB cable distributor`
   - Search calls are async and globally rate-limited.
   - Results are cached by provider + query + max_results.
   - Heuristic scoring detects positive cable/electronics/distribution terms and negative unrelated industries.

2. **Batch LLM scoring**
   - `--llm auto` sends only ambiguous companies to the LLM:
     - obvious low: heuristic score `< 5` → skip LLM
     - obvious high: heuristic score `>= 80` → skip LLM
     - everything else → batch LLM
   - `--llm always` scores every company with LLM.
   - `--llm never` uses heuristic only.

This avoids one-agent-per-company latency and avoids one-LLM-call-per-company cost.

## Concurrency and Rate Limits

The script uses `asyncio` plus `aiohttp` when installed; if `aiohttp` is unavailable it falls back to stdlib HTTP in worker threads.

Controls:

- `--company-concurrency`: number of companies being processed concurrently.
- `--search-concurrency`: max simultaneous Tavily/Brave HTTP requests.
- `--search-min-interval`: minimum seconds between request starts.
- `--llm-concurrency`: max simultaneous LLM requests.
- `--llm-min-interval`: minimum seconds between LLM request starts.

429 handling:

- If `Retry-After` is present, sleep that duration.
- Otherwise use exponential backoff with jitter.
- Same retry path covers 5xx and timeout errors.

## Prompt Design

System prompt:

```text
You are a B2B lead research analyst for Your Company, a cable manufacturer selling HDMI, DP, USB, LAN, fiber optic/AOC cables and related accessories.
Return only strict JSON. No markdown, no prose outside JSON.
```

User prompt template:

```text
Analyze the companies below for fit as potential buyers/distributors/importers/retailers/OEM partners for Your Company cable products.

Fit rubric:
- high: clearly sells, distributes, imports, manufactures, integrates, or buys cables/connectors/consumer electronics/AV/networking/computer accessories; likely relevant.
- medium: adjacent electronics/IT/AV/networking company but cable fit is uncertain; or limited evidence.
- low: unrelated industry, insufficient evidence, or only weak keyword coincidence.

Quality score: integer 0-100. Consider evidence strength, product relevance, and buyer/distributor likelihood.
Summary: 1-2 concise sentences with concrete evidence from search snippets. Mention uncertainty when evidence is weak.
Evidence URLs: include up to 3 best URLs from the supplied results.

Output schema: an array of objects exactly like:
[
  {"company_name":"...","fit_rating":"high|medium|low","quality_score":85,"summary":"...","evidence_urls":["..."],"confidence":"high|medium|low"}
]

Companies:
{companies_json}
```

Batch input per company includes:

- company name
- email / website / domain
- heuristic rating and score
- top search results: title, URL, snippet

The model has enough context to reason across companies, but not enough to waste tokens on full pages.

## Error Handling

### Search timeout or provider failure

- Retry up to `--retries`.
- Preserve errors in each company result under `errors`.
- If no search results remain, heuristic rating becomes low with low confidence.

### Missing company information

- Name falls back to email or website.
- Domain is extracted from website first, then email.
- Search queries degrade gracefully when domain is missing.

### LLM unavailable

- In `--llm auto`, missing `OPENAI_API_KEY` means heuristic-only mode.
- In output, `scoring_method` shows `heuristic` or `llm_batch`.

### LLM malformed JSON

- Parser strips markdown fences and tries to extract JSON array/object.
- If parse fails, one repair prompt asks the LLM to convert its own output to strict JSON.
- If repair fails, that batch falls back to heuristic results and records the error in metadata summary.

## CLI Interface

Minimal:

```bash
python3 scripts/back_research.py --input companies.json --output results.json
```

Important options:

```bash
--search-provider auto|tavily|brave
--queries-per-company 2
--max-results 5
--company-concurrency 12
--search-concurrency 8
--search-min-interval 0.15
--search-timeout 20
--cache .cache/back_research_cache.json
--cache-ttl-days 30
--llm auto|always|never
--llm-model gpt-4o-mini
--llm-batch-size 10
--llm-concurrency 2
--llm-timeout 90
--llm-results-per-company 5
--snippet-chars 700
--keep-results 8
--pretty
```

## Performance and Cost Estimate for 100 Companies

Assumptions:

- 2 searches/company → 200 search calls.
- Search concurrency 8, min interval 0.15s.
- Tavily/Brave median latency 1-3s.
- LLM batch size 10.
- Top 5 snippets/company, ~700 chars each.

### Search cost/time

- Calls: 200.
- With concurrency and spacing: typically 45-90 seconds depending on provider latency and rate limits.
- Cache hits can reduce repeated runs to near-zero search time.

### LLM cost/time

If `--llm always`:

- 100 companies / batch size 10 = 10 LLM calls.
- Approx input per company: 1,000-1,800 tokens depending snippets.
- Per batch: ~10k-18k input tokens + ~1k output tokens.
- Total: ~100k-180k input tokens + ~10k output tokens.
- With `--llm-concurrency 2`: typically 1-3 minutes depending model.

If `--llm auto`:

- Obvious lows/highs are skipped.
- If 50 companies are ambiguous: 5 LLM calls.
- Approx total: ~50k-90k input tokens + ~5k output tokens.
- End-to-end total: often 1-2 minutes for 100 companies.

### Why this beats Spawn-Agent精读

- No per-company agent startup overhead.
- No long serial human-readable analysis loop.
- LLM sees multiple companies per call and returns compact JSON.
- Quality is much better than pure keyword matching because the LLM resolves context, false positives, and uncertainty.

## Output Shape

Top-level:

```json
{
  "metadata": {"input_count":100,"search_provider":"auto","llm_mode":"auto"},
  "summary": {"fit_counts":{"high":10,"medium":25,"low":65}},
  "results": []
}
```

Each result includes final rating, summary, evidence URLs, heuristic details, raw search results, errors, and original extra fields.

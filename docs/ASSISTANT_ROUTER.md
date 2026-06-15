# SSA Local-First Assistant Router

SSA's ordinary assistant question path is local-first:

```text
POST /api/assistant/query
-> SalesRuntime.runAssistantQuery()
-> assistant-router
-> local memory + memory index lookup
-> optional web search only for current/external questions
-> existing runLlm() summarization with evidence
```

## Entry Points

- API: `web-frontend/src/app/api/assistant/query/route.ts`
- Runtime: `SalesRuntime.runAssistantQuery()`
- Router: `web-frontend/src/lib/runtime/assistant-router.ts`

`runLlm()` and `runLlmTask()` remain low-level primitives for classification,
drafting, summarizing, and workflow steps. They are not the ordinary user
question router.

## Routing Order

1. Classify the question locally:
   - sales context
   - current/external research
   - external action request
   - general
2. Search local SSA knowledge first:
   - `runtime.searchMemory()`
   - `searchMemoryIndex()` SQLite FTS records
3. Decide whether local evidence is enough.
4. Search the web only when the question asks for current, externally changing,
   or clearly external research information, such as latest news, market prices,
   regulations, sanctions, exchange rates, company profiles, registry clues,
   public websites, or market/competitor checks.
5. Send the gathered evidence to the existing LLM primitive for summarization.
6. Return a structured answer with local and web evidence.

## Evidence Shape

Local evidence includes:

- `sourceKind`: `memory` or `memory_index`
- `sourceType`: memory source or indexed source type
- title, detail, confidence

Web evidence includes:

- provider
- query
- title
- url
- snippet
- checkedAt

If neither local nor web evidence is available, the router returns a low
confidence answer that explicitly says it is uncertain.

## Web Search Configuration

The default web adapter uses the existing search settings:

- `TAVILY_API_KEY`
- settings `tavilyApiKey`
- settings `searchEngine`
- settings `searchDepth`
- settings `maxResults`

When `searchEngine` is `searxng` or `brave`, or when
`SSA_ASSISTANT_SEARCH_PROVIDER=back-research`, the router invokes the existing
`skills/back-research/scripts/back_research.py` CLI and normalizes its
`search_results` into assistant web evidence. This keeps company/market research
on the same search path as the batch back-research skill instead of introducing
a second search pipeline.

Tests inject a web-search function so routing order can be verified without
network calls.

## Safety Boundary

The assistant router does not execute external actions. Requests to send email,
write CRM, generate or issue documents, change pricing, change orders, or record
payments are returned as approval-required guidance. Actual external actions
must continue through SSA's side-effect approval gate.

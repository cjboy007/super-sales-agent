#!/usr/bin/env python3
"""
back_research.py - Batch company background research with async search + two-stage LLM scoring.

Input JSON formats supported:
  [{"company_name":"Acme", "email":"sales@acme.com", "website":"https://acme.com"}]
  {"companies": [...same...]}

Environment:
  TAVILY_API_KEY            optional for Tavily search
  BRAVE_API_KEY             optional for Brave search
  OPENAI_API_KEY            optional for LLM scoring
  OPENAI_BASE_URL           default: https://api.openai.com/v1
  OPENAI_MODEL              default: gpt-4o-mini

Example:
  python3 back_research.py --input companies.json --output results.json --llm auto
"""
from __future__ import annotations

import argparse
import asyncio
import dataclasses
import hashlib
import json
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import aiohttp  # type: ignore
except Exception:  # pragma: no cover
    aiohttp = None


def _load_env_fallback(key: str) -> str:
    """Load API keys from env first, then ~/.openclaw/.env as fallback."""
    val = os.environ.get(key, "").strip()
    if val:
        return val
    env_path = Path.home() / ".openclaw" / ".env"
    if env_path.exists():
        try:
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() == key:
                    return v.strip().strip('"').strip("'")
        except Exception:
            pass
    return ""


@dataclasses.dataclass
class Company:
    company_name: str
    email: str = ""
    website: str = ""
    extra: Dict[str, Any] = dataclasses.field(default_factory=dict)

    @property
    def domain(self) -> str:
        for candidate in [self.website, self.email]:
            d = extract_domain(candidate)
            if d:
                return d
        return ""


@dataclasses.dataclass
class SearchResult:
    title: str
    url: str
    snippet: str
    source: str
    score: float = 0.0


@dataclasses.dataclass
class ResearchBundle:
    company: Company
    queries: List[str]
    search_results: List[SearchResult]
    heuristic_score: int
    heuristic_rating: str
    heuristic_reasons: List[str]
    needs_llm: bool
    errors: List[str] = dataclasses.field(default_factory=list)


POSITIVE_TERMS = {
    "cable": 10, "cables": 10, "wire": 7, "wires": 7, "wiring": 6,
    "hdmi": 16, "displayport": 14, "dp cable": 14, "usb": 12, "usb-c": 12,
    "type-c": 12, "fiber": 12, "fibre": 12, "optical": 8, "aoc": 10,
    "ethernet": 10, "lan cable": 12, "cat6": 10, "cat7": 10, "cat8": 10,
    "adapter": 5, "connector": 8, "distributor": 9, "wholesale": 8,
    "importer": 8, "retailer": 5, "consumer electronics": 6, "av": 5,
    "computer accessories": 8, "networking": 7, "oem": 6, "odm": 6,
}
NEGATIVE_TERMS = {
    "restaurant": -20, "hotel": -20, "law firm": -20, "accounting": -16,
    "real estate": -18, "healthcare": -16, "clinic": -16, "insurance": -16,
    "bank": -18, "university": -12, "school": -12, "charity": -10,
    "software only": -10, "saas": -8, "marketing agency": -14,
}
COMPANY_NAME_KEYS = ["company_name", "name", "company", "organization"]


def now_ms() -> int:
    return int(time.time() * 1000)


def extract_domain(value: str) -> str:
    if not value:
        return ""
    value = value.strip().lower()
    if "@" in value and not value.startswith("http"):
        value = value.split("@")[-1]
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    try:
        host = urllib.parse.urlparse(value).netloc.lower()
    except Exception:
        return ""
    host = host.split("@").pop().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host


def normalize_company(raw: Dict[str, Any]) -> Company:
    name = ""
    for k in COMPANY_NAME_KEYS:
        if raw.get(k):
            name = str(raw[k]).strip()
            break
    if not name:
        name = str(raw.get("email") or raw.get("website") or "Unknown").strip()
    known = set(COMPANY_NAME_KEYS + ["email", "website", "url"])
    extra = {k: v for k, v in raw.items() if k not in known}
    return Company(
        company_name=name,
        email=str(raw.get("email") or "").strip(),
        website=str(raw.get("website") or raw.get("url") or "").strip(),
        extra=extra,
    )


def load_companies(path: Path) -> List[Company]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("companies", data.get("data", []))
    if not isinstance(data, list):
        raise ValueError("Input must be a JSON array or object with companies/data array")
    return [normalize_company(x) for x in data if isinstance(x, dict)]


def safe_json_loads(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


def sha_key(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:24]


def result_to_dict(r: SearchResult) -> Dict[str, Any]:
    return dataclasses.asdict(r)


class JsonCache:
    def __init__(self, path: Path, ttl_days: int = 30):
        self.path = path
        self.ttl_ms = ttl_days * 86400 * 1000
        self.data: Dict[str, Any] = {}
        if path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                self.data = {}

    def get(self, namespace: str, key: str) -> Optional[Any]:
        item = self.data.get(namespace, {}).get(key)
        if not item:
            return None
        if now_ms() - int(item.get("ts", 0)) > self.ttl_ms:
            return None
        return item.get("value")

    def set(self, namespace: str, key: str, value: Any) -> None:
        self.data.setdefault(namespace, {})[key] = {"ts": now_ms(), "value": value}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)


class AsyncRateLimiter:
    """Simple token spacing limiter: max concurrent + min interval between request starts."""
    def __init__(self, concurrency: int, min_interval: float):
        self.sem = asyncio.Semaphore(concurrency)
        self.min_interval = min_interval
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def __aenter__(self):
        await self.sem.acquire()
        async with self._lock:
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last = time.monotonic()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        self.sem.release()


async def request_json(session: Any, method: str, url: str, *, headers: Dict[str, str],
                       json_body: Optional[Dict[str, Any]] = None, timeout: int = 20,
                       retries: int = 3) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    for attempt in range(retries + 1):
        try:
            if aiohttp:
                async with session.request(method, url, headers=headers, json=json_body, timeout=timeout) as resp:
                    txt = await resp.text()
                    if resp.status == 429:
                        retry_after = resp.headers.get("Retry-After")
                        delay = float(retry_after) if retry_after and retry_after.isdigit() else min(30, 2 ** attempt + random.random())
                        await asyncio.sleep(delay)
                        continue
                    if resp.status >= 500 and attempt < retries:
                        await asyncio.sleep(min(20, 2 ** attempt + random.random()))
                        continue
                    if resp.status >= 400:
                        return None, f"HTTP {resp.status}: {txt[:300]}"
                    return json.loads(txt), None
            else:
                return await asyncio.to_thread(sync_request_json, method, url, headers, json_body, timeout)
        except asyncio.TimeoutError:
            if attempt < retries:
                await asyncio.sleep(min(20, 2 ** attempt + random.random()))
                continue
            return None, "timeout"
        except Exception as e:
            if attempt < retries:
                await asyncio.sleep(min(20, 2 ** attempt + random.random()))
                continue
            return None, str(e)
    return None, "retries exhausted"


def sync_request_json(method: str, url: str, headers: Dict[str, str], json_body: Optional[Dict[str, Any]], timeout: int):
    data = json.dumps(json_body).encode("utf-8") if json_body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except Exception as e:
        return None, str(e)


class SearchClient:
    def __init__(self, args: argparse.Namespace, cache: JsonCache):
        self.args = args
        self.cache = cache
        self.tavily_key = _load_env_fallback("TAVILY_API_KEY")
        self.brave_key = _load_env_fallback("BRAVE_API_KEY")
        self.searxng_url = getattr(args, 'searxng_url', 'http://localhost:8080')
        self.provider = args.search_provider
        self.limiter = AsyncRateLimiter(args.search_concurrency, args.search_min_interval)

    def build_queries(self, c: Company) -> List[str]:
        queries = []
        name = c.company_name.strip()
        domain = c.domain
        if name and name.lower() != "unknown":
            queries.append(f'"{name}" company products distributor cable electronics')
            queries.append(f'{name} HDMI USB cable distributor')
        if domain:
            queries.append(f'site:{domain} cable HDMI USB products')
            queries.append(domain)
        out = []
        for q in queries:
            if q not in out:
                out.append(q)
        return out[: self.args.queries_per_company]

    async def search(self, session: Any, query: str) -> Tuple[List[SearchResult], Optional[str]]:
        cache_key = sha_key(f"{self.provider}:{query}:{self.args.max_results}")
        cached = self.cache.get("search", cache_key)
        if cached is not None:
            return [SearchResult(**x) for x in cached], None
        async with self.limiter:
            if self.provider == "searxng":
                results, err = await self._searxng(session, query)
            elif self.provider == "tavily":
                results, err = await self._tavily(session, query)
            elif self.provider == "brave":
                results, err = await self._brave(session, query)
            else:
                if self.searxng_url:
                    results, err = await self._searxng(session, query)
                elif self.tavily_key:
                    results, err = await self._tavily(session, query)
                elif self.brave_key:
                    results, err = await self._brave(session, query)
                else:
                    return [], "No SearXNG, TAVILY_API_KEY, or BRAVE_API_KEY configured"
        if err is None:
            self.cache.set("search", cache_key, [result_to_dict(r) for r in results])
        return results, err

    async def _tavily(self, session: Any, query: str) -> Tuple[List[SearchResult], Optional[str]]:
        if not self.tavily_key:
            return [], "TAVILY_API_KEY missing"
        body = {"api_key": self.tavily_key, "query": query, "search_depth": self.args.tavily_depth,
                "max_results": self.args.max_results, "include_answer": False, "include_raw_content": False}
        data, err = await request_json(session, "POST", "https://api.tavily.com/search",
                                       headers={"Content-Type": "application/json"}, json_body=body,
                                       timeout=self.args.search_timeout, retries=self.args.retries)
        if err:
            return [], err
        out = []
        for r in data.get("results", []) if data else []:
            out.append(SearchResult(str(r.get("title", ""))[:300], str(r.get("url", ""))[:500],
                                    str(r.get("content", ""))[:1000], "tavily", float(r.get("score") or 0)))
        return out, None

    async def _brave(self, session: Any, query: str) -> Tuple[List[SearchResult], Optional[str]]:
        if not self.brave_key:
            return [], "BRAVE_API_KEY missing"
        params = urllib.parse.urlencode({"q": query, "count": self.args.max_results, "text_decorations": "false"})
        data, err = await request_json(session, "GET", f"https://api.search.brave.com/res/v1/web/search?{params}",
                                       headers={"X-Subscription-Token": self.brave_key, "Accept": "application/json"},
                                       timeout=self.args.search_timeout, retries=self.args.retries)
        if err:
            return [], err
        out = []
        for r in (data or {}).get("web", {}).get("results", []):
            out.append(SearchResult(str(r.get("title", ""))[:300], str(r.get("url", ""))[:500],
                                    str(r.get("description", ""))[:1000], "brave", 0.0))
        return out, None

    async def _searxng(self, session: Any, query: str) -> Tuple[List[SearchResult], Optional[str]]:
        if not self.searxng_url:
            return [], "SearXNG URL not configured"
        params = urllib.parse.urlencode({"q": query, "format": "json", "categories": "general",
                                         "engines": "google,bing,duckduckgo", "max_results": self.args.max_results})
        data, err = await request_json(session, "GET", f"{self.searxng_url}/search?{params}",
                                       headers={"Accept": "application/json"},
                                       timeout=self.args.search_timeout, retries=self.args.retries)
        if err:
            return [], err
        out = []
        for r in (data or {}).get("results", []):
            out.append(SearchResult(
                str(r.get("title", ""))[:300],
                str(r.get("url", ""))[:500],
                str(r.get("content", ""))[:1000],
                "searxng",
                float(r.get("score") or 0)
            ))
        return out, None


def heuristic_score(company: Company, results: List[SearchResult]) -> Tuple[int, str, List[str], bool]:
    text = " ".join([company.company_name, company.domain] + [r.title + " " + r.snippet + " " + r.url for r in results]).lower()
    score = 0
    reasons = []
    for term, weight in POSITIVE_TERMS.items():
        if term in text:
            count = min(3, text.count(term))
            score += weight * count
            reasons.append(f"+{weight * count}:{term}")
    for term, weight in NEGATIVE_TERMS.items():
        if term in text:
            score += weight
            reasons.append(f"{weight}:{term}")
    if company.domain and any(company.domain in r.url.lower() for r in results):
        score += 8
        reasons.append("+8:official-domain-hit")
    if not results:
        score -= 10
        reasons.append("-10:no-search-results")
    rating = "high" if score >= 45 else "medium" if score >= 18 else "low"
    needs_llm = not (score < 5 or score >= 80)
    return score, rating, reasons[:20], needs_llm


SYSTEM_PROMPT = """You are a B2B lead research analyst for Your Company, a cable manufacturer selling HDMI, DP, USB, LAN, fiber optic/AOC cables and related accessories.
Return only strict JSON. No markdown, no prose outside JSON.
"""

USER_PROMPT_TEMPLATE = """Analyze the companies below for fit as potential buyers/distributors/importers/retailers/OEM partners for Your Company cable products.

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
"""


class LLMClient:
    def __init__(self, args: argparse.Namespace, cache: JsonCache):
        self.args = args
        self.cache = cache
        self.api_key = _load_env_fallback("OPENAI_API_KEY")
        self.base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.model = args.llm_model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self.limiter = AsyncRateLimiter(args.llm_concurrency, args.llm_min_interval)

    def available(self) -> bool:
        return bool(self.api_key)

    def make_batch_payload(self, bundles: List[ResearchBundle]) -> List[Dict[str, Any]]:
        payload = []
        for b in bundles:
            results = [{"title": r.title, "url": r.url, "snippet": r.snippet[: self.args.snippet_chars]}
                       for r in b.search_results[: self.args.llm_results_per_company]]
            payload.append({"company_name": b.company.company_name, "email": b.company.email,
                            "website": b.company.website, "domain": b.company.domain,
                            "heuristic_rating": b.heuristic_rating, "heuristic_score": b.heuristic_score,
                            "search_results": results})
        return payload

    async def score_batch(self, session: Any, bundles: List[ResearchBundle]) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
        payload = self.make_batch_payload(bundles)
        cache_key = sha_key(json.dumps(payload, sort_keys=True, ensure_ascii=False) + self.model)
        cached = self.cache.get("llm", cache_key)
        if cached is not None:
            return cached, None
        prompt = USER_PROMPT_TEMPLATE.format(companies_json=json.dumps(payload, ensure_ascii=False, indent=2))
        body = {"model": self.model,
                "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                "temperature": 0.1}
        if self.args.json_object_mode:
            body["response_format"] = {"type": "json_object"}
        async with self.limiter:
            data, err = await request_json(session, "POST", f"{self.base_url}/chat/completions",
                                           headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                                           json_body=body, timeout=self.args.llm_timeout, retries=self.args.retries)
        if err:
            return None, err
        try:
            content = data["choices"][0]["message"]["content"]
            parsed = safe_json_loads(content)
            if isinstance(parsed, dict):
                for key in ["results", "companies", "data"]:
                    if isinstance(parsed.get(key), list):
                        parsed = parsed[key]
                        break
            if not isinstance(parsed, list):
                raise ValueError("LLM did not return a JSON array")
            cleaned = [validate_llm_item(x) for x in parsed]
            self.cache.set("llm", cache_key, cleaned)
            return cleaned, None
        except Exception as e:
            repair, repair_err = await self.repair_json(session, str(data)[:6000])
            if repair_err:
                return None, f"parse failed: {e}; repair failed: {repair_err}"
            self.cache.set("llm", cache_key, repair)
            return repair, None

    async def repair_json(self, session: Any, bad_text: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
        body = {"model": self.model,
                "messages": [{"role": "system", "content": "Return only strict JSON array matching the requested schema."},
                             {"role": "user", "content": "Convert this malformed model output into a strict JSON array. If missing fields, infer conservatively.\n" + bad_text}],
                "temperature": 0}
        async with self.limiter:
            data, err = await request_json(session, "POST", f"{self.base_url}/chat/completions",
                                           headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                                           json_body=body, timeout=self.args.llm_timeout, retries=1)
        if err:
            return None, err
        parsed = safe_json_loads(data["choices"][0]["message"]["content"])
        if isinstance(parsed, dict):
            parsed = parsed.get("results") or parsed.get("companies") or parsed.get("data")
        if not isinstance(parsed, list):
            return None, "repair did not produce list"
        return [validate_llm_item(x) for x in parsed], None


def validate_llm_item(x: Any) -> Dict[str, Any]:
    if not isinstance(x, dict):
        x = {}
    rating = str(x.get("fit_rating", "low")).lower()
    if rating not in {"high", "medium", "low"}:
        rating = "low"
    try:
        score = int(x.get("quality_score", 0))
    except Exception:
        score = 0
    score = max(0, min(100, score))
    conf = str(x.get("confidence", "medium")).lower()
    if conf not in {"high", "medium", "low"}:
        conf = "medium"
    urls = x.get("evidence_urls") or []
    if not isinstance(urls, list):
        urls = []
    return {"company_name": str(x.get("company_name", "")), "fit_rating": rating, "quality_score": score,
            "summary": str(x.get("summary", ""))[:1000], "evidence_urls": [str(u) for u in urls[:3]],
            "confidence": conf}


async def research_company(search: SearchClient, session: Any, company: Company) -> ResearchBundle:
    queries = search.build_queries(company)
    pairs = await asyncio.gather(*(search.search(session, q) for q in queries), return_exceptions=True)
    results: List[SearchResult] = []
    errors: List[str] = []
    seen_urls = set()
    for p in pairs:
        if isinstance(p, Exception):
            errors.append(str(p)); continue
        rs, err = p
        if err:
            errors.append(err)
        for r in rs:
            if r.url and r.url not in seen_urls:
                seen_urls.add(r.url); results.append(r)
    h_score, h_rating, reasons, needs_llm = heuristic_score(company, results)
    return ResearchBundle(company, queries, results, h_score, h_rating, reasons, needs_llm, errors)


class DummyAsyncSession:
    async def __aenter__(self): return None
    async def __aexit__(self, exc_type, exc, tb): return None


def chunks(xs: List[Any], size: int):
    for i in range(0, len(xs), size):
        yield xs[i:i + size]


async def run_pipeline(args: argparse.Namespace) -> Dict[str, Any]:
    companies = load_companies(Path(args.input))
    cache = JsonCache(Path(args.cache), ttl_days=args.cache_ttl_days)
    search = SearchClient(args, cache)
    llm = LLMClient(args, cache)
    connector = aiohttp.TCPConnector(limit=args.search_concurrency + args.llm_concurrency + 5) if aiohttp else None
    session_cm = aiohttp.ClientSession(connector=connector) if aiohttp else DummyAsyncSession()
    async with session_cm as session:
        sem = asyncio.Semaphore(args.company_concurrency)
        async def guarded(c: Company):
            async with sem:
                return await research_company(search, session, c)
        bundles = await asyncio.gather(*(guarded(c) for c in companies))
        llm_map: Dict[str, Dict[str, Any]] = {}
        llm_errors: List[str] = []
        should_use_llm = args.llm == "always" or (args.llm == "auto" and llm.available())
        if should_use_llm:
            candidates = [b for b in bundles if args.llm == "always" or b.needs_llm]
            for chunk in chunks(candidates, args.llm_batch_size):
                scored, err = await llm.score_batch(session, chunk)
                if err:
                    llm_errors.append(err); continue
                for item in scored or []:
                    key = item.get("company_name", "").strip().lower()
                    if key:
                        llm_map[key] = item
        cache.save()
    results = [assemble_result(b, llm_map.get(b.company.company_name.strip().lower()), args) for b in bundles]
    return {"metadata": {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                          "input_count": len(companies), "search_provider": args.search_provider,
                          "llm_mode": args.llm, "llm_model": llm.model if llm.available() else None},
            "summary": summarize(results, bundles, llm_errors), "results": results}


def assemble_result(b: ResearchBundle, llm_item: Optional[Dict[str, Any]], args: argparse.Namespace) -> Dict[str, Any]:
    if llm_item:
        rating, qscore, summary = llm_item["fit_rating"], llm_item["quality_score"], llm_item["summary"]
        confidence, scoring_method = llm_item["confidence"], "llm_batch"
        evidence_urls = llm_item.get("evidence_urls", [])
    else:
        rating = b.heuristic_rating
        qscore = max(0, min(100, int(b.heuristic_score * 1.4)))
        summary = heuristic_summary(b)
        confidence, scoring_method = ("medium" if b.search_results else "low"), "heuristic"
        evidence_urls = [r.url for r in b.search_results[:3] if r.url]
    return {"company_name": b.company.company_name, "email": b.company.email, "website": b.company.website,
            "domain": b.company.domain, "fit_rating": rating, "quality_score": qscore, "confidence": confidence,
            "summary": summary, "evidence_urls": evidence_urls[:3], "scoring_method": scoring_method,
            "heuristic": {"rating": b.heuristic_rating, "score": b.heuristic_score, "reasons": b.heuristic_reasons},
            "queries": b.queries, "search_results": [result_to_dict(r) for r in b.search_results[: args.keep_results]],
            "errors": b.errors, "extra": b.company.extra}


def heuristic_summary(b: ResearchBundle) -> str:
    if not b.search_results:
        return "No useful web evidence found; rated low by heuristic."
    terms = [x.split(":", 1)[-1] for x in b.heuristic_reasons if x.startswith("+")][:5]
    first = b.search_results[0]
    return f"Heuristic rating {b.heuristic_rating}; detected signals: {', '.join(terms) or 'limited'}. Top result: {first.title}"


def summarize(results: List[Dict[str, Any]], bundles: List[ResearchBundle], llm_errors: List[str]) -> Dict[str, Any]:
    counts = {"high": 0, "medium": 0, "low": 0}
    methods = {"llm_batch": 0, "heuristic": 0}
    for r in results:
        counts[r["fit_rating"]] = counts.get(r["fit_rating"], 0) + 1
        methods[r["scoring_method"]] = methods.get(r["scoring_method"], 0) + 1
    return {"fit_counts": counts, "scoring_methods": methods,
            "search_error_companies": sum(1 for b in bundles if b.errors), "llm_errors": llm_errors[:5]}


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Batch company back-research with async web search and batch LLM scoring")
    p.add_argument("--input", required=True, help="Input JSON array or {companies:[...]} file")
    p.add_argument("--output", required=True, help="Output JSON file")
    p.add_argument("--cache", default=".cache/back_research_cache.json", help="Search/LLM cache path")
    p.add_argument("--cache-ttl-days", type=int, default=30)
    p.add_argument("--search-provider", choices=["auto", "tavily", "brave", "searxng"], default="searxng")
    p.add_argument("--queries-per-company", type=int, default=2)
    p.add_argument("--max-results", type=int, default=5)
    p.add_argument("--searxng-url", default="http://localhost:8080")
    p.add_argument("--tavily-depth", choices=["basic", "advanced"], default="basic")
    p.add_argument("--company-concurrency", type=int, default=12)
    p.add_argument("--search-concurrency", type=int, default=8)
    p.add_argument("--search-min-interval", type=float, default=0.15)
    p.add_argument("--search-timeout", type=int, default=20)
    p.add_argument("--retries", type=int, default=3)
    p.add_argument("--llm", choices=["auto", "always", "never"], default="auto")
    p.add_argument("--llm-model", default="")
    p.add_argument("--llm-batch-size", type=int, default=10)
    p.add_argument("--llm-concurrency", type=int, default=2)
    p.add_argument("--llm-min-interval", type=float, default=0.5)
    p.add_argument("--llm-timeout", type=int, default=90)
    p.add_argument("--llm-results-per-company", type=int, default=5)
    p.add_argument("--snippet-chars", type=int, default=700)
    p.add_argument("--json-object-mode", action="store_true")
    p.add_argument("--keep-results", type=int, default=8)
    p.add_argument("--pretty", action="store_true")
    return p.parse_args(argv)


async def amain(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    try:
        output = await run_pipeline(args)
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2 if args.pretty else None), encoding="utf-8")
        print(f"Wrote {len(output['results'])} results to {out_path}")
        print(json.dumps(output["summary"], ensure_ascii=False))
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


def main() -> None:
    raise SystemExit(asyncio.run(amain()))


if __name__ == "__main__":
    main()

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchAssistantBackResearch } from "./assistant-router";
import { createSalesRuntime } from "./sales-runtime";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;

let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-assistant-router-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_LLM_PROVIDER = "mock";
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("local-first assistant router", () => {
  it("uses local memory first and does not search the web when local evidence is enough", async () => {
    const runtime = createSalesRuntime();
    runtime.writeMemory({
      workspaceId: "demo-exporter",
      customerName: "Beta Buyer",
      title: "Beta Buyer pricing preference",
      body: "Beta Buyer prefers EXW quotes in USD and asks for 30-day validity on cable accessories.",
      tags: ["pricing", "customer-preference"],
      source: { type: "operator" },
      authority: "authoritative",
      confidence: 0.96,
    });
    const webSearch = vi.fn();

    const result = await runtime.runAssistantQuery({
      workspaceId: "demo-exporter",
      question: "What pricing terms does Beta Buyer prefer?",
    }, { webSearch });

    expect(webSearch).not.toHaveBeenCalled();
    expect(result.routing.usedLocal).toBe(true);
    expect(result.routing.usedWeb).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.answer).toContain("Beta Buyer");
    expect(result.evidence.local[0]).toMatchObject({
      sourceKind: "memory",
      title: "Beta Buyer pricing preference",
    });
  });

  it("searches the web after local lookup for questions that require current information", async () => {
    const runtime = createSalesRuntime();
    const webSearch = vi.fn(async (query: string) => [
      {
        provider: "tavily",
        query,
        title: "LME copper rises in Monday trading",
        url: "https://example.test/copper",
        snippet: "LME copper moved higher today as inventories tightened.",
        checkedAt: "2026-06-15T09:00:00.000Z",
      },
    ]);

    const result = await runtime.runAssistantQuery({
      workspaceId: "hero-pumps",
      question: "今天 LME 铜价最新情况怎么样？",
    }, { webSearch });

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(result.routing.usedLocal).toBe(true);
    expect(result.routing.usedWeb).toBe(true);
    expect(result.evidence.web[0]).toMatchObject({
      provider: "tavily",
      url: "https://example.test/copper",
    });
    expect(result.answer).toContain("LME copper");
  });

  it("searches the web when local evidence is missing for an external company research question", async () => {
    const runtime = createSalesRuntime();
    const webSearch = vi.fn(async (query: string) => [
      {
        provider: "tavily",
        query,
        title: "Zeta Unknown Importer company profile",
        url: "https://example.test/zeta",
        snippet: "Zeta Unknown Importer distributes industrial pump accessories in the EU.",
        checkedAt: "2026-06-15T09:30:00.000Z",
      },
    ]);

    const result = await runtime.runAssistantQuery({
      workspaceId: "hero-pumps",
      question: "What does Zeta Unknown Importer sell and what risks should we check?",
    }, { webSearch });

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(result.routing.localEvidenceStatus).toBe("miss");
    expect(result.routing.usedWeb).toBe(true);
    expect(result.intent.needsWeb).toBe(true);
    expect(result.evidence.web[0].title).toContain("Zeta Unknown Importer");
  });

  it("returns a low-confidence uncertainty answer when local and web evidence are empty", async () => {
    const runtime = createSalesRuntime();
    const webSearch = vi.fn(async () => []);

    const result = await runtime.runAssistantQuery({
      workspaceId: "farreach",
      question: "最新的 Zeta Unknown Importer 制裁风险是什么？",
    }, { webSearch });

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.answer).toContain("不确定");
    expect(result.evidence.local).toHaveLength(0);
    expect(result.evidence.web).toHaveLength(0);
  });

  it("does not execute external actions requested through a user question", async () => {
    const runtime = createSalesRuntime();
    const beforeSideEffects = runtime.snapshot().sideEffects.length;
    const webSearch = vi.fn();

    const result = await runtime.runAssistantQuery({
      workspaceId: "demo-exporter",
      question: "Send Beta Buyer an email and update CRM saying we approved a 20% discount.",
    }, { webSearch });

    expect(webSearch).not.toHaveBeenCalled();
    expect(runtime.snapshot().sideEffects).toHaveLength(beforeSideEffects);
    expect(result.safety.blockedSideEffect).toBe(true);
    expect(result.safety.requiredApproval).toBe(true);
    expect(result.answer).toContain("审批");
  });

  it("keeps a useful fallback when the web search provider fails", async () => {
    const runtime = createSalesRuntime();
    const webSearch = vi.fn(async () => {
      throw new Error("search quota exceeded");
    });

    const result = await runtime.runAssistantQuery({
      workspaceId: "hero-pumps",
      question: "最新欧洲水泵进口法规有什么变化？",
    }, { webSearch });

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(result.routing.usedWeb).toBe(true);
    expect(result.routing.webSearchStatus).toBe("failed");
    expect(result.warnings.join(" ")).toContain("search quota exceeded");
    expect(result.answer).toContain("不确定");
  });

  it("keeps local evidence usable when the configured LLM provider fails", async () => {
    process.env.SSA_LLM_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const runtime = createSalesRuntime();
    runtime.writeMemory({
      workspaceId: "demo-exporter",
      customerName: "Fallback Buyer",
      title: "Fallback Buyer delivery preference",
      body: "Fallback Buyer prefers DHL samples before sea shipment confirmation.",
      tags: ["delivery", "preference"],
      source: { type: "operator" },
      authority: "authoritative",
      confidence: 0.94,
    });

    const result = await runtime.runAssistantQuery({
      workspaceId: "demo-exporter",
      question: "What delivery preference does Fallback Buyer have?",
    });

    expect(result.evidence.local[0].title).toBe("Fallback Buyer delivery preference");
    expect(result.llm).toMatchObject({ provider: "mock", source: "mock" });
    expect(result.answer).toContain("Fallback Buyer");
  });

  it("normalizes back-research CLI output as web evidence without direct search parsing", async () => {
    const scriptPath = path.join(tempRoot, "fake_back_research.py");
    fs.writeFileSync(scriptPath, [
      "import argparse, json",
      "parser = argparse.ArgumentParser()",
      "parser.add_argument('--input')",
      "parser.add_argument('--output')",
      "parser.add_argument('--cache')",
      "parser.add_argument('--search-provider')",
      "parser.add_argument('--llm')",
      "parser.add_argument('--max-results')",
      "parser.add_argument('--keep-results')",
      "args = parser.parse_args()",
      "json.dump({",
      "  'metadata': {'generated_at': '2026-06-15T10:00:00Z', 'search_provider': args.search_provider},",
      "  'results': [{'queries': ['Zeta company products'], 'search_results': [",
      "    {'title': 'Zeta profile', 'url': 'https://example.test/zeta', 'snippet': 'Zeta imports pump parts.', 'source': 'searxng', 'score': 1.0}",
      "  ]}]",
      "}, open(args.output, 'w'))",
    ].join("\n"));

    const evidence = await searchAssistantBackResearch("Zeta Unknown Importer", {
      scriptPath,
      cachePath: path.join(tempRoot, "cache.json"),
      searchProvider: "searxng",
    });

    expect(evidence).toEqual([
      {
        provider: "searxng",
        query: "Zeta company products",
        title: "Zeta profile",
        url: "https://example.test/zeta",
        snippet: "Zeta imports pump parts.",
        checkedAt: "2026-06-15T10:00:00Z",
      },
    ]);
  });
});

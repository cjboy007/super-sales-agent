import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { readSettings } from "../config-store";
import { searchMemoryIndex } from "./memory-index";
import type {
  LlmResult,
  MemoryHit,
  MemorySearchInput,
  WorkspaceAdapter,
  WorkspaceId,
} from "./types";

export interface AssistantQueryInput {
  workspaceId?: WorkspaceId;
  question: string;
  customerId?: string;
  customerName?: string;
  context?: Record<string, unknown>;
}

export interface AssistantLocalEvidence {
  sourceKind: "memory" | "memory_index";
  sourceType?: string;
  title: string;
  detail: string;
  confidence: number;
  path?: string;
  id?: string;
}

export interface AssistantWebEvidence {
  provider: string;
  query: string;
  title: string;
  url: string;
  snippet: string;
  checkedAt: string;
}

export type AssistantWebSearch = (
  query: string,
  context: { workspaceId: WorkspaceId; question: string; intent: AssistantQueryIntent }
) => Promise<AssistantWebEvidence[]>;

export interface AssistantRouterOptions {
  webSearch?: AssistantWebSearch;
  now?: () => Date;
}

export interface AssistantBackResearchOptions {
  scriptPath?: string;
  cachePath?: string;
  searchProvider?: "auto" | "tavily" | "brave" | "searxng";
}

export interface AssistantQueryIntent {
  taskType: "sales_context" | "current_research" | "side_effect_request" | "general";
  needsWeb: boolean;
  sideEffectRisk: boolean;
  sideEffectKinds: string[];
  reason: string;
}

export interface AssistantQueryResult {
  answer: string;
  confidence: number;
  intent: AssistantQueryIntent;
  routing: {
    localFirst: true;
    usedLocal: boolean;
    localEvidenceStatus: "found" | "miss";
    usedLlm: boolean;
    usedWeb: boolean;
    webSearchStatus: "skipped" | "used" | "no_result" | "failed";
  };
  evidence: {
    local: AssistantLocalEvidence[];
    web: AssistantWebEvidence[];
  };
  safety: {
    blockedSideEffect: boolean;
    requiredApproval: boolean;
    sideEffectKinds: string[];
  };
  warnings: string[];
  llm?: Pick<LlmResult, "provider" | "source" | "confidence" | "structured">;
}

interface AssistantRuntimeHost {
  getWorkspace(id?: WorkspaceId | null): WorkspaceAdapter;
  searchMemory(input: MemorySearchInput): MemoryHit[];
  runLlm(input: {
    task: "classify" | "extract" | "draft" | "summarize" | "translate" | "recommend";
    input: string;
    workspaceId?: WorkspaceId;
    context?: Record<string, unknown>;
  }): Promise<LlmResult>;
}

const CURRENT_INFO_PATTERN = /\b(latest|current|today|now|recent|news|this week|this month|real[- ]?time|market price|spot price|regulation|sanction|tariff|exchange rate|lme)\b|最新|今天|今日|现在|当前|实时|新闻|近况|本周|本月|铜价|汇率|法规|监管|制裁|关税|行情|价格/iu;
const EXTERNAL_RESEARCH_PATTERN = /\b(who is|what does .+ sell|company profile|background|registry|financial|revenue|employees|website|risk|risks|supplier|distributor|competitor|market|certification|compliance|importer)\b|背调|公司.*(做什么|销售|风险|官网|注册|财务|营收|员工)|外部|公开资料|风险|官网|注册|财务|营收|员工|进口商|经销商|供应商|竞品|认证|合规/iu;
const SALES_CONTEXT_PATTERN = /\b(customer|buyer|lead|quote|quotation|rfq|price|pricing|order|invoice|product|catalog|email|crm|supplier|competitor|market)\b|客户|买家|线索|报价|订单|发票|产品|目录|邮件|供应商|竞品|市场/iu;
const SIDE_EFFECT_PATTERNS: Array<[string, RegExp]> = [
  ["email.send", /\b(send|reply|forward|email)\b|发送|发邮件|回复邮件|转发/iu],
  ["crm.write", /\b(update|write|create|sync).{0,24}\bcrm\b|\bcrm\b.{0,24}\b(update|write|create|sync)\b|更新.?CRM|写入.?CRM|同步.?CRM/iu],
  ["document.generate", /\b(generate|create|issue).{0,24}\b(quote|quotation|pi|invoice|document)\b|生成.*(报价|PI|发票|单据)|开.*(报价|PI|发票)/iu],
  ["payment.write", /\b(mark|record|confirm).{0,24}\b(payment|paid|receipt)\b|确认.*(付款|收款)|记录.*(付款|收款)/iu],
  ["order.write", /\b(update|change|cancel|approve).{0,24}\border\b|更新.*订单|修改.*订单|取消.*订单/iu],
  ["pricing.approval", /\b(approve|grant|change).{0,24}\b(discount|price|pricing)\b|批准.*折扣|同意.*折扣|修改.*价格|改价/iu],
];

function compact(value: string, max = 800): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, Math.max(0, max - 3))}...` : normalized;
}

function classifyQuestion(question: string): AssistantQueryIntent {
  const sideEffectKinds = SIDE_EFFECT_PATTERNS
    .filter(([, pattern]) => pattern.test(question))
    .map(([kind]) => kind);
  const asksCurrentInfo = CURRENT_INFO_PATTERN.test(question);
  const asksExternalResearch = EXTERNAL_RESEARCH_PATTERN.test(question);
  const needsWeb = asksCurrentInfo || asksExternalResearch;
  const sideEffectRisk = sideEffectKinds.length > 0;
  const taskType = sideEffectRisk
    ? "side_effect_request"
    : needsWeb
      ? "current_research"
      : SALES_CONTEXT_PATTERN.test(question)
        ? "sales_context"
        : "general";

  return {
    taskType,
    needsWeb,
    sideEffectRisk,
    sideEffectKinds,
    reason: sideEffectRisk
      ? "The question asks SSA to perform or approve an external action."
      : asksCurrentInfo
        ? "The question asks for current or externally changing information."
        : asksExternalResearch
          ? "The question asks for external company or market research."
        : taskType === "sales_context"
          ? "The question can likely be answered from local sales context first."
          : "No external research trigger was detected.",
  };
}

function localMemoryEvidence(hit: MemoryHit): AssistantLocalEvidence {
  return {
    sourceKind: "memory",
    sourceType: hit.source.type,
    title: hit.title,
    detail: hit.body,
    confidence: hit.score,
    path: hit.source.path,
    id: hit.id,
  };
}

const GREETING_PATTERN = /^(hi+|hey+|hello+|hiya|howdy|yo|sup|morning|good\s*(morning|afternoon|evening|day)|嗨+|你好+|您好|哈喽|哈啰|早|早上好|早安|下午好|晚上好|在吗|在不在|有人吗)[\s!！。.~,，]*$/iu;

function isGreeting(question: string): boolean {
  const trimmed = question.trim();
  if (!trimmed || trimmed.length > 24) return false;
  return GREETING_PATTERN.test(trimmed);
}

function greetingAnswer(question: string): string {
  const zh = /[一-鿿]/.test(question);
  return zh
    ? "你好，我是 SSA 销售助理。我基于本地的客户、报价、邮件和产品资料帮你查证据、起草内容、做总结或背调。直接说要处理哪个客户或问题就行。"
    : "Hi — I'm the SSA sales assistant. I work from your local customer, quote, email, and product context to find evidence, draft replies, summarize, or run background research. Tell me which customer or task to dig into.";
}


function localIndexEvidence(workspaceId: WorkspaceId, question: string): AssistantLocalEvidence[] {
  try {
    return searchMemoryIndex(workspaceId, question, 8).map((hit) => ({
      sourceKind: "memory_index" as const,
      sourceType: hit.sourceKind,
      title: hit.title,
      detail: hit.detail,
      confidence: hit.confidence / 100,
      path: hit.path,
      id: hit.sourceId,
    }));
  } catch {
    return [];
  }
}

function uniqueLocalEvidence(items: AssistantLocalEvidence[]): AssistantLocalEvidence[] {
  const byKey = new Map<string, AssistantLocalEvidence>();
  for (const item of items) {
    const key = `${item.sourceKind}:${item.id || item.path || item.title}`;
    const existing = byKey.get(key);
    if (!existing || item.confidence > existing.confidence) byKey.set(key, item);
  }
  return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

function localEvidenceIsEnough(items: AssistantLocalEvidence[]): boolean {
  const best = items[0]?.confidence || 0;
  return best >= 0.6 || (items.length >= 2 && best >= 0.45);
}

function webSearchQuery(question: string, workspace: WorkspaceAdapter): string {
  return compact(`${question} ${workspace.industry}`, 300);
}

function defaultBackResearchScriptPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "../skills/back-research/scripts/back_research.py"),
    path.resolve(process.cwd(), "skills/back-research/scripts/back_research.py"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function defaultBackResearchCachePath(): string {
  const root = process.env.SSA_DATA_ROOT || path.join(os.homedir(), ".ssa", "data");
  const directory = path.join(root, "runtime");
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, "assistant-back-research-cache.json");
}

function coerceBackResearchProvider(value: string | undefined): AssistantBackResearchOptions["searchProvider"] {
  if (value === "tavily" || value === "brave" || value === "searxng" || value === "auto") return value;
  return "auto";
}

export async function searchAssistantBackResearch(
  query: string,
  options: AssistantBackResearchOptions = {}
): Promise<AssistantWebEvidence[]> {
  const scriptPath = options.scriptPath || defaultBackResearchScriptPath();
  if (!fs.existsSync(scriptPath)) return [];

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-back-research-"));
  const inputPath = path.join(directory, "input.json");
  const outputPath = path.join(directory, "output.json");
  const cachePath = options.cachePath || defaultBackResearchCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  try {
    fs.writeFileSync(inputPath, JSON.stringify({
      companies: [{ company_name: query }],
    }), "utf-8");
    execFileSync("python3", [
      scriptPath,
      "--input", inputPath,
      "--output", outputPath,
      "--cache", cachePath,
      "--search-provider", options.searchProvider || "auto",
      "--llm", "never",
      "--max-results", "5",
      "--keep-results", "5",
    ], {
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const parsed = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {
      metadata?: { generated_at?: string; search_provider?: string };
      results?: Array<{
        queries?: string[];
        search_results?: Array<{
          title?: string;
          url?: string;
          snippet?: string;
          source?: string;
        }>;
      }>;
    };
    const checkedAt = parsed.metadata?.generated_at || new Date().toISOString();
    const provider = parsed.metadata?.search_provider || options.searchProvider || "back-research";
    return (parsed.results || []).flatMap((item) => {
      const itemQuery = item.queries?.[0] || query;
      return (item.search_results || []).map((result) => ({
        provider: result.source || provider,
        query: itemQuery,
        title: String(result.title || "Untitled source").slice(0, 180),
        url: String(result.url || ""),
        snippet: String(result.snippet || "").slice(0, 500),
        checkedAt,
      }));
    }).filter((item) => item.url || item.snippet);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export async function defaultAssistantWebSearch(query: string): Promise<AssistantWebEvidence[]> {
  const settings = readSettings();
  const provider = (settings.searchEngine || "tavily").toLowerCase();
  const assistantProvider = process.env.SSA_ASSISTANT_SEARCH_PROVIDER?.toLowerCase();
  if (assistantProvider === "back-research" || provider === "searxng" || provider === "brave") {
    return searchAssistantBackResearch(query, {
      searchProvider: coerceBackResearchProvider(provider),
    });
  }

  const tavilyKey = process.env.TAVILY_API_KEY || settings.tavilyApiKey;
  if (provider !== "tavily" || !tavilyKey) return [];

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      search_depth: settings.searchDepth === "advanced" ? "advanced" : "basic",
      max_results: Math.max(1, Math.min(8, settings.maxResults || 5)),
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) throw new Error(`Tavily search failed with HTTP ${response.status}`);
  const data = await response.json() as {
    results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  };
  const checkedAt = new Date().toISOString();
  return (data.results || []).map((item) => ({
    provider: "tavily",
    query,
    title: String(item.title || "Untitled source").slice(0, 180),
    url: String(item.url || ""),
    snippet: String(item.content || "").slice(0, 500),
    checkedAt,
  })).filter((item) => item.url || item.snippet);
}

function evidencePrompt(
  input: AssistantQueryInput,
  intent: AssistantQueryIntent,
  local: AssistantLocalEvidence[],
  web: AssistantWebEvidence[],
  warnings: string[]
): string {
  return JSON.stringify({
    instruction: [
      "Answer the user's sales-operations question using only the supplied evidence.",
      "Prefer local evidence over web evidence.",
      "If evidence is insufficient, say that clearly.",
      "Do not claim that email, CRM, pricing, payment, or order changes have been executed.",
    ].join(" "),
    question: input.question,
    intent,
    localEvidence: local,
    webEvidence: web,
    warnings,
  });
}

function answerFromEvidence(
  question: string,
  local: AssistantLocalEvidence[],
  web: AssistantWebEvidence[],
  llmText?: string,
  llmSource?: LlmResult["source"]
): string {
  // When a real model synthesized the answer, lead with that clean prose.
  // The raw evidence stays available in the structured `evidence` field for the UI.
  if (llmSource === "provider" && llmText && llmText.trim()) {
    return compact(llmText, 900);
  }

  const localLine = local.length
    ? `本地知识库证据：${local.slice(0, 3).map((item) => `${item.title}: ${compact(item.detail, 220)}`).join(" | ")}`
    : "";
  const webLine = web.length
    ? `联网证据：${web.slice(0, 3).map((item) => `${item.title}: ${compact(item.snippet, 220)}`).join(" | ")}`
    : "";
  const sourceLine = [localLine, webLine].filter(Boolean).join("\n");
  if (!sourceLine) {
    return `不确定：本地知识库和可用外部搜索都没有找到足够证据回答“${compact(question, 160)}”。`;
  }
  const summary = llmText ? `\n\n综合回答：${compact(llmText, 900)}` : "";
  return `${sourceLine}${summary}`;
}

function sideEffectAnswer(kinds: string[]): string {
  const label = kinds.length ? kinds.join(", ") : "external action";
  return `我不能直接执行这个请求，因为它涉及 ${label}。SSA 可以先整理建议或草稿，但发送邮件、写 CRM、改价格、改订单或付款相关动作都必须先审批和确认。`;
}

function confidenceFor(local: AssistantLocalEvidence[], web: AssistantWebEvidence[], sideEffectRisk: boolean): number {
  if (sideEffectRisk) return 0.62;
  const bestLocal = local[0]?.confidence || 0;
  if (bestLocal >= 0.6 && web.length > 0) return Math.min(0.92, Math.max(bestLocal, 0.82));
  if (bestLocal >= 0.6) return Math.min(0.9, bestLocal);
  if (web.length > 0) return 0.72;
  return 0.25;
}

export async function runAssistantQuery(
  host: AssistantRuntimeHost,
  input: AssistantQueryInput,
  options: AssistantRouterOptions = {}
): Promise<AssistantQueryResult> {
  const workspace = host.getWorkspace(input.workspaceId);
  const question = compact(input.question, 4000);
  if (!question) throw new Error("Assistant question is required.");

  if (isGreeting(question)) {
    return {
      answer: greetingAnswer(question),
      confidence: 0.9,
      intent: {
        taskType: "general",
        needsWeb: false,
        sideEffectRisk: false,
        sideEffectKinds: [],
        reason: "The message is a greeting, so no evidence lookup is needed.",
      },
      routing: {
        localFirst: true,
        usedLocal: false,
        localEvidenceStatus: "miss",
        usedLlm: false,
        usedWeb: false,
        webSearchStatus: "skipped",
      },
      evidence: { local: [], web: [] },
      safety: {
        blockedSideEffect: false,
        requiredApproval: false,
        sideEffectKinds: [],
      },
      warnings: [],
    };
  }

  const intent = classifyQuestion(question);
  const memoryHits = host.searchMemory({
    workspaceId: workspace.id,
    query: question,
    customerId: input.customerId,
    customerName: input.customerName,
    limit: 8,
  }).map(localMemoryEvidence);
  const localEvidence = uniqueLocalEvidence([
    ...memoryHits,
    ...localIndexEvidence(workspace.id, question),
  ]);
  const localEnough = localEvidenceIsEnough(localEvidence) && intent.reason !== "The question asks for current or externally changing information.";
  const warnings: string[] = [];
  let webEvidence: AssistantWebEvidence[] = [];
  let webSearchStatus: AssistantQueryResult["routing"]["webSearchStatus"] = "skipped";
  let usedLlm = false;
  let llm: LlmResult | undefined;

  if (intent.sideEffectRisk) {
    return {
      answer: sideEffectAnswer(intent.sideEffectKinds),
      confidence: confidenceFor(localEvidence, webEvidence, true),
      intent,
      routing: {
        localFirst: true,
        usedLocal: true,
        localEvidenceStatus: localEvidence.length ? "found" : "miss",
        usedLlm: false,
        usedWeb: false,
        webSearchStatus: "skipped",
      },
      evidence: { local: localEvidence, web: webEvidence },
      safety: {
        blockedSideEffect: true,
        requiredApproval: true,
        sideEffectKinds: intent.sideEffectKinds,
      },
      warnings,
    };
  }

  const shouldSearchWeb = intent.needsWeb && !localEnough;
  if (shouldSearchWeb) {
    try {
      const search = options.webSearch || defaultAssistantWebSearch;
      webEvidence = await search(webSearchQuery(question, workspace), {
        workspaceId: workspace.id,
        question,
        intent,
      });
      webSearchStatus = webEvidence.length ? "used" : "no_result";
    } catch (error) {
      webSearchStatus = "failed";
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (localEvidence.length || webEvidence.length) {
    llm = await host.runLlm({
      workspaceId: workspace.id,
      task: "summarize",
      input: evidencePrompt(input, intent, localEvidence, webEvidence, warnings),
      context: {
        ...(input.context || {}),
        source: "assistant-router",
        localFirst: true,
        localEvidenceCount: localEvidence.length,
        webEvidenceCount: webEvidence.length,
        webSearchStatus,
      },
    });
    usedLlm = true;
  }

  return {
    answer: answerFromEvidence(question, localEvidence, webEvidence, llm?.text, llm?.source),
    confidence: confidenceFor(localEvidence, webEvidence, false),
    intent,
    routing: {
      localFirst: true,
      usedLocal: true,
      localEvidenceStatus: localEvidence.length ? "found" : "miss",
      usedLlm,
      usedWeb: shouldSearchWeb,
      webSearchStatus,
    },
    evidence: { local: localEvidence, web: webEvidence },
    safety: {
      blockedSideEffect: false,
      requiredApproval: false,
      sideEffectKinds: [],
    },
    warnings,
    llm: llm
      ? {
        provider: llm.provider,
        source: llm.source,
        confidence: llm.confidence,
        structured: llm.structured,
      }
      : undefined,
  };
}

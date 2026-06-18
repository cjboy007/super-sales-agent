import type { LlmRequest, LlmResult } from "./types";
import { readSettings } from "../config-store";
import { getLlmCacheEntry, setLlmCacheEntry } from "./llm-cache";
import { annotateLlmResultWithPolicy } from "./llm-policy";
import {
  defaultBaseUrlForProvider,
  isLocalLlmProvider,
  normalizeLlmProviderId,
  type LlmProviderId,
} from "../llm-provider-options";

function summarize(input: string, max = 260): string {
  const compact = input.replace(/\s+/g, " ").trim();
  if (!compact) return "No input supplied.";
  return compact.length > max ? `${compact.slice(0, Math.max(0, max - 3))}...` : compact;
}

function classify(input: string): { label: string; confidence: number } {
  const lower = input.toLowerCase();
  if (/\b(quote|quotation|rfq|price|pricing|offer)\b/.test(lower)) {
    return { label: "quotation_request", confidence: 0.72 };
  }
  if (/\b(payment|paid|receipt|remittance|wire transfer)\b/.test(lower)) {
    return { label: "payment", confidence: 0.7 };
  }
  if (/\b(sample|prototype)\b/.test(lower)) {
    return { label: "sample_request", confidence: 0.66 };
  }
  if (/\b(delay|late|complaint|issue|problem)\b/.test(lower)) {
    return { label: "support_or_exception", confidence: 0.64 };
  }
  return { label: "general_sales_context", confidence: 0.48 };
}

function draft(input: string): string {
  const compact = summarize(input);
  return [
    "Thank you for your message. I reviewed the request and can help with the next sales step.",
    "",
    "Based on the details provided, I will confirm the requirements, check pricing and availability, and come back with a clear proposal before anything is sent externally.",
    "",
    `Context noted: ${compact}`,
  ].join("\n");
}

function recommend(input: string): string {
  const compact = summarize(input, 420);
  return [
    "I reviewed the local intake signals and kept this inside SSA.",
    "Recommended next step: preserve the original, link it to the best matching customer or document context, and require operator approval before any placement or external update.",
    `Working context: ${compact}`,
  ].join(" ");
}

function fallbackForTask(request: LlmRequest): LlmResult {
  if (request.task === "classify") {
    const result = classify(request.input);
    return {
      provider: "mock",
      source: "mock",
      text: result.label,
      confidence: result.confidence,
      structured: { label: result.label },
    };
  }

  if (request.task === "extract") {
    const emails = Array.from(new Set(request.input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
    return {
      provider: "mock",
      source: "mock",
      text: emails.length ? `Extracted ${emails.length} email address(es).` : "No structured entities extracted.",
      confidence: emails.length ? 0.7 : 0.35,
      structured: { emails },
    };
  }

  if (request.task === "draft") {
    return {
      provider: "mock",
      source: "mock",
      text: draft(request.input),
      confidence: 0.52,
      structured: { task: "draft", workspaceId: request.workspaceId || null },
    };
  }

  if (request.task === "recommend") {
    return {
      provider: "mock",
      source: "mock",
      text: recommend(request.input),
      confidence: 0.5,
      structured: { task: "recommend", workspaceId: request.workspaceId || null },
    };
  }

  return {
    provider: "mock",
    source: "mock",
    text: summarize(request.input),
    confidence: 0.5,
    structured: { task: request.task, workspaceId: request.workspaceId || null },
  };
}

function systemPrompt(task: LlmRequest["task"]) {
  return [
    "You are a bounded sales operations assistant inside Super Sales Agent.",
    "You may classify, extract, draft, summarize, translate, and recommend.",
    "Do not claim to send email, write CRM records, change prices, approve discounts, collect payments, or execute external side effects.",
    `Current task: ${task}.`,
  ].join(" ");
}

type ProviderName = LlmProviderId;
type ProviderMode = "local" | "cloud" | "mock";

interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  model: string;
  endpoint: string;
  mode: ProviderMode;
  requiresApiKey: boolean;
}

const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-pro";
const LLM_PROMPT_VERSION = "jadenos.llm.v1";

function directDeepSeekModel(model: string | undefined): string {
  const trimmed = model?.trim();
  if (!trimmed || trimmed === "mock") return DEEPSEEK_DEFAULT_MODEL;

  const lower = trimmed.toLowerCase();
  const withoutProvider = lower.startsWith("deepseek/") ? lower.slice("deepseek/".length) : lower;
  const compact = withoutProvider.replace(/[^a-z0-9]/g, "");
  if (compact === "deepseekv4pro") return "deepseek-v4-pro";
  if (compact === "deepseekv4flash") return "deepseek-v4-flash";
  if (withoutProvider.startsWith("deepseek-")) return withoutProvider;
  return DEEPSEEK_DEFAULT_MODEL;
}

function directOpenAiModel(model: string | undefined): string {
  const trimmed = model?.trim();
  if (!trimmed || trimmed === "mock") return "";
  return trimmed.startsWith("openai/") ? trimmed.slice("openai/".length) : trimmed;
}

function openRouterModel(model: string | undefined): string {
  const trimmed = model?.trim();
  if (!trimmed || trimmed === "mock") return "";
  const deepSeekModel = directDeepSeekModel(model);
  if (/^deepseek(\/|-)/i.test(trimmed)) {
    return `deepseek/${deepSeekModel}`;
  }
  return trimmed;
}

function normalizeProvider(value: string | undefined): ProviderName | "" {
  return normalizeLlmProviderId(value);
}

function chatCompletionsEndpoint(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function providerMode(provider: ProviderName): ProviderMode {
  if (provider === "mock") return "mock";
  if (isLocalLlmProvider(provider)) return "local";
  return "cloud";
}

function providerDefaultBaseUrl(provider: Exclude<ProviderName, "mock">): string {
  if (provider === "deepseek" && process.env.DEEPSEEK_BASE_URL) return process.env.DEEPSEEK_BASE_URL;
  return defaultBaseUrlForProvider(provider);
}

function providerEndpoint(provider: Exclude<ProviderName, "mock">, baseUrl?: string): string {
  return chatCompletionsEndpoint(baseUrl?.trim() || providerDefaultBaseUrl(provider));
}

function providerApiKey(provider: ProviderName, settings: ReturnType<typeof readSettings>): string {
  const generic = process.env.SSA_LLM_API_KEY || settings.llmApiKey;
  if (generic) return generic;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY || settings.deepseekApiKey;
  if (provider === "openai") return process.env.OPENAI_API_KEY || settings.openaiApiKey;
  if (provider === "openrouter") return process.env.OPENROUTER_API_KEY || settings.openrouterApiKey;
  if (provider === "dashscope") return process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || "";
  if (provider === "dashscope-coding-plan") return process.env.DASHSCOPE_CODING_PLAN_API_KEY || process.env.QWEN_CODING_PLAN_API_KEY || "";
  if (provider === "zhipu") return process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || "";
  if (provider === "zhipu-coding-plan") return process.env.ZHIPU_CODING_PLAN_API_KEY || process.env.GLM_CODING_PLAN_API_KEY || process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || "";
  if (provider === "moonshot") return process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY || "";
  if (provider === "kimi-code") return process.env.KIMI_CODE_API_KEY || process.env.KIMI_CODING_PLAN_API_KEY || "";
  if (provider === "doubao") return process.env.DOUBAO_API_KEY || process.env.VOLCENGINE_API_KEY || process.env.ARK_API_KEY || "";
  if (provider === "doubao-coding-plan") return process.env.DOUBAO_CODING_PLAN_API_KEY || process.env.VOLCENGINE_CODING_PLAN_API_KEY || process.env.ARK_CODING_PLAN_API_KEY || "";
  if (provider === "qianfan") return process.env.QIANFAN_API_KEY || process.env.BAIDU_API_KEY || "";
  if (provider === "hunyuan") return process.env.HUNYUAN_API_KEY || process.env.TENCENT_HUNYUAN_API_KEY || "";
  return "";
}

function providerRequiresApiKey(provider: ProviderName): boolean {
  return providerMode(provider) === "cloud";
}

function providerDefaultModel(provider: ProviderName, requested: string | undefined): string {
  if (provider === "deepseek") return directDeepSeekModel(requested);
  if (provider === "openai") return directOpenAiModel(requested);
  if (provider === "openrouter") return openRouterModel(requested);
  const trimmed = requested?.trim();
  return trimmed && trimmed !== "mock" ? trimmed : "";
}

function llmTimeoutMs(): number {
  const configured = Number(process.env.SSA_LLM_TIMEOUT_MS || "");
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 8000;
}

function resolveProvider(): ProviderConfig | null {
  const settings = readSettings();
  const requestedProvider = normalizeProvider(process.env.SSA_LLM_PROVIDER) || normalizeProvider(settings.llmProvider);
  const configuredModel = process.env.SSA_LLM_MODEL || settings.defaultModel;
  const configuredBaseUrl = process.env.SSA_LLM_BASE_URL || settings.llmBaseUrl;

  if (requestedProvider === "mock") return null;
  if (requestedProvider) {
    const apiKey = providerApiKey(requestedProvider, settings);
    const requiresApiKey = providerRequiresApiKey(requestedProvider);
    const model = providerDefaultModel(requestedProvider, configuredModel);
    if (!model) return null;
    if (requiresApiKey && !apiKey) return null;
    return {
      provider: requestedProvider,
      apiKey,
      model,
      endpoint: providerEndpoint(requestedProvider, configuredBaseUrl),
      mode: providerMode(requestedProvider),
      requiresApiKey,
    };
  }

  if (configuredBaseUrl) {
    const model = providerDefaultModel("local-openai", configuredModel);
    if (!model) return null;
    return {
      provider: "local-openai",
      apiKey: providerApiKey("local-openai", settings),
      model,
      endpoint: providerEndpoint("local-openai", configuredBaseUrl),
      mode: "local",
      requiresApiKey: false,
    };
  }

  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY || settings.deepseekApiKey;
  const openAiApiKey = process.env.OPENAI_API_KEY || settings.openaiApiKey;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || settings.openrouterApiKey;

  if (deepSeekApiKey) {
    const model = directDeepSeekModel(configuredModel);
    if (!model) return null;
    return {
      provider: "deepseek",
      apiKey: deepSeekApiKey,
      model,
      endpoint: providerEndpoint("deepseek"),
      mode: "cloud",
      requiresApiKey: true,
    };
  }
  if (openAiApiKey) {
    const model = directOpenAiModel(configuredModel);
    if (!model) return null;
    return {
      provider: "openai",
      apiKey: openAiApiKey,
      model,
      endpoint: providerEndpoint("openai"),
      mode: "cloud",
      requiresApiKey: true,
    };
  }
  if (openRouterApiKey) {
    const model = openRouterModel(configuredModel);
    if (!model) return null;
    return {
      provider: "openrouter",
      apiKey: openRouterApiKey,
      model,
      endpoint: providerEndpoint("openrouter"),
      mode: "cloud",
      requiresApiKey: true,
    };
  }

  return null;
}

export interface LlmRuntimeStatus {
  provider: ProviderName;
  mode: ProviderMode;
  readiness: "local_model_ready" | "cloud_model_ready" | "mock_fallback";
  configured: boolean;
  source: "provider" | "mock";
  model: string;
  endpoint: string | null;
  requiresApiKey: boolean;
}

export function getLlmRuntimeStatus(): LlmRuntimeStatus {
  const provider = resolveProvider();
  if (!provider) {
    return {
      provider: "mock",
      mode: "mock",
      readiness: "mock_fallback",
      configured: false,
      source: "mock",
      model: "mock",
      endpoint: null,
      requiresApiKey: false,
    };
  }
  return {
    provider: provider.provider,
    mode: provider.mode,
    readiness: provider.mode === "local" ? "local_model_ready" : "cloud_model_ready",
    configured: true,
    source: "provider",
    model: provider.model,
    endpoint: provider.endpoint,
    requiresApiKey: provider.requiresApiKey,
  };
}

async function runChatCompletionTask(
  request: LlmRequest,
  config: ProviderConfig
): Promise<LlmResult | null> {
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(llmTimeoutMs()),
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: request.task === "draft" ? 0.4 : 0.1,
        messages: [
          { role: "system", content: systemPrompt(request.task) },
          {
            role: "user",
            content: JSON.stringify({
              task: request.task,
              workspaceId: request.workspaceId || null,
              input: request.input,
              context: request.context || {},
            }),
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    return {
      provider: config.provider,
      source: "provider",
      text,
      confidence: 0.6,
      structured: {
        task: request.task,
        workspaceId: request.workspaceId || null,
        model: data.model || config.model,
      },
    };
  } catch {
    return null;
  }
}

export async function runLlmTask(request: LlmRequest): Promise<LlmResult> {
  const provider = resolveProvider();
  const modelName = provider?.model || "mock";
  const workspaceId = request.workspaceId || "local";
  const cacheInput = {
    workspaceId,
    taskType: request.task,
    modelName,
    promptVersion: String(request.context?.promptVersion || LLM_PROMPT_VERSION),
    input: JSON.stringify({
      input: request.input,
      context: request.context || {},
    }),
  };
  const cached = getLlmCacheEntry(cacheInput);
  if (cached) return annotateLlmResultWithPolicy(request.task, cached);

  if (provider) {
    const result = await runChatCompletionTask(request, provider);
    if (result) {
      const annotated = annotateLlmResultWithPolicy(request.task, result);
      setLlmCacheEntry(cacheInput, annotated);
      return annotated;
    }
  }

  const fallback = annotateLlmResultWithPolicy(request.task, fallbackForTask(request));
  setLlmCacheEntry(cacheInput, fallback);
  return fallback;
}

import type { LlmRequest, LlmResult } from "./types";
import { readSettings } from "../config-store";

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

type ProviderName = "mock" | "deepseek" | "openai" | "openrouter";

interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  model: string;
  endpoint: string;
}

const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-pro";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-v4-pro";

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
  if (!model || model.includes("/") || model === "mock") return OPENAI_DEFAULT_MODEL;
  if (!model.startsWith("gpt-") && !model.startsWith("o")) return OPENAI_DEFAULT_MODEL;
  return model;
}

function openRouterModel(model: string | undefined): string {
  if (!model || model === "mock") return OPENROUTER_DEFAULT_MODEL;
  const deepSeekModel = directDeepSeekModel(model);
  if (deepSeekModel !== DEEPSEEK_DEFAULT_MODEL || /deepseek/i.test(model)) {
    return `deepseek/${deepSeekModel}`;
  }
  return model;
}

function providerEndpoint(provider: Exclude<ProviderName, "mock">): string {
  if (provider === "deepseek") {
    const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  }
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  return "https://openrouter.ai/api/v1/chat/completions";
}

function llmTimeoutMs(): number {
  const configured = Number(process.env.SSA_LLM_TIMEOUT_MS || "");
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 8000;
}

function resolveProvider(): ProviderConfig | null {
  const settings = readSettings();
  const requestedProvider = process.env.SSA_LLM_PROVIDER?.toLowerCase();
  const deepSeekApiKey = process.env.DEEPSEEK_API_KEY || settings.deepseekApiKey;
  const openAiApiKey = process.env.OPENAI_API_KEY || settings.openaiApiKey;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || settings.openrouterApiKey;
  const configuredModel = process.env.SSA_LLM_MODEL || settings.defaultModel;

  if (requestedProvider === "mock") return null;
  if (requestedProvider === "deepseek") {
    return deepSeekApiKey
      ? {
        provider: "deepseek",
        apiKey: deepSeekApiKey,
        model: directDeepSeekModel(configuredModel),
        endpoint: providerEndpoint("deepseek"),
      }
      : null;
  }
  if (requestedProvider === "openai") {
    return openAiApiKey
      ? {
        provider: "openai",
        apiKey: openAiApiKey,
        model: directOpenAiModel(configuredModel),
        endpoint: providerEndpoint("openai"),
      }
      : null;
  }
  if (requestedProvider === "openrouter") {
    return openRouterApiKey
      ? {
        provider: "openrouter",
        apiKey: openRouterApiKey,
        model: openRouterModel(configuredModel),
        endpoint: providerEndpoint("openrouter"),
      }
      : null;
  }

  if (deepSeekApiKey) {
    return {
      provider: "deepseek",
      apiKey: deepSeekApiKey,
      model: directDeepSeekModel(configuredModel),
      endpoint: providerEndpoint("deepseek"),
    };
  }
  if (openAiApiKey) {
    return {
      provider: "openai",
      apiKey: openAiApiKey,
      model: directOpenAiModel(configuredModel),
      endpoint: providerEndpoint("openai"),
    };
  }
  if (openRouterApiKey) {
    return {
      provider: "openrouter",
      apiKey: openRouterApiKey,
      model: openRouterModel(configuredModel),
      endpoint: providerEndpoint("openrouter"),
    };
  }

  return null;
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
        Authorization: `Bearer ${config.apiKey}`,
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
  if (provider) {
    const result = await runChatCompletionTask(request, provider);
    if (result) return result;
  }

  return fallbackForTask(request);
}

/**
 * SSA LLM Provider Adapter
 *
 * Thin wrapper over LLM API calls. Supports:
 * - DashScope (Qwen) via OpenAI-compatible endpoint
 * - OpenAI-compatible providers
 * - Mock mode for testing without API keys
 *
 * LLM is a function: input → prompt → structured output. No streaming unless UI needs it.
 */

import { getConfig } from "./config";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
  mock: boolean;
}

const MOCK_RESPONSES: Record<string, string> = {
  classify: JSON.stringify({ intent: "inquiry", confidence: 0.92 }),
  extract: JSON.stringify({ company: "Acme Corp", contact: "John", product: "USB-C cables" }),
  draft: "Thank you for your inquiry. We'd be happy to provide a quotation for the requested items.",
  summarize: "Key findings: competitive pricing detected, 3 new market entrants identified.",
  translate: "[Translated content placeholder]",
  default: "This is a mock LLM response for testing.",
};

function detectMockIntent(messages: LLMMessage[]): string {
  const system = messages.find((m) => m.role === "system")?.content || "";
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content || "";
  const combined = (system + " " + lastUser).toLowerCase();
  if (combined.includes("classify") || combined.includes("intent")) return "classify";
  if (combined.includes("extract") || combined.includes("parse")) return "extract";
  if (combined.includes("draft") || combined.includes("write") || combined.includes("compose")) return "draft";
  if (combined.includes("summar")) return "summarize";
  if (combined.includes("translat")) return "translate";
  return "default";
}

async function callMock(options: LLMRequestOptions): Promise<LLMResponse> {
  const intent = detectMockIntent(options.messages);
  return {
    content: MOCK_RESPONSES[intent] || MOCK_RESPONSES.default,
    model: "mock",
    usage: { promptTokens: 0, completionTokens: 0 },
    mock: true,
  };
}

async function callOpenAICompatible(options: LLMRequestOptions): Promise<LLMResponse> {
  const config = getConfig();
  const url = `${config.llm.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: options.model || config.llm.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 2048,
  };
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content || "",
    model: data.model || options.model || config.llm.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
    },
    mock: false,
  };
}

export async function llmCall(options: LLMRequestOptions): Promise<LLMResponse> {
  const config = getConfig();
  if (config.llm.mockMode) {
    return callMock(options);
  }
  return callOpenAICompatible(options);
}

export { MOCK_RESPONSES };

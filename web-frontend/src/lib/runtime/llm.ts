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

async function runOpenRouterTask(request: LlmRequest): Promise<LlmResult | null> {
  const settings = readSettings();
  const apiKey = process.env.OPENROUTER_API_KEY || settings.openrouterApiKey;
  if (!apiKey) return null;

  const model = process.env.SSA_LLM_MODEL || settings.defaultModel || "openai/gpt-4o-mini";
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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
      provider: "openrouter",
      source: "provider",
      text,
      confidence: 0.6,
      structured: {
        task: request.task,
        workspaceId: request.workspaceId || null,
        model: data.model || model,
      },
    };
  } catch {
    return null;
  }
}

export async function runLlmTask(request: LlmRequest): Promise<LlmResult> {
  const provider = (process.env.SSA_LLM_PROVIDER || "mock").toLowerCase();

  if (provider === "openrouter") {
    const result = await runOpenRouterTask(request);
    if (result) return result;
  }

  return fallbackForTask(request);
}

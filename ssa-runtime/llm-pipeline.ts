/**
 * SSA LLM Pipeline
 *
 * Unified entry point for all LLM tasks in SSA.
 * Pattern: DB → context assembly → prompt → LLM → structured output
 *
 * The LLM is stateless. This pipeline gives it memory by injecting
 * customer context from the CRM into every prompt.
 */

import { llmCall, type LLMMessage, type LLMResponse } from "./llm-provider";
import { buildCustomerContext, type ContextBundle } from "./context-builder";

export type TaskType =
  | "classify_intent"
  | "extract_structured"
  | "draft_reply"
  | "translate"
  | "summarize_research"
  | "competitor_analysis"
  | "rewrite_tone";

export interface PipelineInput {
  task: TaskType;
  customerEmail?: string;
  content: string;
  language?: string;
  extraContext?: string;
  jsonMode?: boolean;
}

export interface PipelineOutput {
  task: TaskType;
  result: string;
  parsed: Record<string, unknown> | null;
  context: ContextBundle;
  model: string;
  mock: boolean;
}

const SYSTEM_PROMPTS: Record<TaskType, string> = {
  classify_intent: `You are an expert B2B trade email analyst for an electronics cable manufacturer.
Classify the email into ONE intent and return JSON:
{"intent":"<id>","confidence":0.0-1.0,"products":[],"urgency":"high|medium|low","language":"en|zh|other"}
Intents: inquiry, quotation_request, order, complaint, follow_up, negotiation, spam, other.`,

  extract_structured: `You are a structured data extraction engine for B2B trade emails.
Extract key fields and return JSON:
{"company":"","contact":"","products":[],"quantity":null,"deadline":"","payment_terms":"","special_requirements":""}
Only include fields you can confidently extract. Use null for uncertain fields.`,

  draft_reply: `You are a professional B2B sales assistant for an electronics cable manufacturer.
Draft a concise, professional reply email. Match the customer's language.
Consider the customer's history and current stage when choosing tone and content.
Return the email body only, no subject line.`,

  translate: `You are a professional translator for B2B trade communications.
Translate the content accurately while maintaining professional tone.
Preserve technical terms and product specifications.
Return only the translated text.`,

  summarize_research: `You are a B2B market research analyst.
Summarize the key findings relevant to sales strategy.
Focus on: market position, pricing intelligence, product gaps, and opportunities.
Return a concise summary (max 200 words).`,

  competitor_analysis: `You are a competitive intelligence analyst for electronics cable manufacturing.
Analyze the competitor information and provide actionable insights.
Return JSON: {"competitor":"","strengths":[],"weaknesses":[],"price_position":"above|at|below","threat_level":"high|medium|low","recommended_action":""}`,

  rewrite_tone: `You are a professional email editor.
Rewrite the content with the requested tone while preserving all factual information.
Return only the rewritten text.`,
};

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const context = input.customerEmail
    ? buildCustomerContext(input.customerEmail)
    : { customer: null, promptFragment: "" };

  const systemPrompt = SYSTEM_PROMPTS[input.task];
  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject customer context if available
  if (context.promptFragment) {
    messages.push({
      role: "user",
      content: `${context.promptFragment}\n\n---\n\n${input.content}`,
    });
  } else {
    messages.push({ role: "user", content: input.content });
  }

  // Add language instruction if specified
  if (input.language) {
    messages[0].content += `\nRespond in: ${input.language}`;
  }

  // Add extra context if provided
  if (input.extraContext) {
    messages[0].content += `\n\nADDITIONAL CONTEXT:\n${input.extraContext}`;
  }

  const useJson = input.jsonMode ??
    ["classify_intent", "extract_structured", "competitor_analysis"].includes(input.task);

  const response: LLMResponse = await llmCall({
    messages,
    jsonMode: useJson,
    temperature: input.task === "draft_reply" ? 0.7 : 0.2,
  });

  let parsed: Record<string, unknown> | null = null;
  if (useJson) {
    try {
      parsed = JSON.parse(response.content);
    } catch {
      parsed = null;
    }
  }

  return {
    task: input.task,
    result: response.content,
    parsed,
    context,
    model: response.model,
    mock: response.mock,
  };
}

export { buildCustomerContext } from "./context-builder";

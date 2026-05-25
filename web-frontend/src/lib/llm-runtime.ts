import { runPipeline } from "../../../ssa-runtime/index";
import type { ReplyOption, ReplyStyle } from "@/types/inbox";

export interface RuntimeReplyDraftInput {
  emailId: string;
  from?: string;
  subject?: string;
  body?: string;
  language?: string;
}

export interface RuntimeReplyDraft {
  draftId: string;
  uid: string;
  from: string;
  subject: string;
  options: ReplyOption[];
  createdAt: string;
  source: "ssa-runtime-llm" | "ssa-runtime-mock" | "ssa-runtime-template";
  note?: string;
}

const DEFAULT_METRICS: Record<ReplyStyle, ReplyOption["key_metrics"]> = {
  steady: {
    discount: "operator review",
    margin: "protected",
    lead_time: "confirm",
    special: "certs + samples",
  },
  aggressive: {
    discount: "conditional",
    margin: "review",
    lead_time: "priority",
    special: "deadline close",
  },
  creative: {
    discount: "tiered",
    margin: "balanced",
    lead_time: "split option",
    special: "partnership angle",
  },
};

function replySubject(subject?: string): string {
  const clean = subject?.trim() || "Customer Inquiry";
  return clean.toLowerCase().startsWith("re:") ? clean : `Re: ${clean}`;
}

function buildPrompt(input: RuntimeReplyDraftInput): string {
  return [
    `From: ${input.from || "unknown customer"}`,
    `Subject: ${input.subject || "Customer Inquiry"}`,
    "",
    input.body || "",
  ].join("\n");
}

function strategy(
  style: ReplyStyle,
  title: string,
  subtitle: string,
  outline: string[],
  expectedOutcome: string,
  riskLevel: ReplyOption["risk_level"],
  fullEmail?: string
): ReplyOption {
  return {
    id: `runtime-${style}`,
    style,
    icon: style,
    title,
    subtitle,
    outline,
    key_metrics: DEFAULT_METRICS[style],
    expected_outcome: expectedOutcome,
    risk_level: riskLevel,
    full_email: fullEmail,
  };
}

function buildOptions(llmDraft?: string): ReplyOption[] {
  return [
    strategy(
      "steady",
      "Steady",
      llmDraft ? "Use the runtime draft and keep terms conservative" : "Conservative operator-review reply",
      [
        "Acknowledge the request and restate the customer need",
        "Confirm only facts already known from the thread",
        "Ask for missing specs before quoting risky terms",
        "Keep any price or delivery promise behind approval",
      ],
      "Low-risk response that preserves trust and keeps the deal moving",
      "low",
      llmDraft
    ),
    strategy(
      "aggressive",
      "Aggressive",
      "Move toward close while keeping guardrails visible",
      [
        "Lead with urgency and a clear next action",
        "Offer conditional pricing or timeline language only",
        "Ask the operator to verify margin before sending",
        "Use approval-gated language for any customer-facing commitment",
      ],
      "Higher close pressure, but requires Wilson to review commercial terms",
      "medium"
    ),
    strategy(
      "creative",
      "Creative",
      "Create an alternative path without promising external action",
      [
        "Offer a sample, split shipment, or qualification-batch path",
        "Differentiate Farreach on certification and reliability",
        "Suggest a follow-up call or factory proof point",
        "Keep final commitments editable in the draft editor",
      ],
      "Gives the operator a relationship-building option for uncertain deals",
      "low"
    ),
  ];
}

export async function generateRuntimeReplyDraft(
  input: RuntimeReplyDraftInput
): Promise<RuntimeReplyDraft> {
  const base = {
    draftId: `draft-runtime-${Date.now()}`,
    uid: input.emailId,
    from: input.from || "",
    subject: replySubject(input.subject),
    createdAt: new Date().toISOString(),
  };

  try {
    const output = await runPipeline({
      task: "draft_reply",
      customerEmail: input.from,
      content: buildPrompt(input),
      language: input.language || "en",
      extraContext:
        "Draft for human review only. Do not claim the email was sent. Do not promise discounts, price floors, shipping dates, or payment terms unless the operator approves.",
    });

    return {
      ...base,
      options: buildOptions(output.result),
      source: output.mock ? "ssa-runtime-mock" : "ssa-runtime-llm",
      note: output.mock ? "Generated through SSA runtime mock mode." : undefined,
    };
  } catch {
    return {
      ...base,
      options: buildOptions(),
      source: "ssa-runtime-template",
      note: "Runtime LLM unavailable; deterministic strategy templates returned.",
    };
  }
}

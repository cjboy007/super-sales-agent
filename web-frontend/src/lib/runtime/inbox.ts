import type { InboundEmail, ReplyStyle } from "../../types/inbox";
import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision } from "./types";

type UnknownRecord = Record<string, unknown>;

export interface InboxListRuntimeResult {
  success: true;
  data: InboundEmail[];
  total: number;
  stats: unknown;
  sideEffect?: SideEffectDecision;
}

export interface InboxDetailRuntimeResult {
  success: boolean;
  data?: InboundEmail;
  error?: string;
  sideEffect?: SideEffectDecision;
}

export interface InboxReplyInput {
  workspaceId: string;
  emailId: string;
  from?: unknown;
  subject?: unknown;
  body?: unknown;
  content?: unknown;
  language?: unknown;
}

export interface InboxSendInput {
  workspaceId: string;
  emailId: string;
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  content?: unknown;
  html?: unknown;
}

export interface InboxStyleSelectionInput {
  workspaceId: string;
  emailId: string;
  style?: unknown;
}

function farreachUrl() {
  return process.env.SSA_FARREACH_URL || "http://localhost:3456";
}

function isFarreachBridgeEnabled() {
  return process.env.SSA_ENABLE_FARREACH_BRIDGE === "true";
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function requestInboxFetch(runtime: SalesRuntime, workspaceId: string, payload: {
  summary: string;
  idempotencyKey: string;
  payload: UnknownRecord;
}): SideEffectDecision | undefined {
  if (!isFarreachBridgeEnabled()) return undefined;
  return runtime.requestSideEffect({
    kind: "imap.fetch",
    workspaceId,
    summary: payload.summary,
    payload: payload.payload,
    idempotencyKey: payload.idempotencyKey,
  });
}

export async function getRuntimeInbox(runtime: SalesRuntime, workspaceId: string, limit: number): Promise<InboxListRuntimeResult> {
  const workspace = runtime.getWorkspace(workspaceId);
  const normalizedLimit = Math.min(100, Math.max(1, limit || 20));
  const sideEffect = requestInboxFetch(runtime, workspace.id, {
    summary: `Fetch inbox list for ${workspace.id}`,
    payload: {
      limit: normalizedLimit,
      source: "inbox.list",
    },
    idempotencyKey: `${workspace.id}:inbox:list:${normalizedLimit}`,
  });

  if (sideEffect?.status === "allowed") {
    try {
      const res = await fetch(`${farreachUrl()}/api/v1/inbox?limit=${normalizedLimit}`, {
        next: { revalidate: 30 },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.emails && data.emails.length > 0) {
          return {
            success: true,
            data: data.emails,
            total: data.count,
            stats: runtime.memory.getInbox(workspace.id, { limit: normalizedLimit }).stats,
            sideEffect,
          };
        }
      }
    } catch {
      // Fall through to local memory.
    }
  }

  const localInbox = runtime.memory.getInbox(workspace.id, { limit: normalizedLimit });
  return {
    success: true,
    data: localInbox.data || [],
    total: localInbox.total,
    stats: localInbox.stats,
    sideEffect,
  };
}

export async function getRuntimeInboxEmail(
  runtime: SalesRuntime,
  workspaceId: string,
  emailId: string
): Promise<InboxDetailRuntimeResult> {
  const workspace = runtime.getWorkspace(workspaceId);
  const sideEffect = requestInboxFetch(runtime, workspace.id, {
    summary: `Fetch inbox email ${emailId} for ${workspace.id}`,
    payload: {
      emailId,
      source: "inbox.detail",
    },
    idempotencyKey: `${workspace.id}:inbox:${emailId}:fetch`,
  });

  if (sideEffect?.status === "allowed") {
    try {
      const res = await fetch(`${farreachUrl()}/api/v1/inbox/${emailId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.email) {
          return { success: true, data: data.email, sideEffect };
        }
      }
    } catch {
      // Fall through to local memory.
    }
  }

  const email = runtime.memory.getInboxEmail(workspace.id, emailId);
  return { ...email, sideEffect };
}

async function tryBridgeReply(input: InboxReplyInput): Promise<unknown | null> {
  if (!isFarreachBridgeEnabled()) return null;
  try {
    const res = await fetch(`${farreachUrl()}/api/v1/inbox/${input.emailId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: input.emailId,
        from: stringValue(input.from),
        subject: stringValue(input.subject),
        body: stringValue(input.body, stringValue(input.content)),
        language: stringValue(input.language, "en"),
      }),
    });
    if (res.ok) return res.json();
  } catch {
    // Fall through to local LLM.
  }
  return null;
}

export async function draftRuntimeInboxReply(runtime: SalesRuntime, input: InboxReplyInput) {
  const workspace = runtime.getWorkspace(input.workspaceId);
  const bridge = await tryBridgeReply({ ...input, workspaceId: workspace.id });
  if (bridge) return bridge;

  const sourceEmail = runtime.memory.getInboxEmail(workspace.id, input.emailId).data;
  const from = stringValue(input.from, sourceEmail?.from_name || sourceEmail?.from_email || "");
  const subject = stringValue(input.subject, sourceEmail?.subject || "Your inquiry");
  const content = stringValue(input.body, stringValue(input.content, sourceEmail?.body_text || ""));
  const language = stringValue(input.language, "en");
  const llm = await runtime.runLlm({
    task: "draft",
    workspaceId: workspace.id,
    input: [
      `From: ${from}`,
      `Subject: ${subject}`,
      `Language: ${language}`,
      "",
      content,
    ].join("\n"),
    context: {
      emailId: input.emailId,
      language,
      source: "inbox.reply",
    },
  });

  const firstName = from.trim().split(/\s+/)[0] || "there";

  return {
    success: true,
    source: llm.source,
    provider: llm.provider,
    confidence: llm.confidence,
    draft: llm.text,
    full_email: {
      subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
      body: [
        `Dear ${firstName},`,
        "",
        llm.text,
        "",
        "Best regards,",
        workspace.identity.signature || workspace.identity.senderName || "Sales Team",
      ].join("\n"),
      attachments: [],
    },
  };
}

export async function sendRuntimeInboxReply(runtime: SalesRuntime, input: InboxSendInput) {
  const workspace = runtime.getWorkspace(input.workspaceId);
  const to = stringValue(input.to, "recipient@example.com");
  const subject = stringValue(input.subject, "(no subject)");
  const sideEffect = runtime.requestSideEffect({
    kind: "email.send",
    workspaceId: workspace.id,
    summary: `Send inbox reply to ${to}: ${subject}`,
    payload: {
      emailId: input.emailId,
      to,
      subject,
      html: Boolean(input.html),
      source: "inbox.send",
    },
    idempotencyKey: `${workspace.id}:inbox:${input.emailId}:send`,
  });

  if (isFarreachBridgeEnabled() && sideEffect.status === "allowed") {
    try {
      const res = await fetch(`${farreachUrl()}/api/v1/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body: stringValue(input.body, stringValue(input.content)),
          html: input.html || false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          email_id: input.emailId,
          sent_at: data.sentAt || new Date().toISOString(),
          to,
          subject,
          sideEffect,
          message: data.detail || "Email sent successfully",
        };
      }
    } catch {
      // Fall through to local capture response.
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    success: true,
    email_id: input.emailId,
    sent_at: new Date().toISOString(),
    to,
    subject,
    blocked: true,
    sideEffect,
    message:
      sideEffect.status === "allowed"
        ? "Email captured locally. Real send bridge is unavailable."
        : sideEffect.reason,
  };
}

export async function selectRuntimeInboxReplyStyle(runtime: SalesRuntime, input: InboxStyleSelectionInput) {
  const workspace = runtime.getWorkspace(input.workspaceId);
  const email = runtime.memory.getInboxEmail(workspace.id, input.emailId);
  if (!email.success || !email.data) {
    return { success: false as const, error: "Email not found", status: 404 };
  }

  if (!isReplyStyle(input.style)) {
    return { success: false as const, error: "Option not found", status: 404 };
  }

  const option = email.data.options?.find((candidate) => candidate.style === input.style);
  if (!option) {
    return { success: false as const, error: "Option not found", status: 404 };
  }

  await new Promise((resolve) => setTimeout(resolve, 800));
  return {
    success: true as const,
    full_email: getFullEmail(input.emailId, input.style, email.data.from_name),
  };
}

function isReplyStyle(value: unknown): value is ReplyStyle {
  return value === "steady" || value === "aggressive" || value === "creative";
}

function getFullEmail(
  emailId: string,
  style: ReplyStyle,
  fromName: string
): { subject: string; body: string; attachments: string[] } {
  const firstName = fromName.split(" ")[0] || "there";
  const emails = MOCK_FULL_EMAILS[emailId];
  if (emails?.[style]) return emails[style];
  return getFallbackEmail(firstName, style);
}

const MOCK_FULL_EMAILS: Record<string, Partial<Record<ReplyStyle, { subject: string; body: string; attachments: string[] }>>> = {
  "email-001": {
    steady: {
      subject: "Re: Quotation for DisplayPort & USB-C Cables - Price Revision Request",
      body: `Dear Hans,

Thank you for your detailed feedback on our quotation. I understand budget alignment is critical for your Q3 planning, and I appreciate you sharing your target pricing.

Regarding your request for USD 2.80/pc (DP) and USD 1.60/pc (USB-C), I have discussed this with our production team. Given the volume of 5,000 + 8,000 pcs, we can offer the following revised pricing:

- DisplayPort 1.4 Cable (2m): USD 3.05/pc (down from USD 3.35)
- USB-C 3.2 Gen2 Cable (1m): USD 1.85/pc (down from USD 2.10)

This represents an 8-9% reduction from our original quote. While we cannot match the Shenzhen pricing directly, our offer includes:

1. Full CE + RoHS certification (certificates attached)
2. 100% electrical testing on every unit
3. 18-day production lead time with DHL Express shipping
4. 12-month quality warranty with free replacement

I would also like to offer a complimentary sample set (5 pcs each model) so your engineering team can verify build quality before committing. Samples can ship today via DHL, arriving in Munich within 4-5 business days.

Would this revised pricing work for your Q3 budget? I am happy to discuss further adjustments if you can confirm the order by May 18th.

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate_DP14.pdf", "RoHS_Test_Report.pdf", "Product_Datasheet_DP_USBC.pdf"],
    },
    aggressive: {
      subject: "Re: Quotation for DisplayPort & USB-C Cables - Price Revision Request",
      body: `Dear Hans,

I will be direct: I want to win this business, and I am prepared to make it happen.

After reviewing your target pricing and considering the 13,000 pcs total volume, here is my best offer:

- DisplayPort 1.4 Cable (2m): USD 2.88/pc
- USB-C 3.2 Gen2 Cable (1m): USD 1.68/pc

This is within 3-5% of your target, and significantly below our standard pricing. I can hold this rate under two conditions:

1. Order confirmation by May 16th (Friday)
2. 30% T/T deposit upon PI confirmation

Why move fast: Our Vietnam factory is scheduling Q3 production runs this week. Locking in now guarantees your 18-day lead time. Orders confirmed after May 20th will likely push to a 25-30 day timeline due to capacity allocation.

I am attaching our CE certificate for your compliance team. Samples are already packed; I just need your shipping address and they go out today via DHL Express (3-day delivery to Munich).

One call and we can close this. Are you available Thursday afternoon your time for a 10-minute call?

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate_DP14.pdf", "RoHS_Test_Report.pdf"],
    },
    creative: {
      subject: "Re: Quotation for DisplayPort & USB-C Cables - A Different Approach",
      body: `Dear Hans,

Thank you for your transparency about the competing offer from Shenzhen. Rather than simply matching their price, I would like to propose something that addresses your real concern: reliable supply with verified quality.

Here is what I am thinking:

Phase 1 - Qualification Order (500 pcs each model)
- Standard pricing applies (DP: USD 3.15/pc, USB-C: USD 1.95/pc)
- We ship within 10 days
- Your team tests and validates quality
- Full refund if products do not meet your specifications

Phase 2 - Volume Order (confirmed after Phase 1)
- DP 1.4: USD 2.95/pc | USB-C 3.2: USD 1.75/pc
- Dedicated production line allocation
- Free custom packaging design (your branding, your specs)
- Quarterly pricing locked for 12 months

Why this works for you:
You eliminate supplier risk without committing 13,000 pcs upfront. Your Shenzhen supplier may offer lower unit cost, but factor in potential quality failures, re-testing costs, and delivery delays; our total cost of ownership is competitive.

Additionally, I would like to invite you to a live video tour of our Vietnam production facility (10,000 sqm, 16 production lines, ISO 9001 certified). Seeing the operation firsthand gives you confidence that we can scale with your needs.

I can arrange the video call any day this week. Would Wednesday or Thursday work for you?

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate_DP14.pdf", "RoHS_Test_Report.pdf", "Company_Profile_2026.pdf", "Vietnam_Factory_Overview.pdf"],
    },
  },
};

function getFallbackEmail(
  firstName: string,
  style: ReplyStyle
): { subject: string; body: string; attachments: string[] } {
  const templates: Record<ReplyStyle, { subject: string; body: string; attachments: string[] }> = {
    steady: {
      subject: "Re: Your Inquiry",
      body: `Dear ${firstName},

Thank you for your inquiry. I have reviewed your requirements and would like to provide the following information.

Based on your specifications, we can offer competitive pricing with our standard terms:
- Production lead time: 15-18 working days
- Payment: 30% T/T deposit, 70% before shipment
- All products carry CE, RoHS, and FCC certifications
- Free samples available for quality verification

I have attached our relevant certificates and product datasheets for your reference. Please let me know if you would like to proceed with samples or if you have any questions about specifications.

Looking forward to your reply.

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate.pdf", "Product_Datasheet.pdf"],
    },
    aggressive: {
      subject: "Re: Your Inquiry - Limited Time Offer",
      body: `Dear ${firstName},

Thank you for reaching out. I have fast-tracked your request and have a special offer ready.

Given your volume requirements, I can offer our best pricing, but I need to be upfront: this rate is only available if we can confirm by end of this week. Our production schedule is filling up for Q3 and I want to make sure we can accommodate your timeline.

Here is what I am proposing:
- 10-12% below our standard list price
- Priority production slot (15-day lead time guaranteed)
- Samples shipped today via express courier

I would like to jump on a quick call to finalize details. Are you available tomorrow?

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate.pdf"],
    },
    creative: {
      subject: "Re: Your Inquiry - Partnership Proposal",
      body: `Dear ${firstName},

Thank you for your interest in Farreach Electronic. Instead of a standard quote, I would like to propose a partnership approach that creates more value for both sides.

I suggest we start with a small qualification batch so your team can verify our quality firsthand, with no large commitment required upfront. Once validated, we can discuss volume pricing with dedicated production allocation and custom packaging options.

I would also like to invite you to a virtual tour of our manufacturing facility. Seeing our 16 production lines and quality control process gives you confidence in our capabilities.

Would you be open to a brief video call this week to discuss?

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate.pdf", "Company_Profile_2026.pdf"],
    },
  };
  return templates[style];
}

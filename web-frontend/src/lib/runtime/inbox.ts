import fs from "fs";
import type { InboundEmail, ReplyStyle } from "../../types/inbox";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";
import { syncInboxEmailsToCustomers } from "./customer-activity";
import type { CustomerActivitySyncResult } from "./customer-activity";
import { ingestCustomerInteraction, resolveCustomerAffiliation } from "./customer-memory-ingestor";
import { verifyEmailAddress } from "./email-verification";
import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision } from "./types";

type UnknownRecord = Record<string, unknown>;

export interface InboxListRuntimeResult {
  success: true;
  data: InboundEmail[];
  total: number;
  stats: unknown;
  sideEffect?: SideEffectDecision;
  crm?: CustomerActivitySyncResult;
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
  decisionId?: unknown;
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

function isRealEmailSendEnabled() {
  return process.env.SSA_ENABLE_REAL_EMAIL_SEND === "true";
}

function canSendWithoutVerification() {
  return process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND === "true";
}

function verificationBlockDetail(status: string) {
  return `Email blocked: recipient verification is ${status}. Configure Hunter verification or approve an explicit unverified-send override.`;
}

function approvalBlockDetail() {
  return "Email blocked: approved side-effect decision is required before real customer send.";
}

function bridgeStatusFailureMessage(response: Response) {
  const status = response.status || "unknown";
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  return `Email bridge returned ${status}${statusText}. Retry after checking the send service.`;
}

function sendRequestLogPath(workspaceId: string) {
  return ensureSsaCompanyDataPath(workspaceId, "mail", "send-requests.json");
}

function inboxDraftCachePath(workspaceId: string) {
  return ensureSsaCompanyDataPath(workspaceId, ".jadenos", "cache", "inbox-drafts.json");
}

type FullInboxEmail = { subject: string; body: string; attachments: string[] };

interface InboxDraftCacheEntry {
  key: string;
  emailId: string;
  style: ReplyStyle;
  promptVersion: string;
  updatedAt: string;
  fullEmail: FullInboxEmail;
}

const INBOX_DRAFT_PROMPT_VERSION = "inbox.select.v1";

function readInboxDraftCache(workspaceId: string): InboxDraftCacheEntry[] {
  return readJsonFile<InboxDraftCacheEntry[]>(inboxDraftCachePath(workspaceId), []);
}

function writeInboxDraftCache(workspaceId: string, entries: InboxDraftCacheEntry[]) {
  fs.writeFileSync(inboxDraftCachePath(workspaceId), JSON.stringify(entries.slice(-500), null, 2), "utf-8");
}

function draftCacheKey(emailId: string, style: ReplyStyle) {
  return `${emailId}:${style}:${INBOX_DRAFT_PROMPT_VERSION}`;
}

function getCachedInboxDraft(workspaceId: string, emailId: string, style: ReplyStyle): InboxDraftCacheEntry | null {
  const key = draftCacheKey(emailId, style);
  return readInboxDraftCache(workspaceId).find((entry) => entry.key === key) || null;
}

function setCachedInboxDraft(workspaceId: string, emailId: string, style: ReplyStyle, fullEmail: FullInboxEmail) {
  const key = draftCacheKey(emailId, style);
  const entries = readInboxDraftCache(workspaceId).filter((entry) => entry.key !== key);
  entries.push({
    key,
    emailId,
    style,
    promptVersion: INBOX_DRAFT_PROMPT_VERSION,
    updatedAt: new Date().toISOString(),
    fullEmail,
  });
  writeInboxDraftCache(workspaceId, entries);
}

function appendToSendRequestLog(workspaceId: string, email: string, subject: string, status = "blocked_local_preview") {
  let entries: Array<{ email: string; requested_at: string; subject: string; status: string }> = [];
  try {
    const raw = fs.readFileSync(sendRequestLogPath(workspaceId), "utf-8");
    entries = JSON.parse(raw);
  } catch {
    // File does not exist yet.
  }
  entries.push({
    email,
    requested_at: new Date().toISOString(),
    subject,
    status,
  });
  fs.writeFileSync(sendRequestLogPath(workspaceId), JSON.stringify(entries, null, 2), "utf-8");
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function approvedInboxSendDecision(runtime: SalesRuntime, input: InboxSendInput, to: string, subject: string): SideEffectDecision | null {
  const decisionId = stringValue(input.decisionId).trim();
  if (!decisionId) return null;
  const decision = runtime.getSideEffect(decisionId);
  if (!decision || decision.kind !== "email.send") return null;
  if (decision.workspaceId !== input.workspaceId) return null;
  const isApprovedForExecution = decision.status === "approved" ||
    (decision.status === "execution_failed" && Boolean(decision.approvedBy) && decision.execution?.canRetry !== false);
  if (!isApprovedForExecution) return null;
  if (stringValue(decision.payload.to).trim() !== to) return null;
  if (stringValue(decision.payload.subject).trim() !== subject) return null;
  if (stringValue(decision.payload.emailId).trim() !== input.emailId) return null;
  return decision;
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
          const crm = syncInboxEmailsToCustomers(runtime, workspace.id, data.emails, {
            source: "inbox-bridge",
          });
          return {
            success: true,
            data: data.emails,
            total: data.count,
            stats: runtime.memory.getInbox(workspace.id, { limit: normalizedLimit }).stats,
            sideEffect,
            crm,
          };
        }
      }
    } catch {
      // Fall through to local memory.
    }
  }

  const localInbox = runtime.memory.getInbox(workspace.id, { limit: normalizedLimit });
  const crm = syncInboxEmailsToCustomers(runtime, workspace.id, localInbox.data || [], {
    source: "local-inbox",
  });
  return {
    success: true,
    data: localInbox.data || [],
    total: localInbox.total,
    stats: localInbox.stats,
    sideEffect,
    crm,
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
          syncInboxEmailsToCustomers(runtime, workspace.id, [data.email], {
            source: "inbox-bridge",
          });
          return { success: true, data: data.email, sideEffect };
        }
      }
    } catch {
      // Fall through to local memory.
    }
  }

  const email = runtime.memory.getInboxEmail(workspace.id, emailId);
  if (email.success && email.data) {
    syncInboxEmailsToCustomers(runtime, workspace.id, [email.data], {
      source: "local-inbox",
    });
  }
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
  const sourceAddress = sourceEmail?.from_email || from;
  const customerResolution = resolveCustomerAffiliation(runtime, {
    workspaceId: workspace.id,
    email: sourceAddress,
    contactName: sourceEmail?.from_name || from,
    subject,
    body: content,
  });
  const customerMemory = runtime.getCustomerMemoryContext({
    workspaceId: workspace.id,
    query: [
      customerResolution.customerName,
      customerResolution.contactEmail,
      sourceAddress,
      subject,
    ].filter(Boolean).join(" "),
    customerId: customerResolution.customerId,
    customerName: customerResolution.customerName,
    limit: 8,
  });
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
      customerMemory,
      customerResolution,
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

  const rememberReply = (status: string, decision: SideEffectDecision) => ingestCustomerInteraction(runtime, {
    workspaceId: workspace.id,
    direction: "inbox_reply_sent",
    email: to,
    subject,
    body: stringValue(input.body, stringValue(input.content)),
    occurredAt: new Date().toISOString(),
    source: {
      type: "email",
      id: decision.id,
    },
    metadata: {
      emailId: input.emailId,
      status,
      sideEffectDecisionId: decision.id,
    },
    idempotencyKey: `${workspace.id}:inbox-reply:${input.emailId}:${decision.id}:${status}`,
  });

  if (isRealEmailSendEnabled()) {
    const approval = approvedInboxSendDecision(runtime, { ...input, workspaceId: workspace.id }, to, subject);
    if (!approval) {
      appendToSendRequestLog(workspace.id, to, subject, "blocked_missing_approval_record");
      rememberReply("blocked_missing_approval_record", sideEffect);
      return {
        success: true,
        email_id: input.emailId,
        sent_at: new Date().toISOString(),
        to,
        subject,
        blocked: true,
        sideEffect,
        message: approvalBlockDetail(),
      };
    }

    const verification = await verifyEmailAddress({
      workspaceId: workspace.id,
      email: to,
    });
    if (verification.status !== "valid" && !canSendWithoutVerification()) {
      appendToSendRequestLog(workspace.id, to, subject, `blocked_verification_${verification.status}`);
      rememberReply(`blocked_verification_${verification.status}`, approval);
      runtime.recordSideEffectFailed(approval.id, {
        error: verificationBlockDetail(verification.status),
        canRetry: true,
      });
      return {
        success: true,
        email_id: input.emailId,
        sent_at: new Date().toISOString(),
        to,
        subject,
        blocked: true,
        sideEffect,
        verification,
        message: verificationBlockDetail(verification.status),
      };
    }

    if (isFarreachBridgeEnabled()) {
      let res: Response | null = null;
      try {
        res = await fetch(`${farreachUrl()}/api/v1/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            subject,
            body: stringValue(input.body, stringValue(input.content)),
            html: input.html || false,
          }),
        });
      } catch (error) {
        runtime.recordSideEffectFailed(approval.id, {
          error: error instanceof Error ? error.message : String(error),
          canRetry: true,
        });
      }

      if (res?.ok) {
        const data = await res.json();
        try {
          const executedSideEffect = runtime.recordSideEffectExecuted(approval.id, {
            result: {
              to,
              subject,
              sentAt: data.sentAt || null,
            },
          });
          rememberReply("sent", executedSideEffect);
          return {
            success: true,
            email_id: input.emailId,
            sent_at: data.sentAt || new Date().toISOString(),
            to,
            subject,
            sideEffect: executedSideEffect,
            message: data.detail || "Email sent successfully",
          };
        } catch (error) {
          runtime.recordSideEffectFailed(approval.id, {
            error: error instanceof Error ? error.message : String(error),
            canRetry: true,
          });
          throw error;
        }
      } else if (res) {
        runtime.recordSideEffectFailed(approval.id, {
          error: bridgeStatusFailureMessage(res),
          canRetry: true,
        });
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 600));
  appendToSendRequestLog(
    workspace.id,
    to,
    subject,
    isRealEmailSendEnabled() ? "blocked_bridge_unavailable" : "blocked_local_preview"
  );
  rememberReply(isRealEmailSendEnabled() ? "blocked_bridge_unavailable" : "blocked_local_preview", sideEffect);
  return {
    success: true,
    email_id: input.emailId,
    sent_at: new Date().toISOString(),
    to,
    subject,
    blocked: true,
    sideEffect,
    message:
      isRealEmailSendEnabled()
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

  const cached = getCachedInboxDraft(workspace.id, input.emailId, input.style);
  if (cached) {
    return {
      success: true as const,
      full_email: cached.fullEmail,
      cache: {
        hit: true,
        promptVersion: cached.promptVersion,
        updatedAt: cached.updatedAt,
      },
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 800));
  const fullEmail = getFullEmail(input.emailId, input.style, email.data.from_name);
  setCachedInboxDraft(workspace.id, input.emailId, input.style, fullEmail);
  return {
    success: true as const,
    full_email: fullEmail,
    cache: {
      hit: false,
      promptVersion: INBOX_DRAFT_PROMPT_VERSION,
    },
  };
}

function isReplyStyle(value: unknown): value is ReplyStyle {
  return value === "steady" || value === "aggressive" || value === "creative";
}

function getFullEmail(
  emailId: string,
  style: ReplyStyle,
  fromName: string
): FullInboxEmail {
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
Email: sales@example.com`,
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
Email: sales@example.com`,
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
Email: sales@example.com`,
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
Email: sales@example.com`,
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
Email: sales@example.com`,
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
Email: sales@example.com`,
      attachments: ["CE_Certificate.pdf", "Company_Profile_2026.pdf"],
    },
  };
  return templates[style];
}

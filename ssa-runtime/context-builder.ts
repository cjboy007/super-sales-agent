/**
 * SSA Context Builder
 *
 * Queries the sales-state DB for customer history and assembles
 * a context bundle that gets injected into LLM prompts.
 *
 * The LLM is stateless — this module gives it memory.
 */

import { getConfig } from "./config";
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

export interface CustomerContext {
  email: string;
  company: string | null;
  contactName: string | null;
  country: string | null;
  currentStage: string;
  followUpCount: number;
  lastContactAt: string | null;
  replyStatus: string;
  intent: string | null;
  emailHistory: EmailHistoryEntry[];
  recentReplies: ReplyEntry[];
}

export interface EmailHistoryEntry {
  subject: string;
  stage: string;
  followUpCount: number;
  sentAt: string;
}

export interface ReplyEntry {
  subject: string;
  bodyPreview: string;
  intent: string | null;
  receivedAt: string;
}

export interface ContextBundle {
  customer: CustomerContext | null;
  promptFragment: string;
}

const EMPTY_CONTEXT: ContextBundle = {
  customer: null,
  promptFragment: "No customer history available.",
};

export function buildCustomerContext(customerEmail: string): ContextBundle {
  const config = getConfig();
  const dbPath = path.join(config.paths.data, "sales-state.db");

  if (!fs.existsSync(dbPath)) {
    return EMPTY_CONTEXT;
  }

  try {
    const pythonCode = `
import sqlite3, json, sys
db_path = sys.argv[1]
email = sys.argv[2]

db = sqlite3.connect(db_path)
db.row_factory = sqlite3.Row

# Customer stage
stage = db.execute(
    "SELECT * FROM customer_stages WHERE email = ? LIMIT 1", (email,)
).fetchone()

# Email history (last 5)
emails = db.execute(
    "SELECT subject, stage, follow_up_count, sent_at FROM email_logs WHERE email = ? ORDER BY sent_at DESC LIMIT 5", (email,)
).fetchall()

# Recent replies (last 3)
replies = db.execute(
    "SELECT subject, body_preview, intent, received_at FROM replies WHERE email = ? ORDER BY received_at DESC LIMIT 3", (email,)
).fetchall()

result = {"customer": None, "emails": [], "replies": []}
if stage:
    result["customer"] = dict(stage)
result["emails"] = [dict(e) for e in emails]
result["replies"] = [dict(r) for r in replies]
db.close()
print(json.dumps(result))
`;

    const output = execFileSync("python3", ["-c", pythonCode, dbPath, customerEmail], {
      encoding: "utf-8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });

    const data = JSON.parse(output);
    const customer = buildCustomerFromDb(data, customerEmail);
    const promptFragment = formatContextForPrompt(customer);

    return { customer, promptFragment };
  } catch {
    return EMPTY_CONTEXT;
  }
}

function buildCustomerFromDb(data: any, email: string): CustomerContext {
  const c = data.customer || {};
  return {
    email,
    company: c.company || null,
    contactName: c.contact_name || null,
    country: c.country || null,
    currentStage: c.current_stage || "unknown",
    followUpCount: c.follow_up_count || 0,
    lastContactAt: c.last_contact_at || null,
    replyStatus: c.reply_status || "no_reply",
    intent: c.intent || null,
    emailHistory: (data.emails || []).map((e: any) => ({
      subject: e.subject || "",
      stage: e.stage || "",
      followUpCount: e.follow_up_count || 0,
      sentAt: e.sent_at || "",
    })),
    recentReplies: (data.replies || []).map((r: any) => ({
      subject: r.subject || "",
      bodyPreview: r.body_preview || "",
      intent: r.intent || null,
      receivedAt: r.received_at || "",
    })),
  };
}

function formatContextForPrompt(customer: CustomerContext): string {
  const lines: string[] = [];
  lines.push(`CUSTOMER CONTEXT:`);
  lines.push(`- Email: ${customer.email}`);
  if (customer.company) lines.push(`- Company: ${customer.company}`);
  if (customer.contactName) lines.push(`- Contact: ${customer.contactName}`);
  if (customer.country) lines.push(`- Country: ${customer.country}`);
  lines.push(`- Stage: ${customer.currentStage}`);
  lines.push(`- Follow-ups sent: ${customer.followUpCount}`);
  lines.push(`- Reply status: ${customer.replyStatus}`);

  if (customer.emailHistory.length > 0) {
    lines.push(`\nEMAIL HISTORY (recent):`);
    for (const e of customer.emailHistory.slice(0, 3)) {
      lines.push(`  [${e.sentAt}] ${e.subject} (stage: ${e.stage})`);
    }
  }

  if (customer.recentReplies.length > 0) {
    lines.push(`\nCUSTOMER REPLIES:`);
    for (const r of customer.recentReplies.slice(0, 3)) {
      lines.push(`  [${r.receivedAt}] ${r.subject}`);
      if (r.bodyPreview) lines.push(`    "${r.bodyPreview.slice(0, 150)}"`);
      if (r.intent) lines.push(`    Intent: ${r.intent}`);
    }
  }

  return lines.join("\n");
}

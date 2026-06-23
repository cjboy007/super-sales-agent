#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const DEFAULT_WORKSPACE = "farreach";
const DEFAULT_DATA_ROOT = path.join(os.homedir(), ".ssa", "data");
const MAX_EVENTS = 1000;
const MAX_SEEN_MESSAGES = Number.parseInt(process.env.SSA_INBOX_MONITOR_MAX_SEEN || "5000", 10);
const DEFAULT_SOURCE_MODE = "local";
const DEFAULT_INBOX_FOLDER = "INBOX";
const DEFAULT_PAGE_SIZE = 20;
const execFile = promisify(execFileCallback);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
}

function dataRootFromOptions(options = {}) {
  return path.resolve(options.dataRoot || process.env.SSA_DATA_ROOT || DEFAULT_DATA_ROOT);
}

function safeWorkspace(value) {
  return String(value || DEFAULT_WORKSPACE).replace(/[^a-zA-Z0-9._-]/g, "_") || DEFAULT_WORKSPACE;
}

function companyDir(dataRoot, workspace) {
  return path.join(dataRoot, "companies", workspace);
}

function inboxDir(dataRoot, workspace) {
  return path.join(companyDir(dataRoot, workspace), "inbox");
}

function statePath(dataRoot, workspace) {
  return path.join(inboxDir(dataRoot, workspace), "monitor-state.json");
}

function eventsPath(dataRoot, workspace) {
  return path.join(companyDir(dataRoot, workspace), "events", "events.json");
}

function customersPath(dataRoot, workspace) {
  return path.join(companyDir(dataRoot, workspace), "customers", "accounts.json");
}

function customerActivityPath(dataRoot, workspace) {
  return path.join(companyDir(dataRoot, workspace), "customers", "activity.json");
}

function sourcePath(dataRoot, workspace) {
  const dir = inboxDir(dataRoot, workspace);
  const json = path.join(dir, "incoming.json");
  const jsonl = path.join(dir, "incoming.jsonl");
  if (fs.existsSync(json)) return json;
  if (fs.existsSync(jsonl)) return jsonl;
  return null;
}

function parseJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readSourceMessages(filePath) {
  if (!filePath) return [];
  if (filePath.endsWith(".jsonl")) return parseJsonl(filePath);
  const parsed = readJson(filePath, []);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.messages)) return parsed.messages;
  if (Array.isArray(parsed.emails)) return parsed.emails;
  return [];
}

function himalayaAccountForWorkspace(workspace, options = {}) {
  if (options.himalayaAccount) return String(options.himalayaAccount);
  if (process.env.SSA_HIMALAYA_ACCOUNT) return process.env.SSA_HIMALAYA_ACCOUNT;
  if (workspace === "hero-pumps" || workspace === "hero_pumps") return "heropumps";
  return workspace;
}

function parseHimalayaOutput(stdout) {
  if (!String(stdout || "").trim()) return [];
  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.envelopes)) return parsed.envelopes;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [];
}

function addressValue(value) {
  if (typeof value === "string") return { name: "", email: value };
  if (Array.isArray(value)) return addressValue(value[0]);
  if (value && typeof value === "object") {
    return {
      name: stringValue(value.name, value.displayName, value.display_name),
      email: stringValue(value.address, value.email, value.mailbox),
    };
  }
  return { name: "", email: "" };
}

function normalizeHimalayaEnvelope(envelope) {
  const from = addressValue(envelope.from || envelope.sender);
  const flags = Array.isArray(envelope.flags) ? envelope.flags.map((flag) => String(flag).toLowerCase()) : [];
  return normalizeMessage({
    id: stringValue(envelope.message_id, envelope.messageId, envelope.id, envelope.uid),
    messageId: stringValue(envelope.message_id, envelope.messageId),
    from_name: from.name,
    from_email: from.email,
    subject: stringValue(envelope.subject),
    receivedAt: stringValue(envelope.date, envelope.receivedAt, envelope.received_at),
    importance: flags.includes("flagged") || flags.includes("important") ? "high" : "",
  });
}

async function defaultCommandRunner(command, args) {
  return execFile(command, args, {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });
}

async function readHimalayaMessages(options) {
  const workspace = safeWorkspace(options.workspace);
  const account = himalayaAccountForWorkspace(workspace, options);
  const folder = stringValue(options.folder) || DEFAULT_INBOX_FOLDER;
  const pageSize = Number.isFinite(Number(options.pageSize)) ? String(Math.max(1, Number(options.pageSize))) : String(DEFAULT_PAGE_SIZE);
  const commandRunner = options.commandRunner || defaultCommandRunner;
  const args = [
    "envelope",
    "list",
    "--account",
    account,
    "--folder",
    folder,
    "--page-size",
    pageSize,
    "--output",
    "json",
  ];
  const result = await commandRunner("himalaya", args);
  return {
    source: `himalaya:${account}/${folder}`,
    messages: parseHimalayaOutput(result.stdout).map(normalizeHimalayaEnvelope).filter((message) => message.id),
    commandRunner,
    account,
    folder,
  };
}

async function readHimalayaMessageBody(commandRunner, account, folder, messageId) {
  try {
    const readArgs = ["message", "read", "--account", account, "--folder", folder, messageId];
    const readResult = await commandRunner("himalaya", readArgs);
    return parseHimalayaMessageBody(readResult.stdout);
  } catch {
    return "";
  }
}

function parseHimalayaMessageBody(stdout) {
  if (!String(stdout || "").trim()) return "";
  try {
    const parsed = JSON.parse(stdout);
    if (typeof parsed === "string") return stripEmailHeaders(parsed);
    if (parsed && typeof parsed === "object") {
      const body = parsed.body || parsed.text || parsed.content || parsed.html || "";
      return stripEmailHeaders(String(body));
    }
  } catch {
    return stripEmailHeaders(String(stdout));
  }
  return "";
}

function stripEmailHeaders(text) {
  if (!text) return "";
  // Find the first blank line (end of headers) and return everything after it
  const headerEnd = text.search(/\n\s*\n/);
  if (headerEnd !== -1) {
    return text.slice(headerEnd).trim();
  }
  // If no blank line found, check if it starts with common header patterns
  if (/^(From|To|Subject|Date|Cc|Bcc|Reply-To|Message-ID|Content-Type|Return-Path|MIME-Version):/i.test(text)) {
    // Look for first line that doesn't look like a header
    const lines = text.split("\n");
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "") {
        bodyStart = i + 1;
        break;
      }
      if (!/^(From|To|Subject|Date|Cc|Bcc|Reply-To|Message-ID|Content-Type|Return-Path|MIME-Version|Sent|Priority|X-|In-Reply-To|References|Thread-Topic|Thread-Index|List-|DKIM|Authentication|Received|ARC-|Content-Transfer|Content-Disposition):/i.test(lines[i]) && !/^\s/.test(lines[i])) {
        bodyStart = i;
        break;
      }
    }
    return lines.slice(bodyStart).join("\n").trim();
  }
  return text.trim();
}

function stringValue(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function normalizeEmail(value) {
  const match = String(value || "").match(/<([^>]+)>/);
  const email = (match ? match[1] : String(value || "")).trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function emailDomain(value) {
  const email = normalizeEmail(value);
  return email.includes("@") ? (email.split("@").pop() || "").replace(/^www\./i, "") : "";
}

function domainCompanyName(domain) {
  const root = domain.replace(/^www\./i, "").split(".").filter(Boolean)[0] || domain;
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || domain || "Unknown Customer";
}

function customerSlug(message) {
  const domain = emailDomain(message.fromEmail);
  if (domain) return domain.replace(/\.[a-z]{2,}$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return normalizeEmail(message.fromEmail).replace(/[^a-z0-9._-]+/gi, "-") || "unknown-customer";
}

function customerVisibleText(value, fallback = "") {
  return stringValue(value, fallback)
    .replace(/\bPO\s*#\s*[A-Z0-9][A-Z0-9-]*\b/gi, "the purchase order")
    .replace(/\bPO-[A-Z0-9][A-Z0-9-]*\b/gi, "the purchase order")
    .replace(/\bPI-[A-Z0-9][A-Z0-9-]*\b/gi, "the PI")
    .replace(/\bQT-[A-Z0-9][A-Z0-9-]*\b/gi, "the quote")
    .replace(/\bRFQ-[A-Z0-9][A-Z0-9-]*\b/gi, "the RFQ")
    .replace(/\bworkflows?\b/gi, "process")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function orderNumberFromMessage(message) {
  const text = `${message.subject || ""}\n${message.body || ""}`;
  const match = text.match(/\b(?:PI|QT|RFQ|PO)[-\s#]*[A-Z0-9][A-Z0-9-]*\b/i);
  return match ? match[0].replace(/\s*#\s*/g, "-").replace(/\s+/g, "-").toUpperCase() : "";
}

function amountFromMessage(message) {
  const text = `${message.subject || ""}\n${message.body || ""}`;
  const match = text.match(/\b(USD|EUR|GBP|CNY|RMB)\s*[$€£¥]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i)
    || text.match(/[$€£¥]\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!match) return "";
  if (match.length >= 3) return `${match[1].toUpperCase()} ${match[2].replace(/,/g, "")}`;
  return `USD ${match[1].replace(/,/g, "")}`;
}

function productTypeFromMessage(message) {
  const text = `${message.subject || ""}\n${message.body || ""}`;
  const candidates = [
    /\b([A-Z0-9+.-]+(?:\s+to\s+[A-Z0-9+.-]+)?\s+cable(?:\s+program|\s+order|\s+replacement)?)\b/i,
    /\b(HDMI\s*[0-9.]*\s*cables?)\b/i,
    /\b(DisplayPort\s*cables?)\b/i,
    /\b(USB-C\s*cables?)\b/i,
  ];
  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (match?.[1]) return customerVisibleText(match[1]);
  }
  return "Order";
}

function paymentStatusFromMessage(message) {
  const lower = `${message.subject || ""}\n${message.body || ""}`.toLowerCase();
  if (/refund(ed)?|credit note/.test(lower)) return "refunded";
  if (/overdue|payment delay|unpaid|past due/.test(lower)) return "overdue";
  if (/partial payment|deposit received|balance pending/.test(lower)) return "partial";
  if (/payment received|paid|wire received|tt received|deposit paid/.test(lower)) return "paid";
  if (/payment pending|awaiting payment|invoice issued/.test(lower)) return "pending";
  return "pending";
}

function fulfillmentStatusFromMessage(message) {
  const lower = `${message.subject || ""}\n${message.body || ""}`.toLowerCase();
  if (/exception|customs hold|quality issue|claim|dispute|delay/.test(lower)) return "exception";
  if (/delivered|received by customer|signed for/.test(lower)) return "delivered";
  if (/shipped|shipment booked|tracking|air waybill|awb|bl issued/.test(lower)) return "shipped";
  if (/production|preparing|packing|ready to ship/.test(lower)) return "preparing";
  return "not_started";
}

function lifecycleStageFromMessage(message, paymentStatus, fulfillmentStatus) {
  const lower = `${message.subject || ""}\n${message.body || ""}`.toLowerCase();
  if (/exception|customs hold|quality issue|claim|dispute|overdue|delay/.test(lower) || fulfillmentStatus === "exception" || paymentStatus === "overdue") return "exception";
  if (/refund|credit note/.test(lower) || paymentStatus === "refunded") return "refund";
  if (/after-sales|after sales|warranty|replacement|complaint/.test(lower)) return "after_sales";
  if (fulfillmentStatus === "shipped" || fulfillmentStatus === "delivered") return "shipment";
  if (fulfillmentStatus === "preparing") return "production";
  return "payment";
}

function orderTypeFromNumber(orderNumber) {
  if (/^PI\b|^PI-/i.test(orderNumber)) return "PI";
  if (/^QT\b|^QT-/i.test(orderNumber)) return "QT";
  return "Order";
}

function orderSummary({ productType, amount, lifecycleStage, paymentStatus, fulfillmentStatus }) {
  const amountText = amount ? ` for ${amount}` : "";
  if (lifecycleStage === "exception" || fulfillmentStatus === "exception" || paymentStatus === "overdue") {
    return `${productType} shipment exception requires review: payment ${paymentStatus}, shipment ${fulfillmentStatus}${amountText}.`;
  }
  if (lifecycleStage === "refund" || paymentStatus === "refunded") return `${productType} refund follow-up is active${amountText}.`;
  if (lifecycleStage === "after_sales") return `${productType} after-sales follow-up is active${amountText}.`;
  if (lifecycleStage === "shipment" || fulfillmentStatus === "shipped" || fulfillmentStatus === "delivered") {
    return `${productType} shipment ${fulfillmentStatus}${amountText}.`;
  }
  return `${productType} payment ${paymentStatus}${amountText}.`;
}

function orderActivityFromMessage(workspace, message, customer) {
  const text = `${message.subject || ""}\n${message.body || ""}`;
  if (!/\b(pi|po|order|payment|paid|shipment|shipped|delivered|refund|after-sales|after sales|exception|customs hold|quality issue)\b/i.test(text)) return null;
  const orderNumber = orderNumberFromMessage(message);
  const paymentStatus = paymentStatusFromMessage(message);
  const fulfillmentStatus = fulfillmentStatusFromMessage(message);
  const lifecycleStage = lifecycleStageFromMessage(message, paymentStatus, fulfillmentStatus);
  if (!orderNumber && lifecycleStage === "payment" && paymentStatus === "pending" && fulfillmentStatus === "not_started" && !/order confirmation|new order|purchase order/i.test(text)) return null;
  const productType = productTypeFromMessage(message);
  const amount = amountFromMessage(message);
  return {
    id: `order:${customer.id}:${orderNumber || productType}:${lifecycleStage}:${paymentStatus}:${fulfillmentStatus}:${message.receivedAt || ""}`.toLowerCase(),
    workspaceId: workspace,
    customerId: customer.id,
    customerName: customer.companyName,
    kind: "order_status",
    occurredAt: message.receivedAt || "",
    createdAt: "",
    contactName: message.fromName || "",
    contactEmail: normalizeEmail(message.fromEmail),
    subject: "Order lifecycle update",
    summary: orderSummary({ productType, amount, lifecycleStage, paymentStatus, fulfillmentStatus }),
    status: lifecycleStage,
    source: customer.source,
    metadata: {
      orderNumber: orderNumber || null,
      orderType: orderTypeFromNumber(orderNumber),
      productType,
      amount,
      lifecycleStage,
      paymentStatus,
      fulfillmentStatus,
      status: lifecycleStage,
    },
  };
}

function syncMessagesToCustomerCrm(dataRoot, workspace, messages, now, source) {
  if (messages.length === 0) return { customersUpserted: 0, activitiesWritten: 0, orderActivitiesWritten: 0 };
  const activitySource = String(source || "").startsWith("himalaya:") ? "mailbox-readonly" : "mailbox-sync";
  const accountsFile = customersPath(dataRoot, workspace);
  const activitiesFile = customerActivityPath(dataRoot, workspace);
  const accounts = readJson(accountsFile, []);
  const activities = readJson(activitiesFile, []);
  const byId = new Map(Array.isArray(accounts) ? accounts.map((account) => [account.id, account]) : []);
  const seenActivities = new Set(Array.isArray(activities) ? activities.map((activity) => activity.id) : []);
  const nextActivities = [];
  const nextOrderActivities = [];
  let customersUpserted = 0;
  let orderActivitiesWritten = 0;

  for (const message of messages) {
    const fromEmail = normalizeEmail(message.fromEmail);
    if (!fromEmail) continue;
    const domain = emailDomain(fromEmail);
    const id = domain || customerSlug(message);
    const companyName = domain ? domainCompanyName(domain) : message.fromName || fromEmail;
    const existing = byId.get(id);
    const sourceRecord = {
      type: "email",
      companyName,
      contact: message.fromName || "",
      role: "",
      email: fromEmail,
      website: domain ? `https://${domain}` : "",
      country: "",
      industry: "",
      category: "Inbound Email",
      reason: `Inbound email: ${message.subject || "(no subject)"}`,
      confidence: message.important ? "82%" : "68%",
      importedAt: now,
    };
    const existingSources = existing?.sources || [];
    const sourceKey = `${sourceRecord.companyName}|${sourceRecord.email}|${sourceRecord.website}`.toLowerCase();
    const sources = [
      sourceRecord,
      ...existingSources.filter((item) => `${item.companyName}|${item.email}|${item.website}`.toLowerCase() !== sourceKey),
    ].slice(0, 20);
    byId.set(id, {
      id,
      companyName: existing?.companyName || companyName,
      country: existing?.country || "",
      website: existing?.website || sourceRecord.website,
      domain,
      industry: existing?.industry || "",
      status: existing?.status || "Prospect",
      sources,
      intelligence: {
        ...(existing?.intelligence || {}),
        status: existing?.intelligence?.status === "ready" ? "ready" : "queued",
        queuedAt: existing?.intelligence?.queuedAt || now,
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    customersUpserted += existing ? 0 : 1;

    const activityId = `email:${message.id || fromEmail}:${message.subject || ""}:${message.receivedAt || now}`.toLowerCase();
    const customerRef = { id, companyName, source: activitySource };
    if (!seenActivities.has(activityId)) {
      seenActivities.add(activityId);
      nextActivities.push({
        id: activityId,
        workspaceId: workspace,
        customerId: id,
        customerName: companyName,
        kind: "email_received",
        occurredAt: message.receivedAt || now,
        createdAt: now,
        contactName: message.fromName || "",
        contactEmail: fromEmail,
        subject: message.subject || "(no subject)",
        summary: message.body ? `${message.subject || "(no subject)"} - ${message.body.replace(/\s+/g, " ").slice(0, 220)}` : message.subject || "(no subject)",
        status: "received",
        source: activitySource,
        metadata: {
          important: message.important,
        },
      });
    }
    const orderActivity = orderActivityFromMessage(workspace, message, customerRef);
    if (orderActivity && !seenActivities.has(orderActivity.id)) {
      seenActivities.add(orderActivity.id);
      nextOrderActivities.push({
        ...orderActivity,
        createdAt: now,
        occurredAt: orderActivity.occurredAt || message.receivedAt || now,
      });
      orderActivitiesWritten += 1;
    }
  }

  writeJson(accountsFile, Array.from(byId.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))));
  writeJson(activitiesFile, [...nextOrderActivities, ...nextActivities, ...(Array.isArray(activities) ? activities : [])].sort((a, b) => String(b.occurredAt || "").localeCompare(String(a.occurredAt || ""))).slice(0, 2000));
  return { customersUpserted, activitiesWritten: nextActivities.length, orderActivitiesWritten };
}

function stableMessageId(raw) {
  return stringValue(
    raw.id,
    raw.messageId,
    raw.message_id,
    raw.uid,
    raw.emailId,
    `${stringValue(raw.from, raw.from_email, raw.fromEmail)}:${stringValue(raw.subject)}:${stringValue(raw.receivedAt, raw.received_at, raw.date)}`
  );
}

function normalizeMessage(raw) {
  const id = stableMessageId(raw);
  const fromEmail = stringValue(raw.from_email, raw.fromEmail, raw.email, raw.from);
  const fromName = stringValue(raw.from_name, raw.fromName, raw.sender, raw.name);
  const subject = stringValue(raw.subject, "(no subject)");
  const receivedAt = stringValue(raw.receivedAt, raw.received_at, raw.date, raw.timestamp);
  const body = stringValue(raw.body, raw.body_text, raw.text, raw.snippet);
  const importance = stringValue(raw.importance, raw.urgency, raw.priority).toLowerCase();
  return {
    id,
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    fromEmail,
    fromName,
    subject,
    receivedAt,
    body,
    importance,
    important: ["high", "urgent", "critical", "risk"].includes(importance),
  };
}

function createEmptyState(now) {
  return {
    version: 1,
    lastCheck: now,
    seen: {},
  };
}

function loadState(filePath, now) {
  const state = readJson(filePath, createEmptyState(now));
  if (!state || typeof state !== "object") return createEmptyState(now);
  return {
    version: 1,
    lastCheck: stringValue(state.lastCheck) || now,
    seen: state.seen && typeof state.seen === "object" && !Array.isArray(state.seen) ? state.seen : {},
  };
}

function pruneSeenState(state, maxSeen = MAX_SEEN_MESSAGES) {
  const limit = Number.isFinite(maxSeen) && maxSeen > 0 ? Math.floor(maxSeen) : 5000;
  const entries = Object.entries(state.seen || {});
  if (entries.length <= limit) return state;
  const seen = Object.fromEntries(
    entries
      .sort(([, a], [, b]) => String(b?.firstSeenAt || b?.receivedAt || "").localeCompare(String(a?.firstSeenAt || a?.receivedAt || "")))
      .slice(0, limit)
  );
  return { ...state, seen };
}

function pageLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.floor(number));
}

function recordRuntimeEvent(dataRoot, workspace, event) {
  const filePath = eventsPath(dataRoot, workspace);
  const events = readJson(filePath, []);
  const next = [event, ...(Array.isArray(events) ? events : [])].slice(0, MAX_EVENTS);
  writeJson(filePath, next);
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function stripEmailAngleBrackets(raw) {
  const m = String(raw).match(/^(.*?)\s*</);
  return m ? m[1].trim() : String(raw).trim() || "—";
}

function extractSnippet(value, maxLength = 120) {
  const text = stringValue(value)
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const limit = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 120;
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : text;
}

function extractFirstParagraph(body) {
  if (!body) return "";
  const text = stringValue(body).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const lines = text.split("\n").filter((line) => line.trim().length > 20);
  const firstLine = lines[0] || text;
  const match = firstLine.match(/^(.{10,200}?)(?:\.|。|\!|\?|$)/);
  return match ? match[0].trim() : firstLine.slice(0, 200);
}

function reportForMessages(workspace, messages) {
  if (messages.length === 0) return "";
  const importantCount = messages.filter((m) => m.important).length;
  const lines = [
    `📬 **${workspace}** 收件箱监控`,
    `新邮件 **${messages.length}** 封` + (importantCount > 0 ? ` | 重要 ${importantCount} 封` : ""),
    "",
    "| 时间 | 发件人 | 主题 | 摘要 |",
    "|------|--------|------|------|",
  ];

  for (const message of messages.slice(0, 10)) {
    const time = formatTimestamp(message.receivedAt);
    const sender = stripEmailAngleBrackets(message.from);
    const subject = message.subject || "（无主题）";
    const paragraph = extractFirstParagraph(message.body);
    const prefix = message.important ? "🔴 " : "";
    lines.push(`| ${time} | ${prefix}${sender} | ${subject} | ${paragraph || "-"} |`);
  }

  if (messages.length > 10) lines.push(`\n_... 还有 ${messages.length - 10} 封_`);
  return `${lines.join("\n")}\n`;
}

export async function runInboxMonitor(options = {}) {
  const dataRoot = dataRootFromOptions(options);
  const workspace = safeWorkspace(options.workspace);
  const sourceMode = stringValue(options.sourceMode, process.env.SSA_INBOX_SOURCE) || DEFAULT_SOURCE_MODE;
  const now = stringValue(options.now) || new Date().toISOString();
  const stateFile = statePath(dataRoot, workspace);
  const state = loadState(stateFile, now);
  let source = sourcePath(dataRoot, workspace);
  let messages = [];
  let himalayaContext = null;

  if (sourceMode === "himalaya") {
    const himalaya = await readHimalayaMessages({ ...options, workspace });
    himalayaContext = himalaya;
    source = himalaya.source;
    messages = himalaya.messages;
  } else if (source) {
    messages = readSourceMessages(source).map(normalizeMessage).filter((message) => message.id);
  }

  if (!source) {
    state.lastCheck = now;
    writeJson(stateFile, state);
    return {
      status: "no_source",
      workspace,
      dataRoot,
      sourceMode,
      source: null,
      newCount: 0,
      importantCount: 0,
      newMessages: [],
      output: "",
    };
  }

  const newMessages = messages
    .filter((message) => !state.seen[message.id])
    .slice(0, pageLimit(options.pageSize));

  if (
    sourceMode === "himalaya" &&
    himalayaContext &&
    newMessages.length > 0 &&
    (options.includeHimalayaBody === true || process.env.SSA_HIMALAYA_INCLUDE_BODY === "true")
  ) {
    const { commandRunner, account, folder } = himalayaContext;
    const bodyLimit = Math.min(newMessages.length, 3);
    for (let i = 0; i < bodyLimit; i++) {
      const message = newMessages[i];
      if (message.id) {
        message.body = await readHimalayaMessageBody(commandRunner, account, folder, message.id);
      }
    }
  }

  for (const message of newMessages) {
    state.seen[message.id] = {
      firstSeenAt: now,
      subject: message.subject,
      from: message.fromEmail || message.from,
      receivedAt: message.receivedAt,
      important: message.important,
    };
  }

  state.lastCheck = now;
  writeJson(stateFile, pruneSeenState(state, options.maxSeen));

  const importantCount = newMessages.filter((message) => message.important).length;
  let crm = { customersUpserted: 0, activitiesWritten: 0, orderActivitiesWritten: 0 };
  if (newMessages.length > 0) {
    crm = syncMessagesToCustomerCrm(dataRoot, workspace, newMessages, now, source);
    recordRuntimeEvent(dataRoot, workspace, {
      id: `inbox-monitor-${workspace}-${Date.now()}`,
      type: "inbox.monitor.new_mail",
      workspaceId: workspace,
      createdAt: now,
      payload: {
        source,
        newCount: newMessages.length,
        importantCount,
        messageIds: newMessages.map((message) => message.id),
        customersUpserted: crm.customersUpserted,
        activitiesWritten: crm.activitiesWritten,
        orderActivitiesWritten: crm.orderActivitiesWritten,
        sideEffects: sourceMode === "himalaya" ? "himalaya-read-only" : "local-only",
      },
    });
  }

  return {
    status: newMessages.length > 0 ? "new_mail" : "no_new_mail",
    workspace,
    dataRoot,
    sourceMode,
    source,
    newCount: newMessages.length,
    importantCount,
    activitiesWritten: crm.activitiesWritten,
    orderActivitiesWritten: crm.orderActivitiesWritten,
    customersUpserted: crm.customersUpserted,
    newMessages,
    output: reportForMessages(workspace, newMessages),
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    workspace: DEFAULT_WORKSPACE,
    quietEmpty: true,
    json: false,
    sourceMode: process.env.SSA_INBOX_SOURCE || DEFAULT_SOURCE_MODE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--workspace" || arg === "-w") {
      options.workspace = argv[index + 1] || DEFAULT_WORKSPACE;
      index += 1;
    } else if (arg === "--data-root") {
      options.dataRoot = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--now") {
      options.now = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--source") {
      options.sourceMode = argv[index + 1] || DEFAULT_SOURCE_MODE;
      index += 1;
    } else if (arg === "--himalaya-account") {
      options.himalayaAccount = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--folder") {
      options.folder = argv[index + 1] || DEFAULT_INBOX_FOLDER;
      index += 1;
    } else if (arg === "--page-size") {
      options.pageSize = argv[index + 1] || String(DEFAULT_PAGE_SIZE);
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--verbose-empty") {
      options.quietEmpty = false;
    } else if (arg === "--quiet-empty") {
      options.quietEmpty = true;
    }
  }

  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await runInboxMonitor(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  if (result.output) process.stdout.write(result.output);
  else if (!options.quietEmpty) process.stdout.write(`SSA inbox monitor: ${result.workspace} / ${result.status}\n`);
  return result;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`SSA inbox monitor failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

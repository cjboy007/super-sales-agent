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
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
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
  };
}

function stringValue(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
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

function reportForMessages(workspace, messages) {
  if (messages.length === 0) return "";
  const importantCount = messages.filter((m) => m.important).length;
  const lines = [
    `📬 **${workspace}** 收件箱监控`,
    `新邮件 **${messages.length}** 封` + (importantCount > 0 ? ` | ⚠️ 重要 **${importantCount}** 封` : ""),
    "",
    "| 时间 | 发件人 | 主题 |",
    "|------|--------|------|",
  ];

  for (const message of messages.slice(0, 10)) {
    const time = formatTimestamp(message.receivedAt);
    const sender = stripEmailAngleBrackets(message.from);
    const subject = message.subject || "（无主题）";
    const prefix = message.important ? "🔴 " : "";
    lines.push(`| ${time} | ${prefix}${sender} | ${subject} |`);
  }

  if (messages.length > 10) lines.push(`| | | ... 还有 ${messages.length - 10} 封 |`);
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

  if (sourceMode === "himalaya") {
    const himalaya = await readHimalayaMessages({ ...options, workspace });
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

  const newMessages = messages.filter((message) => !state.seen[message.id]);

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
  writeJson(stateFile, state);

  const importantCount = newMessages.filter((message) => message.important).length;
  if (newMessages.length > 0) {
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

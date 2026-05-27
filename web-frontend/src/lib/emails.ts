import fs from "fs";
import path from "path";
import { ssaDataPath } from "./ssa-data-paths";

const SENT_LOG = ssaDataPath("mail", "sent-log.json");
const MAIL_ARCHIVE = ssaDataPath("mail", "archive");
const DRAFTS_PATH = ssaDataPath("mail", "drafts");

export interface SentEmail {
  email: string;
  sent_at: string;
  subject: string;
}

export interface ReceivedEmail {
  date: string;
  from: string;
  to: string;
  subject: string;
  intent?: string;
  intent_confidence?: number;
}

export interface EmailDraft {
  id: string;
  subject: string;
  template: string;
}

export interface PendingEmail {
  id: string;
  to: string;
  subject: string;
  scheduledAt: string;
  reason: string;
}

export interface EmailStats {
  totalSent: number;
  totalReceived: number;
  totalReplied: number;
  replyRate: number;
  totalDrafts: number;
}

/**
 * 读取已发送邮件日志
 */
function getSentEmails(): SentEmail[] {
  try {
    const raw = fs.readFileSync(SENT_LOG, "utf-8");
    return JSON.parse(raw) as SentEmail[];
  } catch {
    return [];
  }
}

/**
 * 从 SSA 数据目录的 mail/archive 解析接收邮件
 */
function getReceivedEmails(): ReceivedEmail[] {
  const results: ReceivedEmail[] = [];
  try {
    if (!fs.existsSync(MAIL_ARCHIVE)) return results;
    const entries = fs.readdirSync(MAIL_ARCHIVE, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "sent") continue;
      const dir = path.join(MAIL_ARCHIVE, entry.name);
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        try {
          const content = fs.readFileSync(path.join(dir, file), "utf-8");
          const match = content.match(/^---\n([\s\S]*?)\n---/);
          if (!match) continue;
          const frontmatter = match[1];
          const parse = (key: string) => {
            const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
            return m ? m[1].trim() : "";
          };
          const arr = (key: string) => {
            const m = frontmatter.match(new RegExp(`^${key}:\\s*\\[(.*)\\]$`, "m"));
            return m ? m[1].split(",").map((s) => s.trim()) : [];
          };
          const date = parse("date");
          const from = parse("from");
          if (!date || !from) continue;
          const confidence = parseFloat(parse("intent_confidence"));
          results.push({
            date,
            from,
            to: parse("to"),
            subject: parse("subject"),
            intent: parse("intent") || undefined,
            intent_confidence: isNaN(confidence) ? undefined : confidence,
          });
        } catch {
          // skip malformed files
        }
      }
    }
  } catch {
    // directory not accessible
  }
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 计算邮件统计
 */
export function getEmailStats(): EmailStats {
  const sent = getSentEmails();
  const received = getReceivedEmails();

  // 统计回复数：接收邮件中 RE:/回复/跟进主题的视为回复
  const replyKeywords = [/^re[\s:_-]/i, /^回复/i, /^fw[\s:_-]/i, /^跟进/i];
  const replied = received.filter((r) =>
    replyKeywords.some((re) => re.test(r.subject || ""))
  ).length;

  const replyRate = sent.length > 0 ? Math.round((replied / sent.length) * 100) : 0;

  return {
    totalSent: sent.length,
    totalReceived: received.length,
    totalReplied: replied,
    replyRate,
    totalDrafts: getEmailDrafts().length,
  };
}

/**
 * 分页获取已发送邮件（按时间倒序）
 */
export function getSentEmailsPaginated(page: number, limit: number): {
  items: SentEmail[];
  total: number;
  page: number;
  totalPages: number;
} {
  const sent = getSentEmails().sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const total = sent.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const items = sent.slice(start, start + limit);
  return { items, total, page, totalPages };
}

/**
 * 获取草稿（从 SSA 数据目录的 mail/drafts 读取）
 */
export function getEmailDrafts(): EmailDraft[] {
  try {
    if (!fs.existsSync(DRAFTS_PATH)) return [];
    const files = fs.readdirSync(DRAFTS_PATH);
    const templates = files.filter((f) => f.endsWith(".json") || f.endsWith(".md"));
    return templates.map((file, i) => ({
      id: `draft-${i + 1}`,
      subject: file.replace(/\.(json|md)$/, "").replace(/[-_]/g, " "),
      template: file,
    }));
  } catch {
    return [];
  }
}

/**
 * 获取待发送邮件（auto_draft 标记 + 已发送对比）
 */
export function getPendingEmails(): PendingEmail[] {
  const sent = getSentEmails();
  const sentSubjects = new Set(sent.map((s) => s.subject.toLowerCase()));

  const received = getReceivedEmails();
  const autoDrafts = received.filter((r) => r.intent);

  const pending: PendingEmail[] = [];
  for (const draft of autoDrafts) {
    // 已发送的跳过
    if (sentSubjects.has(draft.subject.toLowerCase())) continue;
    pending.push({
      id: `pending-${draft.from.split("@")[0]}`,
      to: draft.to,
      subject: draft.subject,
      scheduledAt: draft.date,
      reason: draft.intent
        ? `AI 识别意图: ${draft.intent} (置信度 ${Math.round((draft.intent_confidence || 0) * 100)}%)`
        : "待处理",
    });
  }

  return pending.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

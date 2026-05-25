import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { paths } from "./ssa-paths";

const execFileAsync = promisify(execFile);
const SMTP_SCRIPT = paths.smtpScript;
const SENT_LOG = paths.heroSentLog;

export interface LocalEmailSendInput {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
}

export interface LocalEmailSendResult {
  success: true;
  messageId?: string;
  detail: string;
  sentAt: string;
}

function appendToSentLog(email: string, subject: string) {
  let entries: Array<{ email: string; sent_at: string; subject: string }> = [];
  try {
    const raw = fs.readFileSync(SENT_LOG, "utf-8");
    entries = JSON.parse(raw);
  } catch {
    // File does not exist yet or contains invalid JSON.
  }
  entries.push({
    email,
    sent_at: new Date().toISOString(),
    subject,
  });
  fs.writeFileSync(SENT_LOG, JSON.stringify(entries, null, 2), "utf-8");
}

export async function sendViaLocalSmtp(
  input: LocalEmailSendInput
): Promise<LocalEmailSendResult> {
  const args = ["send", "--to", input.to, "--subject", input.subject];
  let tempFile: string | null = null;

  if (input.html) {
    tempFile = path.join(os.tmpdir(), `ssa-email-${Date.now()}.html`);
    fs.writeFileSync(tempFile, input.body, "utf-8");
    args.push("--html-file", tempFile);
  } else {
    args.push("--body", input.body);
  }

  try {
    const { stdout, stderr } = await execFileAsync("node", [SMTP_SCRIPT, ...args], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    const messageIdMatch = stdout.match(/Message-ID:\s*<?([^>\n]+)>?/i)
      || stderr.match(/Message-ID:\s*<?([^>\n]+)>?/i);
    const messageId = messageIdMatch ? messageIdMatch[1].trim() : undefined;

    appendToSentLog(input.to, input.subject);

    return {
      success: true,
      messageId,
      detail: "Email sent successfully",
      sentAt: new Date().toISOString(),
    };
  } finally {
    if (tempFile) {
      setTimeout(() => {
        try {
          fs.unlinkSync(tempFile as string);
        } catch {
          // Ignore cleanup errors.
        }
      }, 10_000);
    }
  }
}

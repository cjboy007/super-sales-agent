import fs from "fs";
import os from "os";
import path from "path";
import { ensureSsaDataPath, repoPath } from "../ssa-data-paths";
import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision, WorkspaceId } from "./types";

const SMTP_SCRIPT = repoPath("skills", "imap-smtp-email", "scripts", "smtp.js");

export interface EmailSendInput {
  workspaceId: WorkspaceId;
  to: string;
  subject: string;
  body: string;
  html?: boolean;
}

export interface EmailSendResult {
  success: true;
  blocked?: true;
  sideEffect?: SideEffectDecision;
  messageId?: string;
  detail: string;
}

function sentLogPath() {
  return ensureSsaDataPath("mail", "sent-log.json");
}

function sendRequestLogPath() {
  return ensureSsaDataPath("mail", "send-requests.json");
}

function isSmtpEnabled() {
  return process.env.SSA_ENABLE_REAL_EMAIL_SEND === "true";
}

function appendToSentLog(email: string, subject: string) {
  let entries: Array<{ email: string; sent_at: string; subject: string }> = [];
  try {
    const raw = fs.readFileSync(sentLogPath(), "utf-8");
    entries = JSON.parse(raw);
  } catch {
    // File does not exist yet.
  }
  entries.push({
    email,
    sent_at: new Date().toISOString(),
    subject,
  });
  fs.writeFileSync(sentLogPath(), JSON.stringify(entries, null, 2), "utf-8");
}

function appendToSendRequestLog(email: string, subject: string) {
  let entries: Array<{ email: string; requested_at: string; subject: string; status: string }> = [];
  try {
    const raw = fs.readFileSync(sendRequestLogPath(), "utf-8");
    entries = JSON.parse(raw);
  } catch {
    // File does not exist yet.
  }
  entries.push({
    email,
    requested_at: new Date().toISOString(),
    subject,
    status: "blocked_local_preview",
  });
  fs.writeFileSync(sendRequestLogPath(), JSON.stringify(entries, null, 2), "utf-8");
}

async function runSmtpScript(args: string[]) {
  const [{ execFile }, { promisify }] = await Promise.all([
    import("child_process"),
    import("util"),
  ]);
  return promisify(execFile)("node", args, {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
}

export async function sendEmailThroughRuntime(runtime: SalesRuntime, input: EmailSendInput): Promise<EmailSendResult> {
  const sideEffect = runtime.requestSideEffect({
    kind: "email.send",
    workspaceId: input.workspaceId,
    summary: `Send email to ${input.to}: ${input.subject}`,
    payload: {
      to: input.to,
      subject: input.subject,
      html: Boolean(input.html),
    },
    idempotencyKey: `${input.workspaceId}:email:${input.to}:${input.subject}`,
  });

  if (!isSmtpEnabled()) {
    appendToSendRequestLog(input.to, input.subject);
    return {
      success: true,
      blocked: true,
      sideEffect,
      detail: "Email captured locally. Real SMTP send is disabled for this runtime.",
    };
  }

  if (sideEffect.status !== "allowed") {
    appendToSendRequestLog(input.to, input.subject);
    return {
      success: true,
      blocked: true,
      sideEffect,
      detail: sideEffect.reason,
    };
  }

  const args = [SMTP_SCRIPT, "send", "--to", input.to, "--subject", input.subject];
  if (input.html) {
    const tmpFile = path.join(os.tmpdir(), `ssa-email-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, input.body, "utf-8");
    args.push("--html-file", tmpFile);
    setTimeout(() => {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Temp cleanup is best-effort.
      }
    }, 10_000);
  } else {
    args.push("--body", input.body);
  }

  const execResult = await runSmtpScript(args);
  const stdout = typeof execResult === "string" ? execResult : execResult.stdout || "";
  const stderr = typeof execResult === "string" ? "" : execResult.stderr || "";
  const messageIdMatch = stdout.match(/Message-ID:\s*<?([^>\n]+)>?/i)
    || stderr.match(/Message-ID:\s*<?([^>\n]+)>?/i);
  const messageId = messageIdMatch ? messageIdMatch[1].trim() : undefined;

  try {
    appendToSentLog(input.to, input.subject);
  } catch {
    // Sent-log append is non-fatal.
  }

  return {
    success: true,
    messageId,
    detail: "Email sent successfully",
  };
}

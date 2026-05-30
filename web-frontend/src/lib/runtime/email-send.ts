import fs from "fs";
import os from "os";
import path from "path";
import { ensureSsaCompanyDataPath, repoPath } from "../ssa-data-paths";
import { verifyEmailAddress, type EmailVerificationResult } from "./email-verification";
import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision, WorkspaceId } from "./types";

const SMTP_SCRIPT = repoPath("skills", "imap-smtp-email", "scripts", "smtp.js");

export interface EmailSendInput {
  workspaceId: WorkspaceId;
  to: string;
  subject: string;
  body: string;
  html?: boolean;
  humanApproval?: {
    approved?: boolean;
    approvedBy?: string;
    approvedAt?: string;
    note?: string;
  };
}

export interface EmailSendResult {
  success: true;
  blocked?: true;
  sideEffect?: SideEffectDecision;
  verification?: EmailVerificationResult;
  messageId?: string;
  detail: string;
}

function sentLogPath(workspaceId: WorkspaceId) {
  return ensureSsaCompanyDataPath(workspaceId, "mail", "sent-log.json");
}

function sendRequestLogPath(workspaceId: WorkspaceId) {
  return ensureSsaCompanyDataPath(workspaceId, "mail", "send-requests.json");
}

function isSmtpEnabled() {
  return process.env.SSA_ENABLE_REAL_EMAIL_SEND === "true";
}

function appendToSentLog(workspaceId: WorkspaceId, email: string, subject: string) {
  let entries: Array<{ email: string; sent_at: string; subject: string }> = [];
  try {
    const raw = fs.readFileSync(sentLogPath(workspaceId), "utf-8");
    entries = JSON.parse(raw);
  } catch {
    // File does not exist yet.
  }
  entries.push({
    email,
    sent_at: new Date().toISOString(),
    subject,
  });
  fs.writeFileSync(sentLogPath(workspaceId), JSON.stringify(entries, null, 2), "utf-8");
}

function appendToSendRequestLog(workspaceId: WorkspaceId, email: string, subject: string, status = "blocked_local_preview") {
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

function canSendWithoutVerification() {
  return process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND === "true";
}

function verificationBlockDetail(status: EmailVerificationResult["status"]) {
  return `Email blocked: recipient verification is ${status}. Configure Hunter verification or approve an explicit unverified-send override.`;
}

function hasHumanApproval(input: EmailSendInput) {
  return input.humanApproval?.approved === true;
}

function localApprovalId(input: EmailSendInput) {
  const seed = [
    input.workspaceId,
    input.to,
    input.subject,
    input.humanApproval?.approvedBy || "local-operator",
    input.humanApproval?.approvedAt || "",
  ].join(":");
  return `ssa-local-${Buffer.from(seed).toString("base64url").slice(0, 32)}`;
}

async function runApprovedSmtpScript(
  args: string[],
  input: EmailSendInput,
  approvalId: string,
  verification: EmailVerificationResult
) {
  const [{ execFile }, { promisify }] = await Promise.all([
    import("child_process"),
    import("util"),
  ]);
  return promisify(execFile)("node", args, {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      SSA_RUNTIME_APPROVAL_ID: approvalId,
      SSA_RUNTIME_APPROVED_TO: input.to,
      SSA_RUNTIME_APPROVED_SUBJECT: input.subject,
      SSA_RUNTIME_APPROVED_BY: input.humanApproval?.approvedBy || "local-operator",
      SSA_RUNTIME_VERIFICATION_STATUS: verification.status,
      SSA_RUNTIME_VERIFICATION_SCORE: String(verification.score ?? 0),
      SSA_RUNTIME_VERIFICATION_PROVIDER: verification.provider,
    },
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
      humanApproval: input.humanApproval || null,
    },
    idempotencyKey: `${input.workspaceId}:email:${input.to}:${input.subject}`,
  });

  if (!isSmtpEnabled()) {
    appendToSendRequestLog(input.workspaceId, input.to, input.subject);
    return {
      success: true,
      blocked: true,
      sideEffect,
      detail: "Email captured locally. Real SMTP send is disabled for this runtime.",
    };
  }

  if (sideEffect.status !== "allowed") {
    appendToSendRequestLog(input.workspaceId, input.to, input.subject);
    return {
      success: true,
      blocked: true,
      sideEffect,
      detail: sideEffect.reason,
    };
  }

  if (!hasHumanApproval(input)) {
    appendToSendRequestLog(input.workspaceId, input.to, input.subject, "blocked_missing_approval");
    return {
      success: true,
      blocked: true,
      sideEffect,
      detail: "Email blocked: human approval is required before real customer send.",
    };
  }

  const verification = await verifyEmailAddress({
    workspaceId: input.workspaceId,
    email: input.to,
  });

  if (verification.status !== "valid" && !canSendWithoutVerification()) {
    appendToSendRequestLog(input.workspaceId, input.to, input.subject, `blocked_verification_${verification.status}`);
    return {
      success: true,
      blocked: true,
      sideEffect,
      verification,
      detail: verificationBlockDetail(verification.status),
    };
  }

  const approvalId = localApprovalId(input);
  const args = [
    SMTP_SCRIPT,
    "send",
    "--to",
    input.to,
    "--subject",
    input.subject,
    "--confirm-send",
    "--approval-id",
    approvalId,
  ];
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

  const execResult = await runApprovedSmtpScript(args, input, approvalId, verification);
  const stdout = typeof execResult === "string" ? execResult : execResult.stdout || "";
  const stderr = typeof execResult === "string" ? "" : execResult.stderr || "";
  const messageIdMatch = stdout.match(/Message-ID:\s*<?([^>\n]+)>?/i)
    || stderr.match(/Message-ID:\s*<?([^>\n]+)>?/i);
  const messageId = messageIdMatch ? messageIdMatch[1].trim() : undefined;

  try {
  appendToSentLog(input.workspaceId, input.to, input.subject);
  } catch {
    // Sent-log append is non-fatal.
  }

  return {
    success: true,
    messageId,
    detail: "Email sent successfully",
  };
}

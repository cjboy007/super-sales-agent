import fs from "fs";
import os from "os";
import path from "path";
import { ensureSsaCompanyDataPath, repoPath } from "../ssa-data-paths";
import { verifyEmailAddress, type EmailVerificationResult } from "./email-verification";
import { ingestCustomerInteraction } from "./customer-memory-ingestor";
import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision, WorkspaceId } from "./types";

const SMTP_SCRIPT = repoPath("skills", "imap-smtp-email", "scripts", "smtp.js");

export interface EmailSendInput {
  workspaceId: WorkspaceId;
  to: string;
  subject: string;
  body: string;
  html?: boolean;
  decisionId?: string;
  customerName?: string;
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

function restoreFileSnapshot(filePath: string, snapshot: string | null) {
  if (snapshot === null) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, snapshot, "utf-8");
}

function withSentLogRollback<T>(workspaceId: WorkspaceId, action: () => T): T {
  const filePath = sentLogPath(workspaceId);
  const snapshot = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
  try {
    return action();
  } catch (error) {
    restoreFileSnapshot(filePath, snapshot);
    throw error;
  }
}

function canSendWithoutVerification() {
  return process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND === "true";
}

function verificationBlockDetail(status: EmailVerificationResult["status"]) {
  return `Email blocked: recipient verification is ${status}. Configure Hunter verification or approve an explicit unverified-send override.`;
}

function approvalBlockDetail() {
  return "Email blocked: approved side-effect decision is required before real customer send.";
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function approvedEmailDecision(runtime: SalesRuntime, input: EmailSendInput): SideEffectDecision | null {
  const decisionId = cleanText(input.decisionId);
  if (!decisionId) return null;
  const decision = runtime.getSideEffect(decisionId);
  if (!decision || decision.kind !== "email.send") return null;
  if (decision.workspaceId !== input.workspaceId) return null;
  const isApprovedForExecution = decision.status === "approved" ||
    (decision.status === "execution_failed" && Boolean(decision.approvedBy) && decision.execution?.canRetry !== false);
  if (!isApprovedForExecution) return null;
  if (cleanText(decision.payload.to) !== input.to) return null;
  if (cleanText(decision.payload.subject) !== input.subject) return null;
  return decision;
}

function rememberOutboundEmail(runtime: SalesRuntime, input: EmailSendInput, status: string, decision: SideEffectDecision, messageId?: string) {
  return ingestCustomerInteraction(runtime, {
    workspaceId: input.workspaceId,
    direction: "outbound_email",
    email: input.to,
    customerName: input.customerName,
    subject: input.subject,
    body: input.body,
    occurredAt: new Date().toISOString(),
    source: {
      type: "email",
      id: decision.id,
    },
    metadata: {
      status,
      messageId: messageId || null,
      sideEffectDecisionId: decision.id,
    },
    idempotencyKey: `${input.workspaceId}:outbound-email:${decision.id}:${status}`,
  });
}

async function runApprovedSmtpScript(
  args: string[],
  input: EmailSendInput,
  approval: SideEffectDecision,
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
      SSA_RUNTIME_APPROVAL_ID: approval.id,
      SSA_RUNTIME_APPROVED_TO: input.to,
      SSA_RUNTIME_APPROVED_SUBJECT: input.subject,
      SSA_RUNTIME_APPROVED_BY: approval.approvedBy || "local-operator",
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
    },
    idempotencyKey: `${input.workspaceId}:email:${input.to}:${input.subject}`,
  });

  if (!isSmtpEnabled()) {
    appendToSendRequestLog(input.workspaceId, input.to, input.subject);
    rememberOutboundEmail(runtime, input, "blocked_local_preview", sideEffect);
    return {
      success: true,
      blocked: true,
      sideEffect,
      detail: "Email captured locally. Real SMTP send is disabled for this runtime.",
    };
  }

  const approval = approvedEmailDecision(runtime, input);
  if (!approval) {
    appendToSendRequestLog(input.workspaceId, input.to, input.subject, "blocked_missing_approval_record");
    rememberOutboundEmail(runtime, input, "blocked_missing_approval_record", sideEffect);
    return {
      success: true,
      blocked: true,
      sideEffect,
      detail: approvalBlockDetail(),
    };
  }

  if (!isSmtpEnabled()) {
    appendToSendRequestLog(input.workspaceId, input.to, input.subject);
    rememberOutboundEmail(runtime, input, "blocked_local_preview", sideEffect);
    return {
      success: true,
      blocked: true,
      sideEffect,
      detail: "Email captured locally. Real SMTP send is disabled for this runtime.",
    };
  }

  const verification = await verifyEmailAddress({
    workspaceId: input.workspaceId,
    email: input.to,
  });

  if (verification.status !== "valid" && !canSendWithoutVerification()) {
    appendToSendRequestLog(input.workspaceId, input.to, input.subject, `blocked_verification_${verification.status}`);
    rememberOutboundEmail(runtime, input, `blocked_verification_${verification.status}`, approval);
    runtime.recordSideEffectFailed(approval.id, {
      error: verificationBlockDetail(verification.status),
      canRetry: true,
    });
    return {
      success: true,
      blocked: true,
      sideEffect,
      verification,
      detail: verificationBlockDetail(verification.status),
    };
  }

  const args = [
    SMTP_SCRIPT,
    "send",
    "--to",
    input.to,
    "--subject",
    input.subject,
    "--confirm-send",
    "--approval-id",
    approval.id,
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

  let execResult: Awaited<ReturnType<typeof runApprovedSmtpScript>>;
  try {
    execResult = await runApprovedSmtpScript(args, input, approval, verification);
  } catch (error) {
    runtime.recordSideEffectFailed(approval.id, {
      error: error instanceof Error ? error.message : String(error),
      canRetry: true,
    });
    throw error;
  }
  const stdout = typeof execResult === "string" ? execResult : execResult.stdout || "";
  const stderr = typeof execResult === "string" ? "" : execResult.stderr || "";
  const messageIdMatch = stdout.match(/Message-ID:\s*<?([^>\n]+)>?/i)
    || stderr.match(/Message-ID:\s*<?([^>\n]+)>?/i);
  const messageId = messageIdMatch ? messageIdMatch[1].trim() : undefined;

  let executedSideEffect: SideEffectDecision;
  try {
    executedSideEffect = withSentLogRollback(input.workspaceId, () => {
      appendToSentLog(input.workspaceId, input.to, input.subject);
      return runtime.recordSideEffectExecuted(approval.id, {
        result: {
          to: input.to,
          subject: input.subject,
          messageId: messageId || null,
        },
      });
    });
    rememberOutboundEmail(runtime, input, "sent", executedSideEffect, messageId);
  } catch (error) {
    runtime.recordSideEffectFailed(approval.id, {
      error: error instanceof Error ? error.message : String(error),
      canRetry: true,
    });
    throw error;
  }

  return {
    success: true,
    sideEffect: executedSideEffect,
    messageId,
    detail: "Email sent successfully",
  };
}

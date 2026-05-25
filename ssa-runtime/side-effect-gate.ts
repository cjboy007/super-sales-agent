/**
 * SSA Side-Effect Gate
 *
 * Deterministic code controls all external side effects.
 * LLM can suggest/draft but NEVER trigger sends, payments, or external API calls.
 *
 * In test/dev mode: logs intent, does not execute.
 * In production: requires explicit approval status before executing.
 */

import { createRequire } from "module";
import { getConfig } from "./config";

export type SideEffectType =
  | "email_send"
  | "sms_send"
  | "feishu_notify"
  | "external_api"
  | "payment"
  | "file_write_external"
  | "okki_sync";

export interface SideEffectRequest {
  type: SideEffectType;
  target: string;
  payload: Record<string, unknown>;
  approvalId?: string;
  requestedBy: string;
}

export interface SideEffectResult {
  executed: boolean;
  blocked: boolean;
  reason: string;
  timestamp: string;
  request: SideEffectRequest;
}

export interface ApprovalVerification {
  valid: boolean;
  reason: string;
  status?: string;
}

const BLOCKED_IN_TEST: SideEffectType[] = [
  "email_send",
  "sms_send",
  "feishu_notify",
  "external_api",
  "payment",
  "file_write_external",
  "okki_sync",
];

const log: SideEffectResult[] = [];

export function verifyApprovalForSideEffect(approvalId?: string): ApprovalVerification {
  if (!approvalId) {
    return {
      valid: false,
      reason: "No approval ID provided. Side effects require human approval.",
    };
  }

  const config = getConfig();
  try {
    const localRequire = createRequire(`${process.cwd()}/package.json`);
    const Database = localRequire("better-sqlite3");
    const db = new Database(config.db.approvalEngine, { readonly: true, fileMustExist: true });
    try {
      const row = db
        .prepare("SELECT status FROM approval_requests WHERE id = ?")
        .get(approvalId) as { status?: string } | undefined;

      if (!row) {
        return {
          valid: false,
          reason: `Approval ID not found: ${approvalId}`,
        };
      }

      if (row.status !== "approved") {
        return {
          valid: false,
          status: row.status,
          reason: `Approval status is "${row.status}", not "approved".`,
        };
      }

      return {
        valid: true,
        status: row.status,
        reason: `Approval ${approvalId} is approved.`,
      };
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      reason: `Approval verification unavailable: ${message}`,
    };
  }
}

export function requestSideEffect(request: SideEffectRequest): SideEffectResult {
  const config = getConfig();
  const now = new Date().toISOString();

  if (config.mode === "test" || config.mode === "development") {
    const result: SideEffectResult = {
      executed: false,
      blocked: true,
      reason: `Blocked in ${config.mode} mode: ${request.type} → ${request.target}`,
      timestamp: now,
      request,
    };
    log.push(result);
    return result;
  }

  if (!request.approvalId) {
    const result: SideEffectResult = {
      executed: false,
      blocked: true,
      reason: `No approval ID provided for ${request.type}. Side effects require human approval.`,
      timestamp: now,
      request,
    };
    log.push(result);
    return result;
  }

  const approval = verifyApprovalForSideEffect(request.approvalId);
  if (!approval.valid) {
    const result: SideEffectResult = {
      executed: false,
      blocked: true,
      reason: approval.reason,
      timestamp: now,
      request,
    };
    log.push(result);
    return result;
  }

  const result: SideEffectResult = {
    executed: false,
    blocked: false,
    reason: `Approved (${request.approvalId}), ready for executor dispatch.`,
    timestamp: now,
    request,
  };
  log.push(result);
  return result;
}

export function getSideEffectLog(): SideEffectResult[] {
  return [...log];
}

export function clearSideEffectLog(): void {
  log.length = 0;
}

export { BLOCKED_IN_TEST };

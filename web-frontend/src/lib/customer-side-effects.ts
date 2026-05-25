import {
  requestSideEffect,
  type SideEffectResult,
} from "../../../ssa-runtime/side-effect-gate";

export interface CustomerEmailSideEffectInput {
  to: string;
  subject: string;
  body?: string;
  content?: string;
  html?: boolean;
  approvalId?: string;
  approval_id?: string;
  requestedBy?: string;
  route: string;
}

export interface CustomerEmailSideEffectDecision {
  gate: SideEffectResult;
  approvalId?: string;
  body: string;
}

export function gateCustomerEmailSend(
  input: CustomerEmailSideEffectInput
): CustomerEmailSideEffectDecision {
  const body = input.body ?? input.content ?? "";
  const approvalId = input.approvalId ?? input.approval_id;

  const gate = requestSideEffect({
    type: "email_send",
    target: input.to,
    approvalId,
    requestedBy: input.requestedBy || input.route,
    payload: {
      subject: input.subject,
      html: Boolean(input.html),
      bodyLength: body.length,
    },
  });

  return { gate, approvalId, body };
}

export function emailSideEffectBlockedPayload(
  gate: SideEffectResult,
  extra?: Record<string, unknown>
) {
  return {
    success: false,
    blocked: true,
    dryRun: true,
    error: gate.reason,
    message: "Customer-facing email was not sent. Save a draft or approve the action first.",
    sideEffect: {
      type: gate.request.type,
      target: gate.request.target,
      requestedBy: gate.request.requestedBy,
      timestamp: gate.timestamp,
    },
    ...extra,
  };
}

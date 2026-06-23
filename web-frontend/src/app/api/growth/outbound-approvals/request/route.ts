import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import {
  createSalesRuntime,
  requestOutboundApproval,
  type OutboundApprovalActionType,
} from "@/lib/runtime";

export const dynamic = "force-dynamic";

const ACTION_TYPES: OutboundApprovalActionType[] = [
  "email_send",
  "crm_write",
  "quotation_generate",
  "pi_generate",
  "price_adjustment",
];

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const auth = requireResolvedWorkspaceAccess(request, body);
  if (!auth.ok) return auth.response;

  const intendedActionType = actionType(body.intendedActionType);
  if (!intendedActionType) {
    return NextResponse.json({
      success: false,
      error: "A supported intendedActionType is required.",
    }, { status: 400 });
  }

  try {
    const run = requestOutboundApproval(createSalesRuntime(), {
      workspaceId: auth.workspaceId,
      sourceDraftRunId: typeof body.sourceDraftRunId === "string" ? body.sourceDraftRunId : undefined,
      sourceDraftId: typeof body.sourceDraftId === "string" ? body.sourceDraftId : undefined,
      intendedActionType,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });

    return NextResponse.json(sanitizeResponse({
      success: true,
      data: run,
    }));
  } catch {
    return NextResponse.json({
      success: false,
      error: "Outbound approval request could not be created from the available Phase 9 draft.",
    }, { status: 400 });
  }
}

function actionType(value: unknown): OutboundApprovalActionType | null {
  if (typeof value !== "string") return null;
  return ACTION_TYPES.includes(value as OutboundApprovalActionType)
    ? value as OutboundApprovalActionType
    : null;
}

function sanitizeResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeResponse);
  if (!value || typeof value !== "object") return sanitizeScalar(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(^|_|\b)(path|payload|secret)(_|$|\b)/i.test(key)) continue;
    output[key] = sanitizeResponse(item);
  }
  return output;
}

function sanitizeScalar(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/\/Users\/|\.ssa|SSA_/i.test(value)) return "[redacted]";
  return value;
}

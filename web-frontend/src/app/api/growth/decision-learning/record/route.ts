import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import {
  isDecisionLearningDecision,
  recordDecisionLearning,
} from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const auth = requireResolvedWorkspaceAccess(request, body);
  if (!auth.ok) return auth.response;

  if (!isDecisionLearningDecision(body.decision)) {
    return NextResponse.json({
      success: false,
      error: "A supported human decision is required.",
    }, { status: 400 });
  }

  try {
    const record = recordDecisionLearning({
      workspaceId: auth.workspaceId,
      approvalRunId: typeof body.approvalRunId === "string" ? body.approvalRunId : "",
      candidateId: typeof body.candidateId === "string" ? body.candidateId : "",
      decision: body.decision,
      humanEdits: typeof body.humanEdits === "string" ? body.humanEdits : "",
      rejectionReason: typeof body.rejectionReason === "string" ? body.rejectionReason : "",
      policySuggestion: typeof body.policySuggestion === "string" ? body.policySuggestion : "",
      scope: typeof body.scope === "string" ? body.scope : "candidate",
      rollbackNote: typeof body.rollbackNote === "string" ? body.rollbackNote : "",
      operator: typeof body.operator === "string" ? body.operator : "local-operator",
      confidence: typeof body.confidence === "number" ? body.confidence : undefined,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });

    return NextResponse.json(sanitizeResponse({
      success: true,
      data: {
        ...record,
        guardrailSummary: "no policy auto-approval; high-risk still review; side-effect gate still required",
      },
    }));
  } catch {
    return NextResponse.json({
      success: false,
      error: "Decision memory could not be recorded from the available Phase 10 approval request.",
    }, { status: 400 });
  }
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

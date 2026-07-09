import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { listDecisionLearningRecords } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(50, Number(limitParam) || 20)) : 20;
  const records = listDecisionLearningRecords(auth.workspaceId, limit);

  return NextResponse.json(sanitizeResponse({
    success: true,
    data: {
      workspaceId: auth.workspaceId,
      noPolicyAutoApproval: true,
      highRiskStillReview: true,
      sideEffectGateStillRequired: true,
      readOnlyUntilReviewed: true,
      autopilotReady: false,
      guardrailSummary: "no policy auto-approval; high-risk still review; side-effect gate still required",
      records,
    },
  }));
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

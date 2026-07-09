import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { listOutboundApprovalRuns } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(50, Number(limitParam) || 20)) : 20;
  const runs = listOutboundApprovalRuns(auth.workspaceId, limit);

  return NextResponse.json(sanitizeResponse({
    success: true,
    data: {
      workspaceId: auth.workspaceId,
      approvalRequired: true,
      waitingForApproval: true,
      notExecuted: true,
      draftOnly: true,
      officialQuote: false,
      piGenerated: false,
      documentGenerated: false,
      sent: false,
      crmWritten: false,
      runs,
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

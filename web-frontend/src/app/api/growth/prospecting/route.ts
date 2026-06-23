import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { listProspectingRuns } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(50, Number(limitParam) || 20)) : 20;
  const runs = listProspectingRuns(auth.workspaceId, limit);

  return NextResponse.json({
    success: true,
    data: {
      workspaceId: auth.workspaceId,
      dryRun: true,
      draftOnly: true,
      noOutboundSent: true,
      runs,
    },
  });
}

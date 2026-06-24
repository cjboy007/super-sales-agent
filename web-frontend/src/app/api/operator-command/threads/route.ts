import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

function positiveLimit(value: string | null): number {
  const parsed = Number.parseInt(value || "10", 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(50, Math.max(1, parsed));
}

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;

  const runtime = createSalesRuntime();
  const threads = runtime.listJadenCommandThreads({
    workspaceId: auth.workspaceId,
    threadId: request.nextUrl.searchParams.get("threadId"),
    limit: positiveLimit(request.nextUrl.searchParams.get("limit")),
  });

  return NextResponse.json({
    success: true,
    data: {
      threads,
    },
  });
}

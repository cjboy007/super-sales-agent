import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { withPublicAction } from "../public-action";

export const dynamic = "force-dynamic";

// GET /api/inbox — list inbox emails from farreach (fallback to mock)
export async function GET(request: NextRequest) {
  const runtime = createSalesRuntime();
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const limit = Number(request.nextUrl.searchParams.get("limit") || "20");

  return NextResponse.json(withPublicAction(await runtime.getInbox(project, limit)));
}

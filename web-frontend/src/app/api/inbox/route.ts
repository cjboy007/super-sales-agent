import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

// GET /api/inbox — list inbox emails from farreach (fallback to mock)
export async function GET(request: NextRequest) {
  const runtime = createSalesRuntime();
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(request, project);
  if (!auth.ok) return auth.response;
  const limit = Number(request.nextUrl.searchParams.get("limit") || "20");

  return NextResponse.json(await runtime.getInbox(project, limit));
}

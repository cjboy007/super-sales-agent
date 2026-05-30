import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import type { ApiResponse } from "@/lib/api-types";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(request, project);
  if (!auth.ok) return auth.response;

  const agents = createSalesRuntime().memory.getAgents(project);
  const resp: ApiResponse<typeof agents> = { success: true, data: agents };
  return NextResponse.json(resp);
}

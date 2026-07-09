import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import { createSalesRuntime, type AgentStateReadModel } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "20", 10) || 20));
  const runtime = createSalesRuntime();
  const data = runtime.memory.getAgentState(project, limit);
  const response: ApiResponse<AgentStateReadModel> = { success: true, data };
  return NextResponse.json(response);
}

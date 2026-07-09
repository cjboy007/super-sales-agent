import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import type { ApiResponse } from "@/lib/api-types";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const { id } = await params;
  const agent = createSalesRuntime().memory.getAgentById(project, id);

  if (!agent) {
    return NextResponse.json(
      { success: false, error: `Agent "${id}" not found` },
      { status: 404 }
    );
  }

  const resp: ApiResponse<typeof agent> = { success: true, data: agent };
  return NextResponse.json(resp);
}

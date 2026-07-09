import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    const stats = createSalesRuntime().memory.getEmailStats(project);
    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

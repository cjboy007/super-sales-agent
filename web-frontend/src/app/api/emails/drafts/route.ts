import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;
    const drafts = createSalesRuntime().memory.getEmailDrafts(project);
    return NextResponse.json({ success: true, data: drafts });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

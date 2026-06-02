import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const project = request.nextUrl.searchParams.get("project") || body.project || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;

    const result = await createSalesRuntime().openFile({
      path: typeof body.path === "string" ? body.path : null,
      workspaceId: project,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open file",
      },
      { status: 500 }
    );
  }
}

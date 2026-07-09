import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const auth = requireResolvedWorkspaceAccess(request, body);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    const result = await createSalesRuntime().openFile({
      path: typeof body.path === "string" ? body.path : null,
      workspaceId: project,
    });

    if (result.kind === "opened") {
      return NextResponse.json(
        { success: true, fileName: result.body.fileName },
        { status: result.status }
      );
    }

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

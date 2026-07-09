import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import { createSalesRuntime, type PipelineFunnel } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;

  try {
    const data = createSalesRuntime().memory.getPipelineFunnel(project);
    const response: ApiResponse<PipelineFunnel> = {
      success: true,
      data,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (error) {
    console.error("Pipeline funnel API error:", error);
    const fallback: ApiResponse<PipelineFunnel> = {
      success: false,
      error: "Failed to load pipeline data",
      data: createSalesRuntime().memory.getPipelineFunnel("local"),
    };
    return NextResponse.json(fallback, { status: 500 });
  }
}

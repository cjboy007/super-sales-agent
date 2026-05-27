import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import type { ApiResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const agent = createSalesRuntime().memory.getAgentById(project, params.id);

  if (!agent) {
    return NextResponse.json(
      { success: false, error: `Agent "${params.id}" not found` },
      { status: 404 }
    );
  }

  const resp: ApiResponse<typeof agent> = { success: true, data: agent };
  return NextResponse.json(resp);
}

import { NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import type { ApiResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") || "farreach";

  const agents = createSalesRuntime().memory.getAgents(project);
  const resp: ApiResponse<typeof agents> = { success: true, data: agents };
  return NextResponse.json(resp);
}

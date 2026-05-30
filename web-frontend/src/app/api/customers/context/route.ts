import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime, type Customer360ReadModel } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";
import type { ApiResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(request, project);
  if (!auth.ok) return auth.response;
  const query = request.nextUrl.searchParams.get("query") || request.nextUrl.searchParams.get("customer") || "";
  const runtime = createSalesRuntime();
  const response: ApiResponse<Customer360ReadModel> = {
    success: true,
    data: runtime.memory.getCustomer360(project, query),
  };
  return NextResponse.json(response);
}

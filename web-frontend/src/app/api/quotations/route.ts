import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import { createSalesRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const project = searchParams.get("project") || "farreach";
  const memory = createSalesRuntime().memory;

  if (action === "stats") {
    const resp: ApiResponse<ReturnType<typeof memory.getQuotationStats>> = {
      success: true,
      data: memory.getQuotationStats(project),
    };
    return NextResponse.json(resp);
  }

  if (action === "types") {
    const resp: ApiResponse<string[]> = {
      success: true,
      data: memory.getQuotationTypes(project),
    };
    return NextResponse.json(resp);
  }

  if (action === "reload") {
    memory.invalidateQuotations(project);
    const resp: ApiResponse<string> = {
      success: true,
      data: "Quotation cache cleared",
    };
    return NextResponse.json(resp);
  }

  // Default: paginated list with filters
  const search = searchParams.get("search") || "";
  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

  const result = memory.getQuotations(project, { search, type, status, page, pageSize });
  return NextResponse.json(result);
}

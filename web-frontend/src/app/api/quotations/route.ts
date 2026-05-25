import { NextRequest, NextResponse } from "next/server";
import {
  getQuotations,
  getQuotationStats,
  getQuotationTypes,
  invalidateQuotationCache,
} from "@/lib/quotations";
import type { ApiResponse } from "@/lib/api-types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "stats") {
    const resp: ApiResponse<ReturnType<typeof getQuotationStats>> = {
      success: true,
      data: getQuotationStats(),
    };
    return NextResponse.json(resp);
  }

  if (action === "types") {
    const resp: ApiResponse<string[]> = {
      success: true,
      data: getQuotationTypes(),
    };
    return NextResponse.json(resp);
  }

  if (action === "reload") {
    invalidateQuotationCache();
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

  const result = getQuotations({ search, type, status, page, pageSize });
  return NextResponse.json(result);
}

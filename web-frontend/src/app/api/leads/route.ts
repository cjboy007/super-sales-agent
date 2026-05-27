import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse, PaginatedResponse } from "@/lib/api-types";
import { createSalesRuntime } from "@/lib/runtime";

// Cache-Control helper
function cachedJson<T>(data: T, maxAge = 60): NextResponse<T> {
  return NextResponse.json(data, {
    headers: { "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}` },
  });
}

// ── API Route ──

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const project = searchParams.get("project") || "farreach";
  const runtime = createSalesRuntime();
  const memory = runtime.memory;

  // Countries
  if (action === "countries") {
    return cachedJson(memory.getLeadCountries(project), 300);
  }

  // Stats
  if (action === "stats") {
    return cachedJson(memory.getLeadStats(project), 60);
  }

  // Reload cache
  if (action === "reload") {
    memory.invalidate();
    const resp: ApiResponse<string> = { success: true, data: "Cache invalidated" };
    return NextResponse.json(resp);
  }

  // Combined: stats + countries + leads in one request (reduces 3 HTTP calls to 1)
  if (action === "combined") {
    const search = searchParams.get("search") || "";
    const score = searchParams.get("score") || "";
    const country = searchParams.get("country") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

    return cachedJson({
      success: true,
      data: {
        stats: memory.getLeadStats(project),
        countries: memory.getLeadCountries(project),
        leads: memory.getLeads(project, { search, score, country, page, pageSize }),
      },
    }, 30);
  }

  // Paginated list
  const search = searchParams.get("search") || "";
  const score = searchParams.get("score") || "";
  const country = searchParams.get("country") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

  const result = memory.getLeads(project, { search, score, country, page, pageSize });

  return cachedJson(result, 30);
}

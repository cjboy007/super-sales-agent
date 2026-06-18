import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse, PaginatedResponse } from "@/lib/api-types";
import type { CompanyIntelLeadInput } from "@/lib/runtime";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

function liveJson<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}

// ── API Route ──

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const runtime = createSalesRuntime();
  const memory = runtime.memory;

  if (action === "company-intel") {
    const lead: CompanyIntelLeadInput = {
      companyName: searchParams.get("companyName") || "",
      country: searchParams.get("country") || "",
      industry: searchParams.get("industry") || "",
      contact: searchParams.get("contact") || "",
      position: searchParams.get("position") || "",
      email: searchParams.get("email") || "",
      homepage: searchParams.get("homepage") || "",
      category: searchParams.get("category") || "",
      reason: searchParams.get("reason") || "",
      confidence: searchParams.get("confidence") || "",
      score: searchParams.get("score") === "Hot" || searchParams.get("score") === "Warm" || searchParams.get("score") === "Cold"
        ? searchParams.get("score") as "Hot" | "Warm" | "Cold"
        : undefined,
    };
    return liveJson(runtime.getCompanyIntel({ workspaceId: project, lead }));
  }

  // Countries
  if (action === "countries") {
    return liveJson(memory.getLeadCountries(project));
  }

  // Stats
  if (action === "stats") {
    return liveJson(memory.getLeadStats(project));
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

    return liveJson({
      success: true,
      data: {
        stats: memory.getLeadStats(project),
        countries: memory.getLeadCountries(project),
        leads: memory.getLeads(project, { search, score, country, page, pageSize }),
      },
    });
  }

  // Paginated list
  const search = searchParams.get("search") || "";
  const score = searchParams.get("score") || "";
  const country = searchParams.get("country") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

  const result = memory.getLeads(project, { search, score, country, page, pageSize });

  return liveJson(result);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: string;
      project?: string;
      lead?: CompanyIntelLeadInput;
      force?: boolean;
    };
    const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    if (body.action === "queue-company-intel") {
      if (!body.lead || typeof body.lead !== "object") {
        return NextResponse.json({ success: false, error: "Lead is required" }, { status: 400 });
      }
      const runtime = createSalesRuntime();
      const result = runtime.queueCompanyIntel({
        workspaceId: project,
        lead: body.lead,
        force: body.force,
        source: "leads-page",
      });
      return liveJson(result);
    }

    return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

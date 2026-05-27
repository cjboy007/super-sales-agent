import { NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import { createSalesRuntime, type DashboardOverviewReadModel, type SideEffectDecision } from "@/lib/runtime";

export const dynamic = "force-dynamic";

interface DashboardOverview extends DashboardOverviewReadModel {
  sideEffect?: SideEffectDecision;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") || "farreach";

  try {
    const runtime = createSalesRuntime();
    const resp: ApiResponse<DashboardOverview> = await runtime.getDashboardOverview(project);
    return NextResponse.json(resp, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
    });
  } catch (error) {
    console.error("Dashboard overview API error:", error);
    const fallbackResp: ApiResponse<DashboardOverview> = {
      success: false,
      error: "Internal server error",
      data: {
        stats: { activeLeads: 0, todayEmails: 0, pendingQuotations: 0, conversionRate: 0 },
        recentLeads: [],
        agentTasks: [],
      }
    };
    return NextResponse.json(fallbackResp, { status: 500 });
  }
}

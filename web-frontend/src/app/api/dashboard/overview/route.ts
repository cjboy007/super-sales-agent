import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import { createSalesRuntime, type DashboardOverviewReadModel, type SideEffectDecision } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { withPublicAction } from "../../public-action";

export const dynamic = "force-dynamic";

interface DashboardOverview extends DashboardOverviewReadModel {
  sideEffect?: SideEffectDecision;
}

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;

  try {
    const runtime = createSalesRuntime();
    const resp: ApiResponse<DashboardOverview> = await runtime.getDashboardOverview(project);
    const data = resp.data ? withPublicAction(resp.data) : resp.data;
    return NextResponse.json({ ...resp, data }, {
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

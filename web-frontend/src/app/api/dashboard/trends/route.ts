import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import { createSalesRuntime, type DashboardTrendsReadModel } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;

  try {
    const runtime = createSalesRuntime();
    const response: ApiResponse<DashboardTrendsReadModel> = {
      success: true,
      data: runtime.memory.getDashboardTrends(project),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=120" },
    });
  } catch (error) {
    console.error("Dashboard trends API error:", error);
    const labels = Array.from({ length: 14 }, (_, index) => String(index + 1));
    const emptySeries = {
      label: "",
      unit: "",
      points: new Array(14).fill(0),
      labels,
    };
    const fallback: ApiResponse<DashboardTrendsReadModel> = {
      success: false,
      error: "Failed to load trends",
      data: {
        series: {
          activeLeads: { ...emptySeries, label: "活跃线索" },
          todayEmails: { ...emptySeries, label: "今日邮件" },
          pendingQuotations: { ...emptySeries, label: "待处理报价" },
          conversionRate: { ...emptySeries, label: "转化率" },
        },
        updatedAt: new Date().toISOString(),
      },
    };
    return NextResponse.json(fallback, { status: 500 });
  }
}

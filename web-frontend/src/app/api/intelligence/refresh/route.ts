import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IntelligenceRefreshResult = Awaited<ReturnType<ReturnType<typeof createSalesRuntime>["refreshIntelligence"]>>;

function publicRefreshResult(result: IntelligenceRefreshResult) {
  const cached = Boolean(result.cache?.hit);
  return {
    success: result.success,
    data: {
      status: result.success ? (cached ? "cached" : "updated") : "needs_retry",
      updatedAt: result.updatedAt,
      newsCount: result.newsCount,
      competitorCount: result.competitorCount,
      cached,
      message: result.success
        ? cached
          ? "Saved market intelligence is already current."
          : "Market intelligence was refreshed."
        : "Market intelligence could not be refreshed. Existing saved intelligence was kept.",
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    const result = await createSalesRuntime().refreshIntelligence(project);
    return NextResponse.json(publicRefreshResult(result), { status: result.success ? 200 : 502 });
  } catch (error) {
    const message = errorMessage(error);
    return NextResponse.json({
      success: false,
      data: {
        status: "needs_retry",
        updatedAt: new Date().toISOString(),
        newsCount: 0,
        competitorCount: 0,
        cached: false,
        message: "Market intelligence could not be refreshed. Existing saved intelligence was kept.",
      },
    }, { status: 500 });
  }
}

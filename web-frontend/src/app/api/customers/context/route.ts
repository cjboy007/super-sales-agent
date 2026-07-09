import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime, type Customer360ReadModel } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import type { ApiResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

type Customer360PublicView = Omit<Customer360ReadModel, "workspaceId" | "memory"> & {
  memorySummary: {
    summary: string;
    openRisks: string[];
    recommendedNextSteps: string[];
    recentRecords: Array<{
      kind: string;
      title: string;
      body: string;
      updatedAt?: string;
    }>;
    updatedAt: string;
  };
};

function cleanPublicText(value: string): string {
  return value
    .replace(/\/Users\/[^\s"'`]+/g, "the local runtime")
    .replace(/\/var\/folders\/[^\s"'`]+/g, "the local runtime")
    .replace(/\/tmp\/[^\s"'`]+/g, "the local runtime")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "the local runtime")
    .replace(/\.ssa\/[^\s"'`]+/g, "the local runtime");
}

function publicCustomer360View(context: Customer360ReadModel): Customer360PublicView {
  const { workspaceId: _workspaceId, memory, ...rest } = context;
  return {
    ...rest,
    memorySummary: {
      summary: cleanPublicText(memory.timeline.summary),
      openRisks: memory.timeline.openRisks.map(cleanPublicText),
      recommendedNextSteps: memory.timeline.recommendedNextSteps.map(cleanPublicText),
      recentRecords: memory.timeline.recentRecords.map((record) => ({
        kind: record.kind,
        title: cleanPublicText(record.title),
        body: cleanPublicText(record.body).slice(0, 240),
        updatedAt: record.updatedAt,
      })),
      updatedAt: memory.timeline.updatedAt,
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const query = request.nextUrl.searchParams.get("query") || request.nextUrl.searchParams.get("customer") || "";
  const runtime = createSalesRuntime();
  const response: ApiResponse<Customer360PublicView> = {
    success: true,
    data: publicCustomer360View(runtime.memory.getCustomer360(project, query)),
  };
  return NextResponse.json(response);
}

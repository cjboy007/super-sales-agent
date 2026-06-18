import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  return NextResponse.json(createSalesRuntime().memory.getIntelligenceFeed(project, "news"));
}

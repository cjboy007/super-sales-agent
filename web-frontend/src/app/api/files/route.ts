import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(request, project);
  if (!auth.ok) return auth.response;

  const result = createSalesRuntime().serveFile({
    path: request.nextUrl.searchParams.get("path"),
    workspaceId: project,
    download: request.nextUrl.searchParams.get("download") === "true",
  });

  if (result.kind === "error") {
    return NextResponse.json(result.body, { status: result.status });
  }

  return new NextResponse(result.body, { status: 200, headers: result.headers });
}

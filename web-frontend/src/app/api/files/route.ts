import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime, runtimeFilePathFromToken } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { allowRuntimeFilePathFallback } from "@/lib/runtime/local-gateway";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const token = request.nextUrl.searchParams.get("token");
  const tokenPath = runtimeFilePathFromToken(token, project);

  if (token && !tokenPath) {
    return NextResponse.json({ error: "Invalid file token" }, { status: 400 });
  }
  if (!tokenPath && !allowRuntimeFilePathFallback()) {
    return NextResponse.json({ error: "File token is required in local gateway mode." }, { status: 400 });
  }

  const result = createSalesRuntime().serveFile({
    path: tokenPath || request.nextUrl.searchParams.get("path"),
    workspaceId: project,
    download: request.nextUrl.searchParams.get("download") === "true",
  });

  if (result.kind === "error") {
    return NextResponse.json(result.body, { status: result.status });
  }

  return new NextResponse(result.body, { status: 200, headers: result.headers });
}

import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(request, project);
  if (!auth.ok) return auth.response;
  const runtime = createSalesRuntime();
  const preview = await runtime.previewFile({ path: filePath, workspaceId: project });

  if (preview.kind === "html") {
    return new NextResponse(preview.html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  return NextResponse.json(preview.body, { status: preview.status });
}

import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { withPublicAction } from "../../public-action";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const runtime = createSalesRuntime();
  const preview = await runtime.previewFile({ path: filePath, workspaceId: project });

  if (preview.kind === "html") {
    return new NextResponse(preview.html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  return NextResponse.json(withPublicAction(preview.body), { status: preview.status });
}

import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { runDemoEmailCrmDrill } from "@/lib/runtime/demo-data";

export const dynamic = "force-dynamic";

function demoRequestBody(request: NextRequest, body: { workspaceId?: string; project?: string; now?: string }) {
  const explicitWorkspace = body.workspaceId ||
    body.project ||
    request.nextUrl.searchParams.get("project") ||
    request.nextUrl.searchParams.get("workspaceId");
  if (explicitWorkspace) return body;
  return { ...body, workspaceId: "demo-exporter" };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { workspaceId?: string; project?: string; now?: string };
    const auth = requireResolvedWorkspaceAccess(request, demoRequestBody(request, body));
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    const runtime = createSalesRuntime();
    const data = runDemoEmailCrmDrill(runtime, project, {
      now: typeof body.now === "string" ? body.now : undefined,
    });
    const { workspaceId: _workspaceId, companyIntelQueued: _companyIntelQueued, ...publicData } = data;
    return NextResponse.json({ success: true, data: publicData });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

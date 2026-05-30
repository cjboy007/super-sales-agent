import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

interface OperatorCommandBody {
  page?: string;
  message?: string;
  context?: Record<string, unknown>;
  url?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as OperatorCommandBody;
  const runtime = createSalesRuntime();
  const workspaceId = request.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(request, workspaceId);
  if (!auth.ok) return auth.response;

  try {
    const record = runtime.createOperatorCommand({
      workspaceId,
      page: body.page,
      message: body.message,
      context: body.context,
      url: body.url,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        status: record.status,
        sideEffects: record.sideEffects,
        jobId: record.jobId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Message is required" ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

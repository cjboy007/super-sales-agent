import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

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

  try {
    const record = runtime.createOperatorCommand({
      workspaceId: new URL(request.url).searchParams.get("project") || "farreach",
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

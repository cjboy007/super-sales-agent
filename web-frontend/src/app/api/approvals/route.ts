import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import {
  createSalesRuntime,
  type ApprovalInput,
  type ApprovalPatchInput,
  type ApprovalRecord,
} from "@/lib/runtime";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes("required") || message.includes("not found") ? 400 : fallbackStatus;
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  const runtime = createSalesRuntime();
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const id = request.nextUrl.searchParams.get("id");
  const data = runtime.memory.listApprovals(project, id);
  const response: ApiResponse<ApprovalRecord[]> = { success: true, data };
  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  try {
    const runtime = createSalesRuntime();
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const body = (await request.json().catch(() => ({}))) as ApprovalInput;
    const data = runtime.memory.upsertApproval(
      { ...body, workspaceId: project },
      runtime.recordEvent.bind(runtime)
    );
    const response: ApiResponse<ApprovalRecord> = { success: true, data };
    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const runtime = createSalesRuntime();
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const body = (await request.json().catch(() => ({}))) as ApprovalPatchInput;
    const data = runtime.memory.updateApproval(
      project,
      body,
      runtime.recordEvent.bind(runtime)
    );
    const response: ApiResponse<ApprovalRecord> = { success: true, data };
    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

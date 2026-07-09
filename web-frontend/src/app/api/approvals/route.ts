import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import {
  createSalesRuntime,
  type ApprovalInput,
  type ApprovalPatchInput,
  type ApprovalRecord,
} from "@/lib/runtime";

export const dynamic = "force-dynamic";

type PublicApprovalRecord = Omit<ApprovalRecord, "workspaceId" | "project" | "deal_id" | "metadata">;

function cleanPublicText(value: string): string {
  return value
    .replace(/\/Users\/[^\s"'`]+/g, "the local runtime")
    .replace(/\.ssa\/[^\s"'`]+/g, "the local runtime");
}

function publicApproval(record: ApprovalRecord): PublicApprovalRecord {
  const {
    workspaceId: _workspaceId,
    project: _project,
    deal_id: _deal_id,
    metadata: _metadata,
    ...rest
  } = record;

  return {
    ...rest,
    dealId: cleanPublicText(rest.dealId),
    account: cleanPublicText(rest.account),
    title: cleanPublicText(rest.title),
    triggerType: cleanPublicText(rest.triggerType),
    value: cleanPublicText(rest.value),
    risk: cleanPublicText(rest.risk),
    due: cleanPublicText(rest.due),
    recommendation: cleanPublicText(rest.recommendation),
    guardrail: cleanPublicText(rest.guardrail),
    decisionBy: rest.decisionBy ? cleanPublicText(rest.decisionBy) : undefined,
    decisionNote: rest.decisionNote ? cleanPublicText(rest.decisionNote) : undefined,
  };
}

function errorResponse(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes("required") || message.includes("not found") ? 400 : fallbackStatus;
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  const runtime = createSalesRuntime();
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const id = request.nextUrl.searchParams.get("id");
  const data = runtime.memory.listApprovals(project, id).map(publicApproval);
  const response: ApiResponse<PublicApprovalRecord[]> = { success: true, data };
  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  try {
    const runtime = createSalesRuntime();
    const body = (await request.json().catch(() => ({}))) as ApprovalInput;
    const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    const data = publicApproval(runtime.memory.upsertApproval(
      { ...body, workspaceId: project },
      runtime.recordEvent.bind(runtime)
    ));
    const response: ApiResponse<PublicApprovalRecord> = { success: true, data };
    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const runtime = createSalesRuntime();
    const body = (await request.json().catch(() => ({}))) as ApprovalPatchInput;
    const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    const data = publicApproval(runtime.memory.updateApproval(
      project,
      body,
      runtime.recordEvent.bind(runtime)
    ));
    const response: ApiResponse<PublicApprovalRecord> = { success: true, data };
    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

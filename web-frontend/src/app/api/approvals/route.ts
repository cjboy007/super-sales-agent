/**
 * API: GET /api/approvals
 * API: POST /api/approvals
 * API: PATCH /api/approvals
 * Returns pending/approved/rejected approval requests for Battle Station.
 * Optional query params: ?status=pending&deal_id=xxx&id=APV-123
 *
 * Uses better-sqlite3 directly — no Python subprocess.
 */

import { NextResponse } from "next/server";
import {
  createApprovalRequest,
  getApprovalById,
  getApprovals,
  updateApprovalStatus,
  type ApprovalStatus,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const dealId = url.searchParams.get("deal_id") || undefined;
  const id = url.searchParams.get("id") || undefined;

  try {
    if (id) {
      const record = getApprovalById(id);
      return NextResponse.json({ success: true, data: record ? [record] : [] });
    }
    const data = getApprovals(status, dealId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: true, data: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.account !== "string" || typeof body.title !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required fields: account, title" },
        { status: 400 }
      );
    }

    const triggerType = typeof body.triggerType === "string"
      ? body.triggerType
      : typeof body.trigger === "string"
        ? body.trigger
        : "";
    if (!triggerType) {
      return NextResponse.json(
        { success: false, error: "Missing required field: triggerType" },
        { status: 400 }
      );
    }

    const record = createApprovalRequest({
      id: typeof body.id === "string" ? body.id : undefined,
      dealId: typeof body.dealId === "string" ? body.dealId : undefined,
      account: body.account,
      title: body.title,
      triggerType,
      value: typeof body.value === "string" ? body.value : undefined,
      risk: typeof body.risk === "string" ? body.risk : undefined,
      due: typeof body.due === "string" ? body.due : undefined,
      recommendation: typeof body.recommendation === "string" ? body.recommendation : undefined,
      guardrail: typeof body.guardrail === "string" ? body.guardrail : undefined,
      status: typeof body.status === "string" ? (body.status as ApprovalStatus) : undefined,
      decisionBy: typeof body.decisionBy === "string" ? body.decisionBy : undefined,
      decisionNote: typeof body.decisionNote === "string" ? body.decisionNote : undefined,
      metadata: body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : undefined,
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? (body.status as ApprovalStatus) : "";

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: id, status" },
        { status: 400 }
      );
    }

    const record = updateApprovalStatus(
      id,
      status,
      typeof body.decisionBy === "string" ? body.decisionBy : undefined,
      typeof body.decisionNote === "string" ? body.decisionNote : undefined
    );

    if (!record) {
      return NextResponse.json({ success: false, error: "Approval not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

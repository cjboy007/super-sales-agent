import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

// POST /api/inbox/[emailId]/select - select a reply strategy, returns full email
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const body = await request.json().catch(() => ({})) as { style?: unknown };
  const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const { emailId } = await params;
  const result = await createSalesRuntime().selectInboxReplyStyle({
    workspaceId: project,
    emailId,
    style: body.style,
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result);
}

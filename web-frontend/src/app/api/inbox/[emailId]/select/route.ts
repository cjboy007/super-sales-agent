import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

// POST /api/inbox/[emailId]/select - select a reply strategy, returns full email
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(request, project);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({})) as { style?: unknown };
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

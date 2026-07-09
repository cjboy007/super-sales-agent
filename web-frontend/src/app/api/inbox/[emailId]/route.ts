import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { withPublicAction } from "../../public-action";

export const dynamic = "force-dynamic";

// GET /api/inbox/[emailId] — single email detail from farreach (fallback to mock)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params;
  const runtime = createSalesRuntime();
  const auth = requireResolvedWorkspaceAccess(req);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const email = await runtime.getInboxEmail(project, emailId);

  if (!email.success) {
    return NextResponse.json(withPublicAction(email), { status: 404 });
  }
  return NextResponse.json(withPublicAction(email));
}

import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

// GET /api/inbox/[emailId] — single email detail from farreach (fallback to mock)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params;
  const runtime = createSalesRuntime();
  const project = req.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(req, project);
  if (!auth.ok) return auth.response;
  const email = await runtime.getInboxEmail(project, emailId);

  if (!email.success) {
    return NextResponse.json(email, { status: 404 });
  }
  return NextResponse.json(email);
}

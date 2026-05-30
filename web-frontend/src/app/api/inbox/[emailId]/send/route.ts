import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

// POST /api/inbox/[emailId]/send — confirm and send the email via farreach SMTP
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params;
  const body = await req.json();
  const project = req.nextUrl.searchParams.get("project") || "farreach";
  const auth = requireWorkspaceAccess(req, project);
  if (!auth.ok) return auth.response;
  const runtime = createSalesRuntime();

  return NextResponse.json(await runtime.sendInboxReply({
    workspaceId: project,
    emailId,
    ...body,
  }));
}

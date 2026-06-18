import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { cleanPublicText, withPublicAction } from "../../../public-action";

export const dynamic = "force-dynamic";

// POST /api/inbox/[emailId]/send — confirm and send the email via farreach SMTP
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params;
  const body = await req.json();
  const auth = requireResolvedWorkspaceAccess(req, body as Record<string, unknown>);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const runtime = createSalesRuntime();

  const result = withPublicAction(await runtime.sendInboxReply({
    workspaceId: project,
    emailId,
    ...body,
  }));
  return NextResponse.json({
    ...result,
    message: typeof result.message === "string" ? cleanPublicText(result.message) : result.message,
  });
}

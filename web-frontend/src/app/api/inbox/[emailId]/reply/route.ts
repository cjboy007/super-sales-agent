import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

// POST /api/inbox/[emailId]/reply — generate AI reply draft
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

  return NextResponse.json(await runtime.draftInboxReply({
    workspaceId: project,
    emailId,
    ...body,
  }));
}

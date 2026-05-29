import { NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

// POST /api/inbox/[emailId]/reply — generate AI reply draft
export async function POST(
  req: Request,
  { params }: { params: { emailId: string } }
) {
  const { emailId } = params;
  const body = await req.json();
  const project = new URL(req.url).searchParams.get("project") || "farreach";
  const runtime = createSalesRuntime();

  return NextResponse.json(await runtime.draftInboxReply({
    workspaceId: project,
    emailId,
    ...body,
  }));
}

import { NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

// POST /api/inbox/[emailId]/send — confirm and send the email via farreach SMTP
export async function POST(
  req: Request,
  { params }: { params: { emailId: string } }
) {
  const { emailId } = params;
  const body = await req.json();
  const project = new URL(req.url).searchParams.get("project") || "farreach";
  const runtime = createSalesRuntime();

  return NextResponse.json(await runtime.sendInboxReply({
    workspaceId: project,
    emailId,
    ...body,
  }));
}

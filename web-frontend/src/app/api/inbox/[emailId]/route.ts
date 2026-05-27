import { NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

// GET /api/inbox/[emailId] — single email detail from farreach (fallback to mock)
export async function GET(
  req: Request,
  { params }: { params: { emailId: string } }
) {
  const { emailId } = params;
  const runtime = createSalesRuntime();
  const project = new URL(req.url).searchParams.get("project") || "farreach";
  const email = await runtime.getInboxEmail(project, emailId);

  if (!email.success) {
    return NextResponse.json(email, { status: 404 });
  }
  return NextResponse.json(email);
}

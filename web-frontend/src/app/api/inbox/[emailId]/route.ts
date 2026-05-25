import { NextResponse } from "next/server";
import { MOCK_INBOX } from "@/lib/mock/inbox";

const FARREACH_URL = process.env.SSA_FARREACH_URL || "http://localhost:3456";

// GET /api/inbox/[emailId] — single email detail from farreach (fallback to mock)
export async function GET(
  _req: Request,
  { params }: { params: { emailId: string } }
) {
  const { emailId } = params;

  try {
    const res = await fetch(`${FARREACH_URL}/api/v1/inbox/${emailId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.email) {
        return NextResponse.json({ success: true, data: data.email });
      }
    }
  } catch {
    // Fallback to mock
  }

  const email = MOCK_INBOX.find((e) => e.id === emailId);
  if (!email) {
    return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: email });
}

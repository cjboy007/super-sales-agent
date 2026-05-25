import { NextResponse } from "next/server";
import { MOCK_INBOX, MOCK_INBOX_STATS } from "@/lib/mock/inbox";

const FARREACH_URL = process.env.SSA_FARREACH_URL || "http://localhost:3456";

// GET /api/inbox — list inbox emails from farreach (fallback to mock)
export async function GET() {
  try {
    const res = await fetch(`${FARREACH_URL}/api/v1/inbox?limit=20`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.emails && data.emails.length > 0) {
        return NextResponse.json({
          success: true,
          data: data.emails,
          total: data.count,
          stats: MOCK_INBOX_STATS,
        });
      }
    }
  } catch {
    // Fallback to mock if farreach is unavailable
  }

  // Fallback: mock data
  const pending = MOCK_INBOX.filter((e) => e.status === "pending_decision");
  return NextResponse.json({
    success: true,
    data: pending,
    total: pending.length,
    stats: MOCK_INBOX_STATS,
  });
}

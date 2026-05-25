import { NextRequest, NextResponse } from "next/server";
import { getAuditEvents } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
  const type = searchParams.get("type") || undefined;

  try {
    const data = getAuditEvents(limit, type);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error), data: [] },
      { status: 500 }
    );
  }
}

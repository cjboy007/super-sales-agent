import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const stats = createSalesRuntime().memory.getEmailStats(project);
    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

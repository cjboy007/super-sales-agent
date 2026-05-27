import { NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

// GET /api/inbox — list inbox emails from farreach (fallback to mock)
export async function GET(request: Request) {
  const runtime = createSalesRuntime();
  const url = new URL(request.url);
  const project = url.searchParams.get("project") || "farreach";
  const limit = Number(url.searchParams.get("limit") || "20");

  return NextResponse.json(await runtime.getInbox(project, limit));
}

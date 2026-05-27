export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

export async function GET(request: Request) {
  const project = new URL(request.url).searchParams.get("project") || "farreach";
  return NextResponse.json(createSalesRuntime().memory.getIntelligenceFeed(project, "trends"));
}

import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = createSalesRuntime().serveFile({
    path: request.nextUrl.searchParams.get("path"),
    download: request.nextUrl.searchParams.get("download") === "true",
  });

  if (result.kind === "error") {
    return NextResponse.json(result.body, { status: result.status });
  }

  return new NextResponse(result.body, { status: 200, headers: result.headers });
}

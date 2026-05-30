import { NextRequest, NextResponse } from "next/server";
import { getSystemResources, invalidateSystemCache } from "@/lib/system";
import type { ApiResponse } from "@/lib/api-types";
import { requireBetaAuth } from "@/lib/runtime/beta-auth";

export async function GET(request: NextRequest) {
  const auth = requireBetaAuth(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "reload") {
    invalidateSystemCache();
    const resp: ApiResponse<string> = {
      success: true,
      data: "System cache cleared",
    };
    return NextResponse.json(resp);
  }

  const resources = getSystemResources();
  const resp: ApiResponse<typeof resources> = {
    success: true,
    data: resources,
  };
  return NextResponse.json(resp);
}

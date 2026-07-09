import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { getLocalStorageSummary, listLocalStorageEntries } from "@/lib/runtime/local-storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const relativePath = request.nextUrl.searchParams.get("path") || "documents";
    return NextResponse.json({
      success: true,
      data: {
        summary: getLocalStorageSummary(auth.workspaceId),
        listing: listLocalStorageEntries({
          workspaceId: auth.workspaceId,
          relativePath,
        }),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to read local storage" },
      { status: 400 }
    );
  }
}

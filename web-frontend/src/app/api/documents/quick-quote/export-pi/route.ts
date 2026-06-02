import { NextRequest, NextResponse } from "next/server";
import type { QuickQuoteData } from "@/lib/quick-quote";
import { exportQuickQuotePiPackage } from "@/lib/runtime/quick-quote-export";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

interface ExportPiBody {
  quote?: QuickQuoteData;
}

export async function POST(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;

    const body: ExportPiBody = await request.json();
    if (!body.quote) {
      return NextResponse.json({ success: false, error: "Missing quick quote data" }, { status: 400 });
    }

    const result = exportQuickQuotePiPackage(project, body.quote);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to export PI package" },
      { status: 500 }
    );
  }
}

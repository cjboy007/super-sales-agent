import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime, type TradeDocumentData } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

type TradeDocumentType = "PI" | "CI" | "PL" | "ALL";

interface GenerateTradeDocumentsBody {
  data: TradeDocumentData;
  docTypes: TradeDocumentType[];
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateTradeDocumentsBody = await request.json();
    const project = new URL(request.url).searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;
    const { data, docTypes } = body;

    if (!data || !docTypes || docTypes.length === 0) {
      return NextResponse.json({ success: false, error: "Missing data or docTypes" }, { status: 400 });
    }

    const unsupportedTypes = docTypes.filter((type) => type !== "CI" && type !== "PL");
    if (unsupportedTypes.length > 0) {
      return NextResponse.json(
        { success: false, error: "Shipment document generation only supports CI and PL from a saved PI. Create PI from Quick Quote first." },
        { status: 400 }
      );
    }

    if (!data.pi_info?.pi_no?.trim()) {
      return NextResponse.json({ success: false, error: "PI number is required before generating CI / PL." }, { status: 400 });
    }

    const runtime = createSalesRuntime();
    const savedPi = runtime
      .listPiRecords(project, data.pi_info.pi_no)
      .records
      .some((record) => record.piNo === data.pi_info.pi_no);
    if (!savedPi) {
      return NextResponse.json(
        { success: false, error: "Saved PI record not found. Export the PI from Quick Quote before generating CI / PL." },
        { status: 400 }
      );
    }

    const result = await runtime.generateTradeDocuments({ workspaceId: project, data, docTypes });

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `生成失败: ${errorMsg}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;
    return NextResponse.json(createSalesRuntime().listTradeDocuments(project));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime, type TradeDocumentData } from "@/lib/runtime";

type TradeDocumentType = "PI" | "CI" | "PL" | "ALL";

interface GenerateTradeDocumentsBody {
  data: TradeDocumentData;
  docTypes: TradeDocumentType[];
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateTradeDocumentsBody = await request.json();
    const project = new URL(request.url).searchParams.get("project") || "farreach";
    const { data, docTypes } = body;

    if (!data || !docTypes || docTypes.length === 0) {
      return NextResponse.json({ success: false, error: "Missing data or docTypes" }, { status: 400 });
    }

    const runtime = createSalesRuntime();
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

export async function GET() {
  try {
    return NextResponse.json(createSalesRuntime().listTradeDocuments());
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

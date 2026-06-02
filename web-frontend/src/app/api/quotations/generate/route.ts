import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

interface GenerateRequestBody {
  type: "QT" | "PI" | "SPL";
  customer: string;
  items?: Array<{
    name: string;
    description?: string;
    qty?: number;
    unitPrice?: number;
    amount?: number;
  }>;
  terms?: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequestBody = await request.json();
    const project = new URL(request.url).searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;

    if (!body.type || !body.customer) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: type, customer" },
        { status: 400 }
      );
    }

    const runtime = createSalesRuntime();
    const result = await runtime.generateQuotationDocuments({
      workspaceId: project,
      type: body.type,
      customer: body.customer,
      items: body.items,
      terms: body.terms,
      notes: body.notes,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message.startsWith("报价单生成失败:") ? message : `报价单生成失败: ${message}` },
      { status: 500 }
    );
  }
}

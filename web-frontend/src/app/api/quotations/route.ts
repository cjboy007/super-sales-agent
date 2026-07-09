import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/api-types";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { runtimeFileUrl } from "@/lib/runtime/files";

export const dynamic = "force-dynamic";

type RuntimeQuotationResult = ReturnType<ReturnType<typeof createSalesRuntime>["memory"]["getQuotations"]>;
type RuntimeQuotation = RuntimeQuotationResult["quotations"][number];

function publicQuotationFile(project: string, file: RuntimeQuotation["files"][number]) {
  return {
    format: file.format,
    fileName: file.fileName,
    fileType: file.fileType,
    downloadUrl: runtimeFileUrl(file.path, project, true),
  };
}

function publicQuotation(project: string, quote: RuntimeQuotation) {
  return {
    id: quote.id,
    type: quote.type,
    customer: quote.customer,
    amount: quote.amount,
    status: quote.status,
    date: quote.date,
    fileName: quote.fileName,
    fileType: quote.fileType,
    mainProducts: quote.mainProducts,
    files: quote.files.map((file) => publicQuotationFile(project, file)),
  };
}

function publicQuotationList(project: string, result: RuntimeQuotationResult) {
  return {
    ...result,
    quotations: result.quotations.map((quote) => publicQuotation(project, quote)),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
  const memory = createSalesRuntime().memory;

  if (action === "stats") {
    const resp: ApiResponse<ReturnType<typeof memory.getQuotationStats>> = {
      success: true,
      data: memory.getQuotationStats(project),
    };
    return NextResponse.json(resp);
  }

  if (action === "types") {
    const resp: ApiResponse<string[]> = {
      success: true,
      data: memory.getQuotationTypes(project),
    };
    return NextResponse.json(resp);
  }

  if (action === "reload") {
    memory.invalidateQuotations(project);
    const resp: ApiResponse<string> = {
      success: true,
      data: "Quotation cache cleared",
    };
    return NextResponse.json(resp);
  }

  // Default: paginated list with filters
  const search = searchParams.get("search") || "";
  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

  const result = memory.getQuotations(project, { search, type, status, page, pageSize });
  return NextResponse.json(publicQuotationList(project, result));
}

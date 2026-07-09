import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime, type GeneratedTradeDocument, type TradeDocumentData } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { consumeTrialQuota, type TrialAccessSession } from "@/lib/runtime/trial-auth";
import { runtimeFileUrl } from "@/lib/runtime/files";
import { withPublicAction } from "../../public-action";

export const dynamic = "force-dynamic";

type TradeDocumentType = "PI" | "CI" | "PL" | "ALL";

interface GenerateTradeDocumentsBody {
  data: TradeDocumentData;
  docTypes: TradeDocumentType[];
  decisionId?: string;
}

interface PublicTradeDocument {
  type: string;
  filename: string;
  fileName: string;
  size: number;
  created?: string;
  downloadUrl: string;
}

function publicTradeDocument(workspaceId: string, document: GeneratedTradeDocument): PublicTradeDocument {
  return {
    type: document.type,
    filename: document.filename,
    fileName: document.filename,
    size: document.size,
    created: document.created,
    downloadUrl: runtimeFileUrl(document.path, workspaceId, true),
  };
}

function publicTradeDocumentResponse<T extends object>(workspaceId: string, response: T): Omit<T, "documents"> & {
  documents: PublicTradeDocument[];
} {
  const { documents = [], ...rest } = response as T & { documents?: GeneratedTradeDocument[] };
  return {
    ...rest,
    documents: documents.map((document) => publicTradeDocument(workspaceId, document)),
  };
}

function trialQuotaResponse(trial: TrialAccessSession | undefined) {
  if (!trial) return null;
  const quota = consumeTrialQuota(trial, "document");
  if (quota.ok) return null;
  return NextResponse.json(
    {
      success: false,
      error: quota.message,
      reason: quota.reason,
      contactPhone: quota.contactPhone,
    },
    { status: quota.reason === "quota_exceeded" ? 429 : 403 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateTradeDocumentsBody = await request.json();
    const auth = requireResolvedWorkspaceAccess(request, body as unknown as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    const { data, docTypes, decisionId } = body;

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
    const quotaResponse = trialQuotaResponse(auth.session.trial);
    if (quotaResponse) return quotaResponse;

    const result = await runtime.generateTradeDocuments({ workspaceId: project, data, docTypes, decisionId });

    return NextResponse.json(publicTradeDocumentResponse(project, withPublicAction(result)), { status: result.success ? 200 : 500 });
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
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    return NextResponse.json(publicTradeDocumentResponse(project, createSalesRuntime().listTradeDocuments(project)));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

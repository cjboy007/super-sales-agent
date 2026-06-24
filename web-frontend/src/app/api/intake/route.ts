import { NextRequest, NextResponse } from "next/server";
import {
  createSalesRuntime,
  type IntakeAction,
  type IntakeAnalysis,
  type IntakeRecord,
  type IntakeUploadProcessing,
  type ProductDocReaderSummary,
} from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

function isUpload(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

function cleanPublicText(value: string) {
  return value
    .replace(/~\/\.ssa\/[^\s"'`]+/g, "the SSA workspace")
    .replace(/\/Users\/[^\s"'`]+/g, "the local runtime")
    .replace(/\/var\/folders\/[^\s"'`]+/g, "the local runtime")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "the local runtime")
    .replace(/\.ssa\/[^\s"'`]+/g, "the SSA workspace")
    .replace(/\buploadPath\b/g, "uploaded file")
    .replace(/\bjobId\b/g, "operation")
    .replace(/\bworkflow\b/gi, "process")
    .replace(/\bprovider\b/gi, "service")
    .replace(/\bchannel_audit\b/g, "review notes");
}

function publicActionTarget(action: IntakeAction) {
  if (action.id === "archive-original") return "Intake archive";
  if (action.id === "link-context") {
    if (action.target === "manual review queue" || action.target === "review workspace") return "Review workspace";
    if (action.target === "local client context") return "Customer context";
    return "Customer context";
  }
  if (action.id === "place-file") return "Proposed destination";
  return cleanPublicText(action.target);
}

function publicProcessing(processing: IntakeUploadProcessing | undefined) {
  if (!processing) return undefined;
  return {
    status: processing.status,
    kind: processing.kind,
    error: processing.error ? cleanPublicText(processing.error) : undefined,
    updatedAt: processing.updatedAt,
  };
}

type PublicProductDocSummary = Omit<ProductDocReaderSummary, "uploadPath">;
type PublicIntakeAnalysis = Omit<IntakeAnalysis, "productDoc"> & {
  productDoc?: PublicProductDocSummary;
};

function publicAnalysis(analysis: IntakeAnalysis): PublicIntakeAnalysis {
  return {
    ...analysis,
    summary: cleanPublicText(analysis.summary),
    evidence: analysis.evidence.map(cleanPublicText),
    matches: analysis.matches.map((match) => ({
      ...match,
      title: cleanPublicText(match.title),
      detail: cleanPublicText(match.detail),
    })),
    actions: analysis.actions.map((action) => ({
      ...action,
      label: cleanPublicText(action.label),
      target: publicActionTarget(action),
    })),
    productDoc: analysis.productDoc ? {
      productName: cleanPublicText(analysis.productDoc.productName),
      modelNo: cleanPublicText(analysis.productDoc.modelNo),
      drawingNo: cleanPublicText(analysis.productDoc.drawingNo),
      packagingSpec: cleanPublicText(analysis.productDoc.packagingSpec),
      bomRows: analysis.productDoc.bomRows,
      confidence: analysis.productDoc.confidence,
      warnings: analysis.productDoc.warnings.map(cleanPublicText),
      needsReview: analysis.productDoc.needsReview,
    } : undefined,
  };
}

function publicIntakeRecord(record: IntakeRecord) {
  return {
    id: record.id,
    project: record.project,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pastedText: cleanPublicText(record.pastedText),
    uploads: record.uploads.map((upload) => ({
      id: upload.id,
      name: cleanPublicText(upload.name),
      type: upload.type,
      size: upload.size,
      storedAt: upload.storedAt,
      processing: publicProcessing(upload.processing),
    })),
    messages: record.messages.map((message) => ({
      ...message,
      content: cleanPublicText(message.content),
    })),
    analysis: publicAnalysis(record.analysis),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    return NextResponse.json({ success: true, data: createSalesRuntime().listIntakeSessions(project) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const runtime = createSalesRuntime();

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const auth = requireResolvedWorkspaceAccess(request, { project: String(form.get("project") || ""), workspaceId: String(form.get("workspaceId") || "") });
      if (!auth.ok) return auth.response;
      const project = auth.workspaceId;
      const record = await runtime.processIntake({
        project,
        sessionId: String(form.get("sessionId") || ""),
        message: String(form.get("message") || ""),
        pastedText: String(form.get("pastedText") || ""),
        files: form.getAll("files").filter(isUpload),
      });
      return NextResponse.json({ success: true, data: publicIntakeRecord(record) });
    }

    const body = await request.json().catch(() => ({})) as {
      sessionId?: string;
      message?: string;
      pastedText?: string;
      workspaceId?: string;
      project?: string;
    };
    const auth = requireResolvedWorkspaceAccess(request, body);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    const record = await runtime.processIntake({
      project,
      sessionId: body.sessionId || "",
      message: body.message || "",
      pastedText: body.pastedText || "",
    });

    return NextResponse.json({ success: true, data: publicIntakeRecord(record) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
      ? error.status
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

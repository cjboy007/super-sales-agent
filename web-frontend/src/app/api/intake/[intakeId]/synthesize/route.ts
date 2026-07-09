import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime, type SynthesizeIntakeResult } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { runtimeFileUrl } from "@/lib/runtime/files";

export const dynamic = "force-dynamic";

interface SynthesizeBody {
  instruction?: string;
  title?: string;
  workspaceId?: string;
  project?: string;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function publicSynthesisResult(
  project: string,
  intakeId: string,
  result: SynthesizeIntakeResult
) {
  return {
    intakeId,
    synthesisId: result.synthesisId,
    title: result.title,
    fileName: result.fileName,
    downloadUrl: runtimeFileUrl(result.outputPath, project, true),
    filesRead: result.filesRead,
    filesSkipped: result.filesSkipped,
    warnings: result.warnings,
    source: result.source,
    summary: result.summary,
    includedFiles: result.includedFiles,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ intakeId: string }> }
) {
  try {
    const { intakeId } = await params;
    const body = await request.json().catch(() => ({})) as SynthesizeBody;
    const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    const result = await createSalesRuntime().synthesizeIntake({
      workspaceId: project,
      intakeId,
      instruction: stringValue(body.instruction),
      title: stringValue(body.title),
    });

    return NextResponse.json({
      success: true,
      data: publicSynthesisResult(project, intakeId, result),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
      ? error.status
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

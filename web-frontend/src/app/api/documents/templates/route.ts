import { NextRequest, NextResponse } from "next/server";
import { saveDocumentTemplateSamples } from "@/lib/runtime/document-templates";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

function publicTemplateUploadResult(result: Awaited<ReturnType<typeof saveDocumentTemplateSamples>>) {
  return {
    ...result,
    savedFiles: result.savedFiles.map(({ filename, size }) => ({ filename, size })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "No template files uploaded" }, { status: 400 });
    }

    const result = await saveDocumentTemplateSamples(project, files);
    return NextResponse.json(publicTemplateUploadResult(result));
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Template upload failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

function publicDraft(draft: { id: string; subject: string }) {
  return {
    id: draft.id,
    subject: draft.subject,
    status: "draft",
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
    const drafts = createSalesRuntime().memory.getEmailDrafts(project).map(publicDraft);
    return NextResponse.json({ success: true, data: drafts });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

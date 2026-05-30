import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";
import type { EmailConnectionKind } from "@/lib/runtime/email-connection";

export const dynamic = "force-dynamic";

function isConnectionKind(value: unknown): value is EmailConnectionKind {
  return value === "imap" || value === "smtp";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { kind?: unknown };
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;

    if (!isConnectionKind(body.kind)) {
      return NextResponse.json(
        { success: false, error: "Connection test kind must be imap or smtp." },
        { status: 400 }
      );
    }

    const runtime = createSalesRuntime();
    const result = await runtime.testEmailConnection({
      workspaceId: project,
      kind: body.kind,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

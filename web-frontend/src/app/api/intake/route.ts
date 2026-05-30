import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

function isUpload(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

export async function GET(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ success: true, data: createSalesRuntime().listIntakeSessions(project) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;
    const contentType = request.headers.get("content-type") || "";
    const runtime = createSalesRuntime();

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const record = await runtime.processIntake({
        project,
        sessionId: String(form.get("sessionId") || ""),
        message: String(form.get("message") || ""),
        pastedText: String(form.get("pastedText") || ""),
        files: form.getAll("files").filter(isUpload),
      });
      return NextResponse.json({ success: true, data: record });
    }

    const body = await request.json().catch(() => ({})) as {
      sessionId?: string;
      message?: string;
      pastedText?: string;
    };
    const record = await runtime.processIntake({
      project,
      sessionId: body.sessionId || "",
      message: body.message || "",
      pastedText: body.pastedText || "",
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
      ? error.status
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

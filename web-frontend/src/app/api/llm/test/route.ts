import { NextRequest, NextResponse } from "next/server";
import { requireAdminWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { getLlmRuntimeStatus, runLlmTask } from "@/lib/runtime/llm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = requireAdminWorkspaceAccess(request);
  if (!auth.ok) return auth.response;

  const status = getLlmRuntimeStatus();
  if (status.readiness === "mock_fallback") {
    return NextResponse.json({
      success: true,
      data: {
        status,
        tested: false,
        message: "No real model is configured. Demo mode is active.",
      },
    });
  }

  const result = await runLlmTask({
    task: "summarize",
    input: "SSA model connection test. Reply with a short confirmation.",
    context: {
      source: "settings.llm.test",
      promptVersion: "settings.llm.test.v1",
    },
  });

  return NextResponse.json({
    success: result.source === "provider",
    data: {
      status: getLlmRuntimeStatus(),
      tested: true,
      message: result.source === "provider"
        ? "Model connection works."
        : "The configured model did not respond. Demo mode answered instead.",
      fallbackActive: result.source !== "provider",
      responsePreview: result.text.slice(0, 240),
    },
  }, { status: result.source === "provider" ? 200 : 502 });
}

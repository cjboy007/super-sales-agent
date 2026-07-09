import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { getLocalGatewayStatus } from "@/lib/runtime/local-gateway-status";
import { getLocalOnboardingStatus, markLocalOnboardingComplete, resetLocalOnboarding } from "@/lib/runtime/local-onboarding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    success: true,
    data: {
      gateway: getLocalGatewayStatus(),
      onboarding: getLocalOnboardingStatus(),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const auth = requireResolvedWorkspaceAccess(request, body);
  if (!auth.ok) return auth.response;
  if (body.reset === true) {
    return NextResponse.json({ success: true, data: resetLocalOnboarding() });
  }
  const accessMode = body.accessMode === "lan" ? "lan" : body.accessMode === "local" ? "local" : undefined;
  return NextResponse.json({
    success: true,
    data: markLocalOnboardingComplete({
      accessMode,
      modelProvider: typeof body.modelProvider === "string" ? body.modelProvider : undefined,
      testUploadCompleted: Boolean(body.testUploadCompleted),
      synthesisTestCompleted: Boolean(body.synthesisTestCompleted),
    }),
  });
}

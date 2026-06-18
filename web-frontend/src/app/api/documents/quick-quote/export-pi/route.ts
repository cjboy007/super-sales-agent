import { NextRequest, NextResponse } from "next/server";
import type { QuickQuoteData } from "@/lib/quick-quote";
import { exportQuickQuotePiPackage, type QuickQuotePiPackageResult } from "@/lib/runtime/quick-quote-export";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { consumeTrialQuota, type TrialAccessSession } from "@/lib/runtime/trial-auth";

export const dynamic = "force-dynamic";

interface ExportPiBody {
  quote?: QuickQuoteData;
}

function publicPiExport(result: QuickQuotePiPackageResult) {
  return {
    success: result.success,
    customer: result.customer,
    piNo: result.piNo,
    archive: {
      status: "archived",
      fileCount: result.files.length,
    },
    git: {
      committed: result.git.committed,
      message: result.git.message,
    },
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
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    const body: ExportPiBody = await request.json();
    if (!body.quote) {
      return NextResponse.json({ success: false, error: "Missing quick quote data" }, { status: 400 });
    }
    const quotaResponse = trialQuotaResponse(auth.session.trial);
    if (quotaResponse) return quotaResponse;

    const result = exportQuickQuotePiPackage(project, body.quote);
    return NextResponse.json({ success: true, data: publicPiExport(result) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to export PI package" },
      { status: 500 }
    );
  }
}

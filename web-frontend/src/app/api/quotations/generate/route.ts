import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { consumeTrialQuota, type TrialAccessSession } from "@/lib/runtime/trial-auth";
import { withPublicAction } from "../../public-action";

export const dynamic = "force-dynamic";

interface GenerateRequestBody {
  type: "QT" | "PI" | "SPL";
  customer: string;
  items?: Array<{
    name: string;
    description?: string;
    qty?: number;
    unitPrice?: number;
    amount?: number;
  }>;
  terms?: string;
  notes?: string;
  decisionId?: string;
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
    const body: GenerateRequestBody = await request.json();
    const auth = requireResolvedWorkspaceAccess(request, body as unknown as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    if (!body.type || !body.customer) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: type, customer" },
        { status: 400 }
      );
    }
    const quotaResponse = trialQuotaResponse(auth.session.trial);
    if (quotaResponse) return quotaResponse;

    const runtime = createSalesRuntime();
    const result = await runtime.generateQuotationDocuments({
      workspaceId: project,
      type: body.type,
      customer: body.customer,
      items: body.items,
      terms: body.terms,
      notes: body.notes,
      decisionId: body.decisionId,
    });

    return NextResponse.json(withPublicAction(result));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message.startsWith("报价单生成失败:") ? message : `报价单生成失败: ${message}` },
      { status: 500 }
    );
  }
}

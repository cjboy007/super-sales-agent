import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime, type AssistantQueryResult } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { consumeTrialQuota, type TrialAccessSession } from "@/lib/runtime/trial-auth";

export const dynamic = "force-dynamic";

interface AssistantQueryBody {
  question?: unknown;
  message?: unknown;
  customerId?: unknown;
  customerName?: unknown;
  context?: unknown;
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function cleanPublicText(value: string): string {
  return value
    .replace(/\/Users\/[^\s"'`]+/g, "the local runtime")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "the local runtime")
    .replace(/\bprovider\b/gi, "service")
    .slice(0, 1200);
}

function publicResult(result: AssistantQueryResult) {
  return {
    answer: cleanPublicText(result.answer),
    confidence: result.confidence,
    intent: result.intent,
    routing: result.routing,
    evidence: {
      local: result.evidence.local.map((item) => ({
        sourceKind: item.sourceKind,
        sourceType: item.sourceType,
        title: item.title,
        detail: cleanPublicText(item.detail),
        confidence: item.confidence,
      })),
      web: result.evidence.web.map((item) => ({
        provider: item.provider,
        query: item.query,
        title: item.title,
        url: item.url,
        snippet: cleanPublicText(item.snippet),
        checkedAt: item.checkedAt,
      })),
    },
    safety: result.safety,
    warnings: result.warnings.map(cleanPublicText),
    llm: result.llm
      ? {
        provider: result.llm.provider,
        source: result.llm.source,
        confidence: result.llm.confidence,
      }
      : undefined,
  };
}

function trialQuotaResponse(trial: TrialAccessSession | undefined, kind: "ai" | "document") {
  if (!trial) return null;
  const quota = consumeTrialQuota(trial, kind);
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
  const body = (await request.json().catch(() => ({}))) as AssistantQueryBody;
  const runtime = createSalesRuntime();
  const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
  if (!auth.ok) return auth.response;

  const question = textField(body.question) || textField(body.message);
  if (!question) {
    return NextResponse.json({ success: false, error: "Question is required" }, { status: 400 });
  }
  const quotaResponse = trialQuotaResponse(auth.session.trial, "ai");
  if (quotaResponse) return quotaResponse;

  try {
    const result = await runtime.runAssistantQuery({
      workspaceId: auth.workspaceId,
      question,
      customerId: textField(body.customerId) || undefined,
      customerName: textField(body.customerName) || undefined,
      context: objectField(body.context),
    });
    return NextResponse.json({ success: true, data: publicResult(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Assistant question is required." ? 400 : 500;
    return NextResponse.json({ success: false, error: cleanPublicText(message) }, { status });
  }
}

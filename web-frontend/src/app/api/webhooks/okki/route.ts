import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { handleOkkiWebhook } from "@/lib/runtime/okki-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function webhookKey(): string {
  return process.env.OKKI_WEBHOOK_AES_KEY || process.env.SSA_OKKI_WEBHOOK_AES_KEY || "";
}

function workspaceFromRequest(request: NextRequest): string {
  return request.nextUrl.searchParams.get("workspaceId")
    || request.nextUrl.searchParams.get("project")
    || "farreach";
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await handleOkkiWebhook({
    rawBody,
    timestamp: request.headers.get("x-timestamp"),
    signature: request.headers.get("x-signature"),
    aesKeyBase64: webhookKey(),
    workspaceId: workspaceFromRequest(request),
    runtime: createSalesRuntime(),
  });

  return NextResponse.json(result.body, { status: result.status });
}

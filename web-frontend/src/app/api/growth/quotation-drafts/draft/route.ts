import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { createSalesRuntime, runProductQuotationDraft } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const auth = requireResolvedWorkspaceAccess(request, body);
  if (!auth.ok) return auth.response;

  try {
    const run = runProductQuotationDraft(createSalesRuntime(), {
      workspaceId: auth.workspaceId,
      prospectingRunId: typeof body.prospectingRunId === "string" ? body.prospectingRunId : undefined,
      prospectingPacketId: typeof body.prospectingPacketId === "string" ? body.prospectingPacketId : undefined,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });

    return NextResponse.json(sanitizeResponse({
      success: true,
      data: run,
    }));
  } catch {
    return NextResponse.json({
      success: false,
      error: "Quotation draft could not be created from the available prospecting packet.",
    }, { status: 400 });
  }
}

function sanitizeResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeResponse);
  if (!value || typeof value !== "object") return sanitizeScalar(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(^|_|\b)(path|payload|secret)(_|$|\b)/i.test(key)) continue;
    output[key] = sanitizeResponse(item);
  }
  return output;
}

function sanitizeScalar(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/\/Users\/|\.ssa|SSA_/i.test(value)) return "[redacted]";
  return value;
}

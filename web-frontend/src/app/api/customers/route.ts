import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { buildCustomerDirectory, clearCustomerStatusOverride, setCustomerStatusOverride } from "@/lib/runtime/customers";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

export const dynamic = "force-dynamic";

function liveJson<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}

function publicCustomerDirectory<T extends { workspaceId?: unknown }>(data: T): Omit<T, "workspaceId"> {
  const { workspaceId: _workspaceId, ...rest } = data;
  return rest;
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("pageSize") || "20", 10) || 20));
    const runtime = createSalesRuntime();
    const data = buildCustomerDirectory(runtime, project, {
      search: request.nextUrl.searchParams.get("query") || request.nextUrl.searchParams.get("search") || "",
      status: request.nextUrl.searchParams.get("status") || "",
      country: request.nextUrl.searchParams.get("country") || "",
      page,
      pageSize,
    });

    return liveJson({ success: true, data: publicCustomerDirectory(data) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load customers" },
      { status: 500 }
    );
  }
}

function errorStatus(error: unknown, fallback = 500): number {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : fallback;
  return Number.isFinite(status) && status >= 400 && status < 600 ? status : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: unknown;
      workspaceId?: unknown;
      project?: unknown;
      customerId?: unknown;
      status?: unknown;
      reason?: unknown;
      now?: unknown;
    };
    const auth = requireResolvedWorkspaceAccess(request, body as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    const action = typeof body.action === "string" ? body.action : "";
    const customerId = typeof body.customerId === "string" ? body.customerId : "";
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    const now = typeof body.now === "string" ? body.now : undefined;
    const operatorId = auth.session.tokenId;

    if (action === "set-status-override") {
      const runtime = createSalesRuntime();
      const result = setCustomerStatusOverride({
        workspaceId: project,
        customerId,
        status: body.status,
        reason,
        operatorId,
        now,
        runtime,
      });
      return liveJson({ success: true, data: result });
    }

    if (action === "clear-status-override") {
      const result = clearCustomerStatusOverride({
        workspaceId: project,
        customerId,
        reason,
        operatorId,
        now,
      });
      return liveJson({ success: true, data: result });
    }

    return NextResponse.json({ success: false, error: "Unsupported customer action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update customer" },
      { status: errorStatus(error) }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import { createSalesRuntime, runProspectingDryRun, type ProspectingSeedInput } from "@/lib/runtime";

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
    const run = runProspectingDryRun(createSalesRuntime(), {
      workspaceId: auth.workspaceId,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      seeds: Array.isArray(body.seeds) ? body.seeds.map(seedInput) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: run,
    });
  } catch {
    return NextResponse.json({
      success: false,
      error: "Prospecting dry-run could not be created.",
    }, { status: 500 });
  }
}

function seedInput(value: unknown): ProspectingSeedInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return {
    companyName: source.companyName,
    website: source.website,
    country: source.country,
    industry: source.industry,
    contactName: source.contactName,
    contactRole: source.contactRole,
    contactEmail: source.contactEmail,
    sourceUrl: source.sourceUrl,
    notes: source.notes,
  };
}

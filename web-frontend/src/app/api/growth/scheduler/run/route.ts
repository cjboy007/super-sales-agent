import { NextRequest, NextResponse } from "next/server";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";
import {
  createSalesRuntime,
  runGrowthSchedulerTick,
  type ProspectingSeedInput,
} from "@/lib/runtime";

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
    const run = runGrowthSchedulerTick(createSalesRuntime(), {
      workspaceId: auth.workspaceId,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      seeds: Array.isArray(body.seeds) ? body.seeds.map(seedInput) : undefined,
    });

    return NextResponse.json(sanitizeResponse({
      success: true,
      data: {
        ...run,
        guardrailSummary: "no outbound sent; not executed; autopilot not ready",
      },
    }));
  } catch {
    return NextResponse.json({
      success: false,
      error: "Growth scheduler dry-run tick could not be created.",
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

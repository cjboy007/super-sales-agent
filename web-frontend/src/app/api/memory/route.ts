import { NextRequest, NextResponse } from "next/server";
import {
  createSalesRuntime,
  type MemoryAuthority,
  type MemoryRecordKind,
  type MemorySource,
} from "@/lib/runtime";

export const dynamic = "force-dynamic";

const KINDS = new Set<MemoryRecordKind>(["fact", "episode"]);
const AUTHORITIES = new Set<MemoryAuthority>(["authoritative", "imported", "suggested"]);
const SOURCE_TYPES = new Set<MemorySource["type"]>([
  "operator",
  "lead",
  "email",
  "quotation",
  "document",
  "approval",
  "workflow",
  "intake",
  "system",
  "llm",
  "openclaw",
  "hermes",
  "external-memory",
]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseKind(value: unknown): MemoryRecordKind | undefined {
  return typeof value === "string" && KINDS.has(value as MemoryRecordKind) ? value as MemoryRecordKind : undefined;
}

function parseAuthority(value: unknown): MemoryAuthority | undefined {
  return typeof value === "string" && AUTHORITIES.has(value as MemoryAuthority) ? value as MemoryAuthority : undefined;
}

function parseKindList(value: string | null): MemoryRecordKind[] | undefined {
  if (!value) return undefined;
  const kinds = value.split(",").map((item) => parseKind(item)).filter((item): item is MemoryRecordKind => Boolean(item));
  return kinds.length > 0 ? kinds : undefined;
}

function parseAuthorityList(value: string | null): MemoryAuthority[] | undefined {
  if (!value) return undefined;
  const authorities = value.split(",").map((item) => parseAuthority(item)).filter((item): item is MemoryAuthority => Boolean(item));
  return authorities.length > 0 ? authorities : undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function parseSource(value: unknown): MemorySource | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Partial<MemorySource>;
  if (typeof source.type !== "string" || !SOURCE_TYPES.has(source.type as MemorySource["type"])) return undefined;
  return {
    type: source.type as MemorySource["type"],
    id: stringValue(source.id),
    path: stringValue(source.path),
    url: stringValue(source.url),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(request: NextRequest) {
  const runtime = createSalesRuntime();
  const project = request.nextUrl.searchParams.get("project") || "farreach";
  const query = request.nextUrl.searchParams.get("query") || "";
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "10")));
  const mode = request.nextUrl.searchParams.get("mode") || "search";
  const input = {
    workspaceId: project,
    query,
    customerId: request.nextUrl.searchParams.get("customerId") || undefined,
    customerName: request.nextUrl.searchParams.get("customerName") || undefined,
    kinds: parseKindList(request.nextUrl.searchParams.get("kinds")),
    authorities: parseAuthorityList(request.nextUrl.searchParams.get("authorities")),
    limit,
  };

  if (mode === "timeline") {
    return NextResponse.json({ success: true, data: runtime.getMemoryTimeline(input) });
  }

  if (mode === "customer-context") {
    return NextResponse.json({ success: true, data: runtime.getCustomerMemoryContext(input) });
  }

  return NextResponse.json({ success: true, data: runtime.searchMemory(input) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const project = stringValue(body.workspaceId) || request.nextUrl.searchParams.get("project") || "farreach";
    const title = stringValue(body.title);
    const bodyText = stringValue(body.body);
    if (!title || !bodyText) {
      return NextResponse.json({ success: false, error: "Memory title and body are required" }, { status: 400 });
    }

    const runtime = createSalesRuntime();
    const record = runtime.writeMemory({
      workspaceId: project,
      kind: parseKind(body.kind),
      customerId: stringValue(body.customerId),
      customerName: stringValue(body.customerName),
      subject: stringValue(body.subject),
      title,
      body: bodyText,
      tags: parseStringList(body.tags),
      source: parseSource(body.source),
      authority: parseAuthority(body.authority),
      confidence: typeof body.confidence === "number" ? body.confidence : undefined,
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : undefined,
      idempotencyKey: stringValue(body.idempotencyKey),
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  createSalesRuntime,
  type CustomerMemoryContext,
  type MemoryAuthority,
  type MemoryHit,
  type MemoryRecord,
  type MemoryRecordKind,
  type MemorySource,
  type MemoryTimelineSummary,
} from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/workspace-access";

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

type PublicMemoryRecord = Omit<MemoryRecord, "workspaceId" | "customerId" | "source" | "metadata" | "idempotencyKey">;
type PublicMemoryHit = PublicMemoryRecord & Pick<MemoryHit, "score" | "matchedTerms" | "reason">;
type PublicMemoryTimeline = Omit<MemoryTimelineSummary, "workspaceId" | "customerId" | "recentRecords"> & {
  recentRecords: PublicMemoryRecord[];
};
type PublicCustomerMemoryContext = Omit<CustomerMemoryContext, "workspaceId" | "customerId" | "facts" | "episodes" | "timeline" | "retrieval"> & {
  facts: PublicMemoryHit[];
  episodes: PublicMemoryHit[];
  timeline: PublicMemoryTimeline;
};

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

function cleanPublicText(value: string): string {
  return value
    .replace(/\/Users\/[^\s"'`]+/g, "the local runtime")
    .replace(/\.ssa\/[^\s"'`]+/g, "the local runtime");
}

function cleanPublicList(values: string[]): string[] {
  return values.map(cleanPublicText);
}

function publicMemoryRecord(record: MemoryRecord): PublicMemoryRecord {
  const {
    workspaceId: _workspaceId,
    customerId: _customerId,
    source: _source,
    metadata: _metadata,
    idempotencyKey: _idempotencyKey,
    ...rest
  } = record;

  return {
    ...rest,
    customerName: rest.customerName ? cleanPublicText(rest.customerName) : undefined,
    subject: rest.subject ? cleanPublicText(rest.subject) : undefined,
    title: cleanPublicText(rest.title),
    body: cleanPublicText(rest.body),
    tags: cleanPublicList(rest.tags),
  };
}

function publicMemoryHit(hit: MemoryHit): PublicMemoryHit {
  return {
    ...publicMemoryRecord(hit),
    score: hit.score,
    matchedTerms: cleanPublicList(hit.matchedTerms),
    reason: cleanPublicText(hit.reason),
  };
}

function publicMemoryTimeline(timeline: MemoryTimelineSummary): PublicMemoryTimeline {
  const {
    workspaceId: _workspaceId,
    customerId: _customerId,
    recentRecords,
    ...rest
  } = timeline;

  return {
    ...rest,
    query: cleanPublicText(rest.query),
    customerName: rest.customerName ? cleanPublicText(rest.customerName) : undefined,
    summary: cleanPublicText(rest.summary),
    openRisks: cleanPublicList(rest.openRisks),
    recommendedNextSteps: cleanPublicList(rest.recommendedNextSteps),
    recentRecords: recentRecords.map(publicMemoryRecord),
  };
}

function publicCustomerMemoryContext(context: CustomerMemoryContext): PublicCustomerMemoryContext {
  const {
    workspaceId: _workspaceId,
    customerId: _customerId,
    facts,
    episodes,
    timeline,
    retrieval: _retrieval,
    ...rest
  } = context;

  return {
    ...rest,
    query: cleanPublicText(rest.query),
    customerName: rest.customerName ? cleanPublicText(rest.customerName) : undefined,
    facts: facts.map(publicMemoryHit),
    episodes: episodes.map(publicMemoryHit),
    timeline: publicMemoryTimeline(timeline),
  };
}

export async function GET(request: NextRequest) {
  const runtime = createSalesRuntime();
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;
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
    return NextResponse.json({ success: true, data: publicMemoryTimeline(runtime.getMemoryTimeline(input)) });
  }

  if (mode === "customer-context") {
    return NextResponse.json({ success: true, data: publicCustomerMemoryContext(runtime.getCustomerMemoryContext(input)) });
  }

  return NextResponse.json({ success: true, data: runtime.searchMemory(input).map(publicMemoryHit) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const auth = requireResolvedWorkspaceAccess(request, body);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;
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

    return NextResponse.json({ success: true, data: publicMemoryRecord(record) });
  } catch (error) {
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 500 });
  }
}

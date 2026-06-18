import { NextRequest, NextResponse } from "next/server";
import type { QuickQuoteData, QuickQuoteLine } from "@/lib/quick-quote";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

interface ModifyQuickQuoteBody {
  quote?: QuickQuoteData;
  message?: string;
}

interface QuickQuotePatch {
  customer?: string;
  contact?: string;
  email?: string;
  country?: string;
  currency?: string;
  incoterms?: string;
  paymentTerms?: string;
  leadTime?: string;
  validUntil?: string;
  notes?: string;
  charges?: Partial<QuickQuoteData["charges"]>;
  lines?: Array<Partial<QuickQuoteLine> & { id?: string }>;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseLlmPatch(text: string): { patch: QuickQuotePatch; reply?: string } | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const candidate = parsed.quotePatch || parsed.patch || parsed.updatedQuote;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return {
    patch: candidate as QuickQuotePatch,
    reply: stringValue(parsed.reply),
  };
}

function firstCapture(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function inferLocalPatch(message: string, quote: QuickQuoteData): QuickQuotePatch {
  const patch: QuickQuotePatch = {};
  const lower = message.toLowerCase();

  const margin = numberValue(firstCapture(message, [
    /(?:利润率|毛利率|margin|profit margin)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%?/i,
    /(\d+(?:\.\d+)?)\s*%[^\n]*(?:利润率|毛利率|margin|profit margin)/i,
  ]));
  if (margin !== undefined) {
    patch.lines = quote.lines.map((line) => ({ id: line.id, marginPercent: margin }));
  }

  const quantity = numberValue(firstCapture(message, [
    /(?:数量|qty|quantity)[^\d]{0,20}(\d+(?:\.\d+)?)/i,
  ]));
  if (quantity !== undefined && quote.lines[0]) {
    patch.lines = [{ ...(patch.lines?.[0] || {}), id: quote.lines[0].id, quantity }];
  }

  const freight = numberValue(firstCapture(message, [/(?:运费|freight)[^\d]{0,20}(\d+(?:\.\d+)?)/i]));
  const packing = numberValue(firstCapture(message, [/(?:包装|杂费|packing)[^\d]{0,20}(\d+(?:\.\d+)?)/i]));
  const discount = numberValue(firstCapture(message, [/(?:折扣|discount)[^\d]{0,20}(\d+(?:\.\d+)?)/i]));
  if (freight !== undefined || packing !== undefined || discount !== undefined) {
    patch.charges = {};
    if (freight !== undefined) patch.charges.freight = freight;
    if (packing !== undefined) patch.charges.packing = packing;
    if (discount !== undefined) patch.charges.discount = discount;
  }

  const notes = firstCapture(message, [
    /(?:备注|note|notes)(?:写|改成|设为|加上|to|as|:|：)\s*["“]?([^"”\n。]+)/i,
  ]);
  if (notes) patch.notes = notes;

  const paymentTerms = firstCapture(message, [
    /(?:付款条款|payment terms?)(?:改成|设为|to|:|：)\s*["“]?([^"”\n。]+)/i,
  ]);
  if (paymentTerms) patch.paymentTerms = paymentTerms;

  const leadTime = firstCapture(message, [
    /(?:交期|lead time)(?:改成|设为|to|:|：)\s*["“]?([^"”\n。]+)/i,
  ]);
  if (leadTime) patch.leadTime = leadTime;

  const incoterms = ["FOB Shenzhen", "EXW", "CIF", "DAP", "DDP"].find((term) => lower.includes(term.toLowerCase()));
  if (incoterms) patch.incoterms = incoterms;

  return patch;
}

function applyLinePatch(line: QuickQuoteLine, patch: Partial<QuickQuoteLine>): QuickQuoteLine {
  return {
    ...line,
    description: stringValue(patch.description) ?? line.description,
    specification: stringValue(patch.specification) ?? line.specification,
    supplier: stringValue(patch.supplier) ?? line.supplier,
    quantity: numberValue(patch.quantity) ?? line.quantity,
    unitCost: numberValue(patch.unitCost) ?? line.unitCost,
    marginPercent: numberValue(patch.marginPercent) ?? line.marginPercent,
  };
}

function applyPatch(quote: QuickQuoteData, patch: QuickQuotePatch): QuickQuoteData {
  const linePatches = patch.lines || [];
  return {
    ...quote,
    customer: stringValue(patch.customer) ?? quote.customer,
    contact: stringValue(patch.contact) ?? quote.contact,
    email: stringValue(patch.email) ?? quote.email,
    country: stringValue(patch.country) ?? quote.country,
    currency: stringValue(patch.currency) ?? quote.currency,
    incoterms: stringValue(patch.incoterms) ?? quote.incoterms,
    paymentTerms: stringValue(patch.paymentTerms) ?? quote.paymentTerms,
    leadTime: stringValue(patch.leadTime) ?? quote.leadTime,
    validUntil: stringValue(patch.validUntil) ?? quote.validUntil,
    notes: stringValue(patch.notes) ?? quote.notes,
    charges: {
      freight: numberValue(patch.charges?.freight) ?? quote.charges.freight,
      packing: numberValue(patch.charges?.packing) ?? quote.charges.packing,
      discount: numberValue(patch.charges?.discount) ?? quote.charges.discount,
    },
    lines: quote.lines.map((line, index) => {
      const matchingPatch = linePatches.find((item) => item.id === line.id) || (!linePatches.some((item) => item.id) ? linePatches[index] : undefined);
      return matchingPatch ? applyLinePatch(line, matchingPatch) : line;
    }),
  };
}

function hasPatch(patch: QuickQuotePatch): boolean {
  return Boolean(
    patch.customer || patch.contact || patch.email || patch.country || patch.currency || patch.incoterms ||
    patch.paymentTerms || patch.leadTime || patch.validUntil || patch.notes || patch.charges ||
    (patch.lines && patch.lines.length > 0)
  );
}

function buildPrompt(quote: QuickQuoteData, message: string) {
  return [
    "You are Jaden inside JadenOS quick quote.",
    "Update the current quick quote according to the user's instruction.",
    "Return JSON only with this shape:",
    "{\"reply\":\"short user-facing summary\",\"quotePatch\":{\"customer\":\"\",\"contact\":\"\",\"email\":\"\",\"country\":\"\",\"currency\":\"USD\",\"incoterms\":\"\",\"paymentTerms\":\"\",\"leadTime\":\"\",\"validUntil\":\"\",\"notes\":\"\",\"charges\":{\"freight\":0,\"packing\":0,\"discount\":0},\"lines\":[{\"id\":\"line-1\",\"description\":\"\",\"specification\":\"\",\"quantity\":0,\"unitCost\":0,\"supplier\":\"\",\"marginPercent\":25}]}}",
    "Only include fields that should change. Do not export files. Do not send anything to customers. Do not change unitCost or supplier unless the user explicitly asks.",
    `User instruction: ${message}`,
    `Current quote: ${JSON.stringify(quote)}`,
  ].join("\n");
}

function patchSummary(patch: QuickQuotePatch, source: "llm" | "local") {
  const changes: string[] = [];
  const margin = patch.lines?.find((line) => line.marginPercent !== undefined)?.marginPercent;
  const quantity = patch.lines?.find((line) => line.quantity !== undefined)?.quantity;
  if (margin !== undefined) changes.push(`margin ${margin}%`);
  if (quantity !== undefined) changes.push(`quantity ${quantity}`);
  if (patch.charges) changes.push("charges");
  if (patch.notes) changes.push("notes");
  if (patch.paymentTerms) changes.push("payment terms");
  if (patch.leadTime) changes.push("lead time");
  if (patch.incoterms) changes.push("incoterms");
  return `Jaden ${source === "llm" ? "applied" : "parsed"} ${changes.length ? changes.join(", ") : "the requested quote changes"}.`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireResolvedWorkspaceAccess(request);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

    const body: ModifyQuickQuoteBody = await request.json();
    const message = stringValue(body.message);
    if (!body.quote || !message) {
      return NextResponse.json({ success: false, error: "Missing quick quote data or modification request" }, { status: 400 });
    }

    const runtime = createSalesRuntime();
    const llm = await runtime.runLlm({
      workspaceId: project,
      task: "extract",
      input: buildPrompt(body.quote, message),
      context: { feature: "quick_quote_modify", quote: body.quote },
    });
    const llmPatch = llm.source === "provider" ? parseLlmPatch(llm.text) : null;
    const localPatch = inferLocalPatch(message, body.quote);
    const patch = llmPatch && hasPatch(llmPatch.patch) ? llmPatch.patch : localPatch;
    const source: "llm" | "local" = llmPatch && hasPatch(llmPatch.patch) ? "llm" : "local";

    if (!hasPatch(patch)) {
      return NextResponse.json({
        success: false,
        error: "Jaden could not identify a safe quote change. Please ask for a specific change such as margin, quantity, freight, payment terms, lead time, or notes.",
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      source,
      reply: llmPatch?.reply || patchSummary(patch, source),
      updatedQuote: applyPatch(body.quote, patch),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to modify quick quote" },
      { status: 500 }
    );
  }
}

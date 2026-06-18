import { NextRequest, NextResponse } from "next/server";
import { buildQuickQuoteReference } from "@/lib/quick-quote-reference";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { findPriceReferences } from "@/lib/runtime/price-memory";

export const dynamic = "force-dynamic";

interface ExchangeRateReference {
  status: "available" | "unavailable";
  base: "USD";
  quoteCurrency: string;
  rates: Record<string, number>;
  provider: string;
  updatedAt: string;
  error?: string;
}

type PublicExchangeRateReference = Omit<ExchangeRateReference, "provider" | "error">;

const RATE_CURRENCIES = ["CNY", "EUR", "GBP"] as const;
const RATE_CACHE_TTL_MS = 30 * 60 * 1000;
const REFERENCE_SCOPES = ["all", "customers", "prices", "exchange"] as const;

let exchangeRateCache: { expiresAt: number; value: ExchangeRateReference } | null = null;

type ReferenceScope = typeof REFERENCE_SCOPES[number];

function parseProducts(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseScope(value: string | null): ReferenceScope {
  return REFERENCE_SCOPES.includes(value as ReferenceScope) ? value as ReferenceScope : "all";
}

async function getExchangeRateReference(currency: string): Promise<ExchangeRateReference> {
  const quoteCurrency = currency.trim().toUpperCase() || "USD";
  if (exchangeRateCache && exchangeRateCache.expiresAt > Date.now()) {
    return {
      ...exchangeRateCache.value,
      quoteCurrency,
    };
  }

  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?from=USD&to=${RATE_CURRENCIES.join(",")}`, {
      cache: "no-store",
      headers: { "user-agent": "JadenOS-QuickQuote/1.0" },
    });
    if (!response.ok) throw new Error(`provider returned ${response.status}`);
    const json = await response.json() as { date?: string; rates?: Record<string, number> };
    const value: ExchangeRateReference = {
      status: "available",
      base: "USD",
      quoteCurrency,
      rates: { USD: 1, ...(json.rates || {}) },
      provider: "Frankfurter",
      updatedAt: json.date || new Date().toISOString(),
    };
    exchangeRateCache = { expiresAt: Date.now() + RATE_CACHE_TTL_MS, value };
    return value;
  } catch (error) {
    return {
      status: "unavailable",
      base: "USD",
      quoteCurrency,
      rates: { USD: 1 },
      provider: "Frankfurter",
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Exchange rate unavailable",
    };
  }
}

function publicExchangeRateReference(rate: ExchangeRateReference | null): PublicExchangeRateReference | null {
  if (!rate) return null;
  const { provider: _provider, error: _error, ...publicRate } = rate;
  return publicRate;
}

export async function GET(request: NextRequest) {
  const auth = requireResolvedWorkspaceAccess(request);
  if (!auth.ok) return auth.response;
  const project = auth.workspaceId;

  const customer = request.nextUrl.searchParams.get("customer") || "";
  const products = parseProducts(request.nextUrl.searchParams.get("products") || "");
  const currency = request.nextUrl.searchParams.get("currency") || "USD";
  const scope = parseScope(request.nextUrl.searchParams.get("scope"));
  const runtime = createSalesRuntime();
  const shouldLoadCustomers = scope === "all" || scope === "customers";
  const shouldLoadPrices = scope === "all" || scope === "prices";
  const shouldLoadExchange = scope === "all" || scope === "exchange";
  const [leadResult, quotationResult, piResult, priceReferences, exchangeRate] = await Promise.all([
    shouldLoadCustomers
      ? Promise.resolve(runtime.memory.getLeads(project, { search: customer, page: 1, pageSize: 30 }))
      : Promise.resolve({ data: [] }),
    shouldLoadCustomers
      ? Promise.resolve(runtime.memory.getQuotations(project, { search: customer, page: 1, pageSize: 20 }))
      : Promise.resolve({ quotations: [] }),
    shouldLoadCustomers
      ? Promise.resolve(runtime.listPiRecords(project, customer))
      : Promise.resolve({ records: [] }),
    shouldLoadPrices
      ? Promise.resolve(findPriceReferences(project, { customer, products }))
      : Promise.resolve({ customerPriceReferences: [], similarProductReferences: [] }),
    shouldLoadExchange ? getExchangeRateReference(currency) : Promise.resolve(null),
  ]);

  const reference = buildQuickQuoteReference({
    query: customer,
    products,
    leads: leadResult.data || [],
    quotations: quotationResult.quotations,
    piRecords: piResult.records,
  });

  return NextResponse.json({
    success: true,
    data: {
      ...reference,
      ...priceReferences,
      exchangeRate: publicExchangeRateReference(exchangeRate),
    },
  });
}

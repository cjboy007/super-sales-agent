import type { Lead } from "./leads";
import type { Quotation } from "./quotations";
import type { PiRecord } from "./runtime/documents";

export interface CustomerSuggestion {
  name: string;
  contact: string;
  email: string;
  country: string;
  source: "lead" | "pi" | "quotation";
  score: number;
  lastActivity?: string;
}

export interface PriceReference {
  kind: "customer" | "similar";
  customer: string;
  product: string;
  unitPrice: number;
  unitCost: number;
  costCurrency: string;
  supplier: string;
  supplierCandidates: string[];
  currency: string;
  quantity: number;
  date: string;
  source: string;
  confidence: number;
}

export interface QuickQuoteReferenceInput {
  query: string;
  products: string[];
  leads: Lead[];
  quotations: Quotation[];
  piRecords: PiRecord[];
}

export interface QuickQuoteReferenceResult {
  customerSuggestions: CustomerSuggestion[];
  customerPriceReferences: PriceReference[];
  similarProductReferences: PriceReference[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").trim();
}

function compact(value: string): string {
  return normalize(value).replace(/\s+/g, "");
}

function tokenize(value: string): string[] {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2);
}

function textScore(candidate: string, query: string): number {
  const normalizedCandidate = normalize(candidate);
  const normalizedQuery = normalize(query);
  if (!normalizedCandidate || !normalizedQuery) return 0;
  if (normalizedCandidate === normalizedQuery) return 100;
  if (normalizedCandidate.includes(normalizedQuery)) return 84;
  if (compact(normalizedCandidate).includes(compact(normalizedQuery))) return 78;

  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((token) => normalizedCandidate.includes(token)).length;
  return matched === 0 ? 0 : Math.round((matched / queryTokens.length) * 62);
}

function upsertSuggestion(map: Map<string, CustomerSuggestion>, suggestion: CustomerSuggestion): void {
  const key = compact(suggestion.name || suggestion.email);
  if (!key) return;
  const current = map.get(key);
  if (!current || suggestion.score > current.score) map.set(key, suggestion);
}

export function buildQuickQuoteReference(input: QuickQuoteReferenceInput): QuickQuoteReferenceResult {
  const query = input.query.trim();
  const suggestions = new Map<string, CustomerSuggestion>();

  if (query) {
    for (const lead of input.leads) {
      const score = Math.max(
        textScore(lead.companyName, query),
        textScore(lead.contact, query),
        textScore(lead.email, query),
        textScore(lead.homepage, query)
      );
      if (score <= 0) continue;
      upsertSuggestion(suggestions, {
        name: lead.companyName || lead.email,
        contact: lead.contact,
        email: lead.email,
        country: lead.country,
        source: "lead",
        score,
      });
    }

    for (const record of input.piRecords) {
      const score = Math.max(textScore(record.customer, query), textScore(record.piNo, query));
      if (score <= 0) continue;
      upsertSuggestion(suggestions, {
        name: record.customer,
        contact: record.data.customer.contact,
        email: record.data.customer.email,
        country: record.data.customer.country,
        source: "pi",
        score: score - 4,
        lastActivity: record.date,
      });
    }

    for (const quote of input.quotations) {
      const score = Math.max(textScore(quote.customer, query), textScore(quote.id, query), textScore(quote.mainProducts, query));
      if (score <= 0) continue;
      upsertSuggestion(suggestions, {
        name: quote.customer,
        contact: "",
        email: "",
        country: "",
        source: "quotation",
        score: score - 8,
        lastActivity: quote.date,
      });
    }
  }

  return {
    customerSuggestions: Array.from(suggestions.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 6),
    customerPriceReferences: [],
    similarProductReferences: [],
  };
}

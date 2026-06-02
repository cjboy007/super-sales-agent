import fs from "fs";
import { ensureSsaCompanyDataPath } from "../ssa-data-paths";
import type { TradeDocumentData } from "./documents";

export interface PriceMemoryRecord {
  id: string;
  workspaceId: string;
  customer: string;
  contact: string;
  email: string;
  country: string;
  product: string;
  specification: string;
  model: string;
  hsCode: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  costCurrency: string;
  supplier: string;
  supplierCandidates: string[];
  currency: string;
  piNo: string;
  date: string;
  incoterms: string;
  source: string;
  updatedAt: string;
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

export interface PriceReferenceResult {
  customerPriceReferences: PriceReference[];
  similarProductReferences: PriceReference[];
}

interface PriceMemoryCacheEntry {
  mtimeMs: number;
  size: number;
  rows: PriceMemoryRecord[];
}

const SAME_CUSTOMER_SCORE_THRESHOLD = 72;
const priceMemoryCache = new Map<string, PriceMemoryCacheEntry>();

function priceMemoryPath(workspaceId: string) {
  return ensureSsaCompanyDataPath(workspaceId, "pricing", "price-memory.json");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2);
}

function textScore(candidate: string, query: string): number {
  const candidateText = normalize(candidate);
  const queryText = normalize(query);
  if (!candidateText || !queryText) return 0;
  if (candidateText === queryText) return 100;
  if (candidateText.includes(queryText)) return 84;
  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((token) => candidateText.includes(token)).length;
  return matched === 0 ? 0 : Math.round((matched / queryTokens.length) * 64);
}

function productScore(record: PriceMemoryRecord, products: string[]): number {
  const haystack = [record.product, record.specification, record.model, record.hsCode].filter(Boolean).join(" ");
  return Math.max(0, ...products.map((product) => textScore(haystack, product)));
}

function productLabel(record: PriceMemoryRecord): string {
  return [record.product, record.specification].filter(Boolean).join(" / ") || record.model || "Product";
}

function normalizeSupplierCandidates(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5);
  }
  if (typeof value === "string") {
    return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  }
  return [];
}

function recordId(piNo: string, index: number, product: TradeDocumentData["products"][number]): string {
  const productKey = normalize([product.description, product.specification, product.hs_code].filter(Boolean).join(" "))
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return [piNo, index, productKey || "product"].join(":");
}

function toRecord(workspaceId: string, data: TradeDocumentData, source: string, index: number): PriceMemoryRecord | null {
  const product = data.products[index];
  if (!product || !data.pi_info.pi_no.trim()) return null;
  const unitPrice = Number(product.unit_price) || 0;
  if (unitPrice <= 0) return null;
  const piNo = data.pi_info.pi_no.trim();
  const productWithInternal = product as TradeDocumentData["products"][number] & {
    model?: string;
    sku?: string;
    unit_cost?: number;
    cost_currency?: string;
    supplier?: string;
    supplier_candidates?: string[] | string;
  };
  const model = String(productWithInternal.model || productWithInternal.sku || product.specification || "");
  const supplier = String(productWithInternal.supplier || "").trim();
  const supplierCandidates = normalizeSupplierCandidates(productWithInternal.supplier_candidates);
  return {
    id: recordId(piNo, index, product),
    workspaceId,
    customer: data.customer.company_name || data.customer.email || "Unknown customer",
    contact: data.customer.contact || "",
    email: data.customer.email || "",
    country: data.customer.country || "",
    product: product.description || "",
    specification: product.specification || "",
    model,
    hsCode: product.hs_code || "",
    quantity: Math.max(0, Number(product.quantity) || 0),
    unitPrice,
    unitCost: Math.max(0, Number(productWithInternal.unit_cost) || 0),
    costCurrency: productWithInternal.cost_currency || data.currency || "USD",
    supplier,
    supplierCandidates,
    currency: data.currency || "USD",
    piNo,
    date: data.shipment.date || data.ci_info.ci_date || new Date().toISOString().slice(0, 10),
    incoterms: data.shipment.incoterms || "",
    source,
    updatedAt: new Date().toISOString(),
  };
}

export function listPriceMemory(workspaceId: string): PriceMemoryRecord[] {
  const filePath = priceMemoryPath(workspaceId);
  if (!fs.existsSync(filePath)) return [];

  try {
    const stats = fs.statSync(filePath);
    const cached = priceMemoryCache.get(filePath);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.rows.slice();

    const rows = (JSON.parse(fs.readFileSync(filePath, "utf-8")) as PriceMemoryRecord[])
      .filter((record) => record && typeof record.id === "string")
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    priceMemoryCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, rows });
    return rows.slice();
  } catch {
    return [];
  }
}

export function recordPiPrices(workspaceId: string, data: TradeDocumentData, source = "documents.generate"): PriceMemoryRecord[] {
  const filePath = priceMemoryPath(workspaceId);
  const current = listPriceMemory(workspaceId);
  const nextRecords = data.products
    .map((_product, index) => toRecord(workspaceId, data, source, index))
    .filter((record): record is PriceMemoryRecord => Boolean(record));
  const byId = new Map<string, PriceMemoryRecord>();
  for (const record of current) byId.set(record.id, record);
  for (const record of nextRecords) byId.set(record.id, record);
  const next = Array.from(byId.values())
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5000);
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
  priceMemoryCache.delete(filePath);
  return nextRecords;
}

export function findPriceReferences(
  workspaceId: string,
  input: { customer: string; products: string[] }
): PriceReferenceResult {
  const products = input.products.map((product) => product.trim()).filter(Boolean);
  if (products.length === 0) return { customerPriceReferences: [], similarProductReferences: [] };

  const references = listPriceMemory(workspaceId)
    .map((record) => {
      const productMatch = productScore(record, products);
      if (productMatch <= 0) return null;
      const sameCustomer = textScore(record.customer, input.customer) >= SAME_CUSTOMER_SCORE_THRESHOLD;
      return {
        kind: sameCustomer ? "customer" : "similar",
        customer: record.customer,
        product: productLabel(record),
        unitPrice: record.unitPrice,
        unitCost: record.unitCost || 0,
        costCurrency: record.costCurrency || record.currency,
        supplier: record.supplier || "",
        supplierCandidates: record.supplierCandidates || [],
        currency: record.currency,
        quantity: record.quantity,
        date: record.date,
        source: record.piNo,
        confidence: sameCustomer ? Math.max(72, productMatch) : productMatch,
      } satisfies PriceReference;
    })
    .filter((record): record is PriceReference => Boolean(record));

  return {
    customerPriceReferences: references
      .filter((reference) => reference.kind === "customer")
      .sort((a, b) => b.confidence - a.confidence || b.date.localeCompare(a.date))
      .slice(0, 5),
    similarProductReferences: references
      .filter((reference) => reference.kind === "similar")
      .sort((a, b) => b.confidence - a.confidence || b.date.localeCompare(a.date))
      .slice(0, 5),
  };
}

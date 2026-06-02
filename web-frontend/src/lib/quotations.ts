import fs from "fs";
import path from "path";
import { repoPath, ssaCompanyDataPath } from "./ssa-data-paths";
import { listFileManifest } from "./runtime/file-manifest";
import type { FileManifestRecord } from "./runtime/file-manifest";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Quotation {
  id: string;
  type: "QT" | "PI" | "SPL";
  customer: string;
  amount: string;
  status: "Draft" | "Sent" | "Confirmed" | "Expired";
  date: string;
  filePath: string;
  fileName: string;
  fileType: string;
  mainProducts: string;
  files: QuotationFileLink[];
}

export interface QuotationFileLink {
  format: "pdf" | "excel";
  path: string;
  fileName: string;
  fileType: string;
}

export interface QuotationListResult {
  quotations: Quotation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QuotationStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  totalAmount: string;
}

// ─── Scan paths ────────────────────────────────────────────────────────────

const SCAN_PATHS = [
  ssaCompanyDataPath("farreach", "quotations"),
  ssaCompanyDataPath("farreach", "documents"),
  repoPath("skills", "quotation-workflow", "examples"),
  repoPath("skills", "quotation-workflow", "tests", "output"),
  repoPath("skills", "sample-workflow", "examples"),
  repoPath("skills", "pi-workflow", "examples"),
];

const FILE_EXTENSIONS = [".pdf", ".xlsx", ".xls", ".html"];

interface QuotationMetadata {
  amount?: string;
  amountValue?: number;
  currency?: string;
  customer?: string;
  mainProducts?: string;
  status?: Quotation["status"];
}

// ─── File scanning ─────────────────────────────────────────────────────────

function scanFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden dirs and node_modules
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          scanFiles(fullPath, results);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (FILE_EXTENSIONS.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Skip inaccessible dirs
  }
  return results;
}

// ─── Filename parsing ──────────────────────────────────────────────────────

function displayBaseName(filename: string): string {
  return path.basename(filename, path.extname(filename)).replace(/[-_](Excel|Final|HTML)$/i, "");
}

function parseFilename(filename: string): Partial<Quotation> {
  const base = displayBaseName(filename);

  // Quotation page only lists quote files, sample orders, and bulk PI files.
  const match = base.match(/^(QT|PI|SPL)-(\d{8})(?:[-_](.+))?$/);
  if (match) {
    const type = match[1] as Quotation["type"];
    const dateStr = match[2];
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const date = `${year}-${month}-${day}`;

    // Extract customer from remaining parts
    const remaining = match[3] || "";
    const customer =
      remaining.replace(/^[-_]/, "").replace(/[-_]/g, " ") || "未知客户";

    return { id: base, type, date, customer };
  }

  // Pattern: digital-horizon-sample-SPL-20260328-001
  const splMatch = base.match(/SPL-(\d{8})-(\d+)/);
  if (splMatch) {
    const dateStr = splMatch[1];
    const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    const customerPart = base.slice(0, base.indexOf("SPL")).replace(/[-_]/g, " ").trim();
    return {
      id: base,
      type: "SPL",
      date,
      customer: customerPart || "未知客户",
    };
  }

  // Pattern: test-quotation
  if (base.includes("quotation") || base.includes("test")) {
    return {
      id: base,
      type: "QT",
      date: new Date().toISOString().split("T")[0],
      customer: base.replace(/[-_]/g, " ").replace(/test/g, "").trim() || "测试客户",
    };
  }

  if (/sample[-_\s]?order|sample/i.test(base)) {
    return {
      id: base,
      type: "SPL",
      date: "未知",
      customer: base.replace(/[-_]/g, " ").replace(/sample/gi, "").trim() || "未知",
    };
  }

  if (/bulk[-_\s]?pi|proforma[-_\s]?invoice/i.test(base)) {
    return {
      id: base,
      type: "PI",
      date: "未知",
      customer: base.replace(/[-_]/g, " ").replace(/bulk pi|proforma invoice/gi, "").trim() || "未知",
    };
  }

  return {
    id: base,
    date: "未知",
    customer: base.replace(/[-_]/g, " ").trim() || "未知",
  };
}

function companionJsonPaths(filePaths: string[], primaryPath: string): string[] {
  const candidates = new Set<string>();
  for (const filePath of [primaryPath, ...filePaths]) {
    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, ext);
    const cleanBase = displayBaseName(filePath);
    candidates.add(path.join(dir, `${base}.json`));
    candidates.add(path.join(dir, `${cleanBase}.json`));
    candidates.add(path.join(dir, "price-cost.json"));
    candidates.add(path.join(dir, "farreach_sample.json"));
  }
  return Array.from(candidates).filter((candidate) => fs.existsSync(candidate));
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatMoney(currency: string | undefined, amount: number): string {
  const resolvedCurrency = currency || "USD";
  return `${resolvedCurrency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseMoneyAmount(value: string): number {
  const match = value.match(/([\d,]+(?:\.\d{2})?)/);
  return match ? Number(match[1].replace(/,/g, "")) || 0 : 0;
}

function itemDescription(item: Record<string, unknown>): string {
  return stringField(item.description) || stringField(item.name) || stringField(item.specification);
}

function itemQuantity(item: Record<string, unknown>): number {
  return numberField(item.quantity) || numberField(item.qty);
}

function itemUnitPrice(item: Record<string, unknown>): number {
  return numberField(item.unit_price) || numberField(item.unitPrice);
}

function itemAmount(item: Record<string, unknown>): number {
  return numberField(item.amount) || itemQuantity(item) * itemUnitPrice(item);
}

function productsFromItems(items: unknown): string | undefined {
  if (!Array.isArray(items)) return undefined;
  const products: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const objectItem = asObject(item);
    if (!objectItem) continue;
    pushProduct(products, seen, itemDescription(objectItem));
  }
  return products.slice(0, 3).join(", ") || undefined;
}

function totalFromItems(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const objectItem = asObject(item);
    return objectItem ? sum + itemAmount(objectItem) : sum;
  }, 0);
}

function statusFromJson(value: unknown): Quotation["status"] | undefined {
  const status = stringField(value);
  if (/^(Draft|Sent|Confirmed|Expired)$/i.test(status)) {
    const normalized = status.toLowerCase();
    if (normalized === "draft") return "Draft";
    if (normalized === "sent") return "Sent";
    if (normalized === "confirmed") return "Confirmed";
    if (normalized === "expired") return "Expired";
  }
  return undefined;
}

function metadataFromJsonContent(content: string): QuotationMetadata | null {
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    const currency = stringField(data.currency) || "USD";
    const products = Array.isArray(data.products) ? data.products : data.items || data.lines;
    const explicitTotal =
      numberField(data.grandTotal) ||
      numberField(data.totalAmount) ||
      numberField(data.total) ||
      numberField(data.amount);
    const subtotal = totalFromItems(products);
    const freight = numberField(data.freight) || numberField(data.shipping && asObject(data.shipping)?.freight_amount);
    const tax = numberField(data.tax);
    const amountValue = explicitTotal || subtotal + freight + tax || numberField(data.totalProfit) + numberField(data.totalCost);
    const customerObject = asObject(data.customer);
    const customer =
      stringField(data.customer) ||
      stringField(customerObject?.company_name) ||
      stringField(customerObject?.name);
    return {
      amount: amountValue ? formatMoney(currency, amountValue) : undefined,
      amountValue: amountValue || undefined,
      currency,
      customer: customer || undefined,
      mainProducts: productsFromItems(products),
      status: statusFromJson(data.status),
    };
  } catch {
    return null;
  }
}

function readJsonMetadata(filePaths: string[], primaryPath: string): QuotationMetadata | null {
  for (const jsonPath of companionJsonPaths(filePaths, primaryPath)) {
    const metadata = metadataFromJsonContent(fs.readFileSync(jsonPath, "utf-8"));
    if (metadata) return metadata;
  }
  return null;
}

function detectStatus(file: Quotation): Quotation["status"] {
  const jsonMetadata = readJsonMetadata(file.files.map((item) => item.path), file.filePath);
  if (jsonMetadata?.status) return jsonMetadata.status;

  // Check HTML file content for <!-- STATUS: Draft|Sent|Confirmed|Expired -->
  const htmlPath = htmlPathFromGroup(file.files.map((item) => item.path), file.filePath);
  if (htmlPath) {
    try {
      const content = fs.readFileSync(htmlPath, "utf-8");
      const statusMatch = content.match(/<!--\s*STATUS:\s*(Draft|Sent|Confirmed|Expired)\s*-->/i);
      if (statusMatch) {
        return statusMatch[1] as Quotation["status"];
      }
    } catch { /* ignore */ }
  }

  // Simple heuristic based on file path
  if (file.filePath.includes("test") || file.filePath.includes("Test"))
    return "Draft";
  if (file.filePath.includes("example")) return "Sent";
  if (file.filePath.includes("output")) return "Sent";
  return "Draft";
}

function detectAmount(file: Quotation): string {
  const jsonMetadata = readJsonMetadata(file.files.map((item) => item.path), file.filePath);
  if (jsonMetadata?.amount) return jsonMetadata.amount;

  // Try to extract amount from HTML file content
  const htmlPath = htmlPathFromGroup(file.files.map((item) => item.path), file.filePath);
  if (htmlPath) {
    try {
      const content = fs.readFileSync(htmlPath, "utf-8");
      // Match patterns like "Total: $12,345.00" or "Total: $12,345"
      const text = htmlToText(content);
      const totalMatch =
        text.match(/Total(?:\s*\([^)]+\))?\s*(?:[:：])?\s*(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{2})?)/i) ||
        text.match(/Grand\s+Total\s*(?:[:：])?\s*(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{2})?)/i) ||
        text.match(/Subtotal\s*(?:[:：])?\s*(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{2})?)/i);
      if (totalMatch) return `USD ${totalMatch[1]}`;
    } catch { /* ignore */ }
  }

  // Cannot reliably extract amount without parsing the file content
  return "—";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductCandidate(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^(product|description|item|品名|产品|型号|规格)\s*[:：-]\s*/i, "")
    .trim()
    .slice(0, 90);
}

function isLikelyNonProduct(value: string): boolean {
  const text = value.toLowerCase();
  return (
    !value ||
    value.length < 4 ||
    /^\d+$/.test(value) ||
    /^\$?[\d,]+(?:\.\d+)?$/.test(value) ||
    /^(qty|quantity|unit price|amount|total|subtotal|date|customer|currency|quote no|quotation no)$/i.test(value) ||
    text.includes("payment:") ||
    text.includes("bank details")
  );
}

function pushProduct(products: string[], seen: Set<string>, value: string): void {
  const cleaned = cleanProductCandidate(value);
  if (isLikelyNonProduct(cleaned)) return;
  const key = cleaned.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  products.push(cleaned);
}

function extractProductsFromHtml(content: string): string {
  const products: string[] = [];
  const seen = new Set<string>();
  const rows = content.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  let productColumn = -1;

  for (const row of rows) {
    const cells = Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => htmlToText(match[1]));
    if (cells.length === 0) continue;

    const headerIndex = cells.findIndex((cell) =>
      /(product|description|item|品名|产品|型号)/i.test(cell)
    );
    if (/<th/i.test(row) && headerIndex >= 0) {
      productColumn = headerIndex;
      continue;
    }

    if (productColumn >= 0 && cells[productColumn]) {
      pushProduct(products, seen, cells[productColumn]);
      continue;
    }

    const descriptiveCell = cells.find((cell, index) => index > 0 && !isLikelyNonProduct(cell));
    if (descriptiveCell && /(cable|adapter|connector|converter|splitter|wire|pump|hdmi|usb|displayport|ethernet|cat\d|ul\d)/i.test(descriptiveCell)) {
      pushProduct(products, seen, descriptiveCell);
    }
  }

  return products.slice(0, 3).join(", ") || "—";
}

function companionHtmlPath(filePath: string): string | null {
  const ext = path.extname(filePath);
  if (ext.toLowerCase() === ".html") return filePath;

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ext);
  const cleanBase = base.replace(/[-_](Excel|Final|HTML)$/i, "");
  const candidates = [
    path.join(dir, `${base}.html`),
    path.join(dir, `${cleanBase}.html`),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function htmlPathFromGroup(filePaths: string[], primaryPath: string): string | null {
  return filePaths.find((filePath) => path.extname(filePath).toLowerCase() === ".html") || companionHtmlPath(primaryPath);
}

function detectMainProducts(file: Quotation): string {
  const jsonMetadata = readJsonMetadata(file.files.map((item) => item.path), file.filePath);
  if (jsonMetadata?.mainProducts) return jsonMetadata.mainProducts;

  const htmlPath = htmlPathFromGroup(file.files.map((item) => item.path), file.filePath);
  if (!htmlPath) return "—";

  try {
    return extractProductsFromHtml(fs.readFileSync(htmlPath, "utf-8"));
  } catch {
    return "—";
  }
}

function canonicalQuotationKey(filePath: string): string {
  return path.join(path.dirname(filePath), displayBaseName(filePath));
}

function pdfRank(filePath: string): number {
  const base = path.basename(filePath, path.extname(filePath));
  if (/[-_]Excel$/i.test(base)) return 99;
  if (/[-_]Final$/i.test(base)) return 1;
  if (/[-_]HTML$/i.test(base)) return 2;
  return 0;
}

function buildFileLinks(filePaths: string[]): QuotationFileLink[] {
  const links: QuotationFileLink[] = [];
  const pdfPath = filePaths
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".pdf")
    .filter((filePath) => pdfRank(filePath) < 99)
    .sort((a, b) => pdfRank(a) - pdfRank(b))[0];
  const excelPath = filePaths
    .filter((filePath) => [".xlsx", ".xls"].includes(path.extname(filePath).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))[0];

  if (pdfPath) {
    links.push({
      format: "pdf",
      path: pdfPath,
      fileName: path.basename(pdfPath),
      fileType: path.extname(pdfPath).toLowerCase().slice(1),
    });
  }
  if (excelPath) {
    links.push({
      format: "excel",
      path: excelPath,
      fileName: path.basename(excelPath),
      fileType: path.extname(excelPath).toLowerCase().slice(1),
    });
  }

  return links;
}

function hasDisplayFile(filePaths: string[]): boolean {
  return filePaths.some((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return ext === ".xlsx" || ext === ".xls" || (ext === ".pdf" && pdfRank(filePath) < 99);
  });
}

// ─── Cache ─────────────────────────────────────────────────────────────────

const CACHE_TTL = 30_000; // 30 seconds for file scanning
let cache: { data: Quotation[] | null; expires: number } = {
  data: null,
  expires: 0,
};

function getAllQuotations(): Quotation[] {
  const now = Date.now();
  if (cache.data && now < cache.expires) {
    return cache.data;
  }

  const manifestQuotations = quotationsFromManifest();
  if (manifestQuotations.length > 0) {
    cache.data = manifestQuotations;
    cache.expires = now + CACHE_TTL;
    return manifestQuotations;
  }

  const groupedFiles = new Map<string, string[]>();
  for (const filePath of SCAN_PATHS.flatMap((dir) => scanFiles(dir))) {
    const parsed = parseFilename(filePath);
    if (!parsed.type) continue;
    const key = canonicalQuotationKey(filePath);
    groupedFiles.set(key, [...(groupedFiles.get(key) || []), filePath]);
  }

  const quotations: Quotation[] = Array.from(groupedFiles.entries())
    .map(([key, filePaths]) => {
      const parsed = parseFilename(key);
      if (!parsed.type) return null;
      if (!hasDisplayFile(filePaths)) return null;
      const displayFiles = buildFileLinks(filePaths);
      const primaryPath = displayFiles[0]?.path || htmlPathFromGroup(filePaths, key) || filePaths[0];
      const jsonMetadata = readJsonMetadata(filePaths, primaryPath);
      const fileExt = path.extname(primaryPath).toLowerCase().slice(1);
      const file: Quotation = {
        id: parsed.id || path.basename(key),
        type: parsed.type,
        customer: jsonMetadata?.customer || parsed.customer || "未知",
        amount: "—",
        status: "Draft",
        date: parsed.date || "未知",
        filePath: primaryPath,
        fileName: path.basename(primaryPath),
        fileType: fileExt,
        mainProducts: "—",
        files: displayFiles,
      };
      file.status = detectStatus(file);
      file.amount = detectAmount(file);
      file.mainProducts = detectMainProducts(file);
      return file;
    })
    .filter((file): file is Quotation => Boolean(file))
    // Sort by date descending
    .sort((a, b) => {
      if (a.date === "未知") return 1;
      if (b.date === "未知") return -1;
      return b.date.localeCompare(a.date);
    });

  cache.data = quotations;
  cache.expires = now + CACHE_TTL;

  return quotations;
}

function quotationTypeFromManifest(kind: string): Quotation["type"] | null {
  if (kind === "quotation") return "QT";
  if (kind === "sample_order") return "SPL";
  if (kind === "PI") return "PI";
  return null;
}

function isQuotationManifestRecord(record: FileManifestRecord): record is FileManifestRecord & { kind: "quotation" | "sample_order" | "PI" } {
  return quotationTypeFromManifest(record.kind) !== null;
}

function quotationTypeFromSupportedManifest(kind: "quotation" | "sample_order" | "PI"): Quotation["type"] {
  if (kind === "quotation") return "QT";
  if (kind === "sample_order") return "SPL";
  return "PI";
}

function quotationsFromManifest(): Quotation[] {
  const records = listFileManifest("farreach")
    .filter(isQuotationManifestRecord);
  const byDocument = new Map<string, typeof records>();
  for (const record of records) {
    const key = record.documentNo;
    byDocument.set(key, [...(byDocument.get(key) || []), record]);
  }

  return Array.from(byDocument.entries())
    .map(([documentNo, group]) => {
      const primary = group.find((record) => record.format === "pdf") || group.find((record) => record.format === "xlsx" || record.format === "xls") || group[0];
      const type = quotationTypeFromSupportedManifest(primary.kind);
      const dateMatch = documentNo.match(/(20\d{6})/);
      const date = dateMatch ? `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}` : primary.updatedAt.slice(0, 10);
      const files = group
        .filter((record) => record.format === "pdf" || record.format === "xlsx" || record.format === "xls")
        .map((record): QuotationFileLink => ({
          format: record.format === "pdf" ? "pdf" : "excel",
          path: record.path,
          fileName: record.fileName,
          fileType: record.format,
        }));
      return {
        id: documentNo,
        type,
        customer: primary.customer,
        amount: primary.amount || "—",
        status: "Draft",
        date,
        filePath: primary.path,
        fileName: primary.fileName,
        fileType: primary.format,
        mainProducts: primary.mainProducts || "—",
        files,
      } satisfies Quotation;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Public API ────────────────────────────────────────────────────────────

export function getQuotations(params?: {
  search?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): QuotationListResult {
  const all = getAllQuotations();
  let filtered = all;

  // Search
  if (params?.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(
      (q2) =>
        q2.id.toLowerCase().includes(q) ||
        q2.customer.toLowerCase().includes(q) ||
        q2.fileName.toLowerCase().includes(q) ||
        q2.filePath.toLowerCase().includes(q) ||
        q2.files.some((file) => file.fileName.toLowerCase().includes(q) || file.path.toLowerCase().includes(q)) ||
        q2.mainProducts.toLowerCase().includes(q)
    );
  }

  // Type filter
  if (params?.type && params.type !== "All") {
    filtered = filtered.filter((q) => q.type === params.type);
  }

  // Status filter
  if (params?.status && params.status !== "All") {
    filtered = filtered.filter((q) => q.status === params.status);
  }

  const total = filtered.length;
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const quotations = filtered.slice(start, start + pageSize);

  return { quotations, total, page, pageSize, totalPages };
}

export function getQuotationStats(): QuotationStats {
  const all = getAllQuotations();
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const totalAmountValue = all.reduce((sum, quote) => sum + parseMoneyAmount(quote.amount), 0);

  for (const q of all) {
    byType[q.type] = (byType[q.type] || 0) + 1;
    byStatus[q.status] = (byStatus[q.status] || 0) + 1;
  }

  return {
    total: all.length,
    byType,
    byStatus,
    totalAmount: totalAmountValue ? formatMoney("USD", totalAmountValue) : "—",
  };
}

export function getQuotationTypes(): string[] {
  const all = getAllQuotations();
  return Array.from(new Set(all.map((q) => q.type))).sort();
}

export function invalidateQuotationCache(): void {
  cache.data = null;
  cache.expires = 0;
}

import fs from "fs";
import path from "path";
import { repoPath, ssaCompanyDataPath } from "./ssa-data-paths";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Quotation {
  id: string;
  type: "QT" | "PI" | "PN" | "SPL";
  customer: string;
  amount: string;
  status: "Draft" | "Sent" | "Confirmed" | "Expired";
  date: string;
  filePath: string;
  fileName: string;
  fileType: string;
  mainProducts: string;
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
];

const FILE_EXTENSIONS = [".pdf", ".xlsx", ".docx", ".html"];

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

function parseFilename(filename: string): Partial<Quotation> {
  const base = path.basename(filename, path.extname(filename));

  // Pattern: QT-20260325-E2E or QT-20260314-006 or PI-20260327-002
  // Pattern: SPL-20260328-001
  // Pattern: PN-20260327-002
  const match = base.match(/^(QT|PI|PN|SPL)-(\d{8})-(\d+)/);
  if (match) {
    const type = match[1] as Quotation["type"];
    const dateStr = match[2];
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const date = `${year}-${month}-${day}`;

    // Extract customer from remaining parts
    const remaining = base.slice(match[0].length);
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

  return {
    id: base,
    type: "QT",
    date: "未知",
    customer: base.replace(/[-_]/g, " ").trim() || "未知",
  };
}

function detectStatus(file: Quotation): Quotation["status"] {
  // Check HTML file content for <!-- STATUS: Draft|Sent|Confirmed|Expired -->
  const ext = path.extname(file.filePath).toLowerCase();
  if (ext === ".html") {
    try {
      const content = fs.readFileSync(file.filePath, "utf-8");
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
  // Try to extract amount from HTML file content
  const ext = path.extname(file.filePath).toLowerCase();
  if (ext === ".html") {
    try {
      const content = fs.readFileSync(file.filePath, "utf-8");
      // Match patterns like "Total: $12,345.00" or "Total: $12,345"
      const totalMatch = content.match(/Total:\s*\$([\d,]+(?:\.\d{2})?)/i);
      if (totalMatch) {
        return "$" + totalMatch[1];
      }
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
  const candidates = [
    path.join(dir, `${base}.html`),
    path.join(dir, `${base.replace(/-Excel$/i, "")}.html`),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function detectMainProducts(file: Quotation): string {
  const htmlPath = companionHtmlPath(file.filePath);
  if (!htmlPath) return "—";

  try {
    return extractProductsFromHtml(fs.readFileSync(htmlPath, "utf-8"));
  } catch {
    return "—";
  }
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

  const files = SCAN_PATHS.flatMap((dir) => scanFiles(dir));

  const quotations: Quotation[] = files
    .map((filePath) => {
      const parsed = parseFilename(filePath);
      const fileExt = path.extname(filePath).toLowerCase().slice(1);
      const file: Quotation = {
        id: parsed.id || path.basename(filePath),
        type: parsed.type || "QT",
        customer: parsed.customer || "未知",
        amount: "—",
        status: "Draft",
        date: parsed.date || "未知",
        filePath,
        fileName: path.basename(filePath),
        fileType: fileExt,
        mainProducts: "—",
      };
      file.status = detectStatus(file);
      file.amount = detectAmount(file);
      file.mainProducts = detectMainProducts(file);
      return file;
    })
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

  for (const q of all) {
    byType[q.type] = (byType[q.type] || 0) + 1;
    byStatus[q.status] = (byStatus[q.status] || 0) + 1;
  }

  return {
    total: all.length,
    byType,
    byStatus,
    totalAmount: "—",
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

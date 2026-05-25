import fs from "fs";
import path from "path";
import { resolvePath } from "./ssa-paths";
import { getQuoteRecords } from "./db";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Quotation {
  id: string;
  type: "QT" | "PI" | "PN" | "SPL";
  customer: string;
  amount: string;
  status: "Draft" | "Sent" | "Confirmed" | "Expired";
  date: string;
  filePath: string;
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
  resolvePath("data"),
  resolvePath("skills", "quotation-workflow", "examples"),
  resolvePath("skills", "quotation-workflow", "tests", "output"),
  resolvePath("output"),
  resolvePath("scripts", "output"),
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

  const runtimeQuotations: Quotation[] = getQuoteRecords({ limit: 500 }).map((record) => ({
    id: record.id,
    type: record.type,
    customer: record.customer,
    amount: record.amount,
    status: record.status,
    date: record.date || "未知",
    filePath: record.filePath || "",
    fileType: record.fileType || "",
  }));

  const files = SCAN_PATHS.flatMap((dir) => scanFiles(dir));
  const fileQuotations: Quotation[] = files
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
        fileType: fileExt,
      };
      file.status = detectStatus(file);
      file.amount = detectAmount(file);
      return file;
    });

  const byId = new Map<string, Quotation>();
  for (const q of runtimeQuotations) byId.set(q.id, q);
  for (const q of fileQuotations) {
    if (!byId.has(q.id)) byId.set(q.id, q);
  }

  const quotations = Array.from(byId.values()).sort((a, b) => {
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
        q2.customer.toLowerCase().includes(q)
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

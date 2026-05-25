import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getLeads, getCountries, getLeadStats, invalidateCache } from "@/lib/leads";
import type { ApiResponse, PaginatedResponse } from "@/lib/api-types";

// process.cwd() = web-frontend
const PROJECT_ROOT = process.cwd();

// ── Hero-pumps leads from hero-pumps/leads/*.csv ──
// Regional CSV files: eastern-europe, nordic-west, western-europe
// Headers: company,contact_name,email,website,country,industry,source,tier,position,department,confidence,verification_status

// In-memory cache for hero-pumps CSV data (like _cache in leads.ts)
let _heroCache: Array<Record<string, string>> | null = null;

function parseHeroLeads(): Array<Record<string, string>> {
  if (_heroCache) return _heroCache;

  const leadsDir = path.join(PROJECT_ROOT, "..", "hero-pumps", "leads");
  if (!fs.existsSync(leadsDir)) return [];

  const records: Array<Record<string, string>> = [];
  const csvFiles = fs.readdirSync(leadsDir).filter((f) => f.endsWith(".csv") && !f.includes("-original") && f !== "sample.csv");

  for (const fileName of csvFiles) {
    const csvPath = path.join(leadsDir, fileName);
    const raw = fs.readFileSync(csvPath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    if (lines.length < 2) continue;

    const headers = parseCsvLine(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      if (values.length >= 2) {
        const record: Record<string, string> = {};
        headers.forEach((h, j) => { record[h.trim()] = (values[j] || "").trim(); });
        records.push(record);
      }
    }
  }
  _heroCache = records;
  return records;
}

function invalidateHeroCache(): void {
  _heroCache = null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function getHeroLeads(params: {
  search?: string;
  score?: string;
  country?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResponse<any> {
  const raw = parseHeroLeads();
  // Deduplicate by company: keep first entry per company
  const seen = new Set<string>();
  const unique = raw.filter((r) => {
    const key = r.company;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const leads = unique.map((r) => ({
    companyName: r.company || "",
    country: r.country || "未知",
    industry: r.industry || "",
    contact: r.contact_name || "",
    position: r.position || "",
    email: r.email || "",
    homepage: r.website || "",
    category: r.tier?.startsWith("Tier1") ? "A" : r.tier?.startsWith("Tier2") ? "B" : "C",
    reason: r.industry || "",
    confidence: r.confidence?.replace("%", "") || "",
    score: (r.tier?.includes("Tier1") ? "Hot" : r.tier?.includes("Tier2") ? "Warm" : "Cold") as "Hot" | "Warm" | "Cold",
  }));

  const search = (params.search || "").toLowerCase();
  const score = params.score;
  const country = params.country;
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));

  let filtered = leads;
  if (search) {
    filtered = filtered.filter(
      (l) =>
        l.companyName.toLowerCase().includes(search) ||
        l.contact.toLowerCase().includes(search) ||
        l.email.toLowerCase().includes(search)
    );
  }
  if (score && score !== "All") {
    filtered = filtered.filter((l) => l.score === score);
  }
  if (country && country !== "All") {
    filtered = filtered.filter((l) => l.country === country);
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return { success: true, data: paged, total, page, pageSize, totalPages };
}

function getHeroCountries(): ApiResponse<string[]> {
  const raw = parseHeroLeads();
  const countries = Array.from(new Set(raw.map((r) => r.country).filter(Boolean))).sort();
  return { success: true, data: countries };
}

function getHeroLeadStats(): ApiResponse<any> {
  const result = getHeroLeads({ pageSize: 1000 });
  const leads = result.data || [];
  const hot = leads.filter((l: any) => l.score === "Hot").length;
  const warm = leads.filter((l: any) => l.score === "Warm").length;
  const cold = leads.filter((l: any) => l.score === "Cold").length;
  return {
    success: true,
    data: { total: result.total, hot, warm, cold, countries: new Set(leads.map((l: any) => l.country)).size },
  };
}

// Cache-Control helper
function cachedJson<T>(data: T, maxAge = 60): NextResponse<T> {
  return NextResponse.json(data, {
    headers: { "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}` },
  });
}

// ── API Route ──

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const project = searchParams.get("project") || "farreach";
  const isHero = project === "hero-pumps";

  // Countries
  if (action === "countries") {
    return cachedJson(isHero ? getHeroCountries() : getCountries(), 300);
  }

  // Stats
  if (action === "stats") {
    return cachedJson(isHero ? getHeroLeadStats() : getLeadStats(), 60);
  }

  // Reload cache
  if (action === "reload") {
    invalidateCache();
    invalidateHeroCache();
    const resp: ApiResponse<string> = { success: true, data: "Cache invalidated" };
    return NextResponse.json(resp);
  }

  // Combined: stats + countries + leads in one request (reduces 3 HTTP calls to 1)
  if (action === "combined") {
    const search = searchParams.get("search") || "";
    const score = searchParams.get("score") || "";
    const country = searchParams.get("country") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

    if (isHero) {
      return cachedJson({
        success: true,
        data: {
          stats: getHeroLeadStats(),
          countries: getHeroCountries(),
          leads: getHeroLeads({ search, score, country, page, pageSize }),
        },
      }, 30);
    }
    return cachedJson({
      success: true,
      data: {
        stats: getLeadStats(),
        countries: getCountries(),
        leads: getLeads({ search, score, country, page, pageSize }),
      },
    }, 30);
  }

  // Paginated list
  const search = searchParams.get("search") || "";
  const score = searchParams.get("score") || "";
  const country = searchParams.get("country") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));

  const result = isHero
    ? getHeroLeads({ search, score, country, page, pageSize })
    : getLeads({ search, score, country, page, pageSize });

  return cachedJson(result, 30);
}

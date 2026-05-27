import fs from "fs";
import path from "path";
import type { ApiResponse, PaginatedResponse } from "./api-types";
import { ssaDataPath } from "./ssa-data-paths";

function resolveDataPath(): string {
  if (process.env.LEADS_DATA_PATH) return process.env.LEADS_DATA_PATH;
  return ssaDataPath("leads", "farreach", "tier1-v2-complete.json");
}

export interface Lead {
  companyName: string;
  country: string;
  industry: string;
  contact: string;
  position: string;
  email: string;
  homepage: string;
  category: string;
  reason: string;
  confidence: string;
  score: "Hot" | "Warm" | "Cold";
}

export interface LeadStats {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  countries: number;
}

function categoryToScore(cat: string): "Hot" | "Warm" | "Cold" {
  if (cat === "A" || cat === "A|B") return "Hot";
  if (cat === "B") return "Warm";
  return "Cold";
}

let _cache: Lead[] | null = null;

/** Internal interface for raw JSON items from the data file */
interface RawLeadItem {
  company_name?: string;
  country?: string;
  industry?: string;
  contact?: string;
  position?: string;
  email?: string;
  homepage?: string;
  category?: string;
  reason?: string;
  confidence?: string;
}

/** Expose raw lead items for `data.ts` static loader (no caching) */
export function loadLeadsRaw(): RawLeadItem[] {
  try {
    const raw = JSON.parse(fs.readFileSync(resolveDataPath(), "utf-8")) as RawLeadItem[];
    return raw;
  } catch (e: unknown) {
    console.error("[leads] Failed to load raw data:", e);
    return [];
  }
}

function loadLeads(): Lead[] {
  if (_cache) return _cache;
  try {
    const raw = JSON.parse(fs.readFileSync(resolveDataPath(), "utf-8")) as RawLeadItem[];
    _cache = raw.map((item) => ({
      companyName: item.company_name || "",
      country: item.country || "未知",
      industry: item.industry || "",
      contact: item.contact || "",
      position: item.position || "",
      email: item.email || "",
      homepage: item.homepage || "",
      category: item.category || "unknown",
      reason: item.reason || "",
      confidence: item.confidence || "",
      score: categoryToScore(item.category || "unknown"),
    }));
    return _cache;
  } catch (e) {
    console.error("[leads] Failed to load data:", e);
    return [];
  }
}

/** Get all leads with optional filters and pagination */
export function getLeads(params: {
  search?: string;
  score?: string;
  country?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResponse<Lead> {
  const leads = loadLeads();
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
        l.email.toLowerCase().includes(search) ||
        l.industry.toLowerCase().includes(search)
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

  return {
    success: true,
    data: paged,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/** Get lead statistics */
export function getLeadStats(): ApiResponse<LeadStats> {
  const leads = loadLeads();
  const countries = new Set(leads.map((l) => l.country).filter(Boolean));
  return {
    success: true,
    data: {
      total: leads.length,
      hot: leads.filter((l) => l.score === "Hot").length,
      warm: leads.filter((l) => l.score === "Warm").length,
      cold: leads.filter((l) => l.score === "Cold").length,
      countries: countries.size,
    },
  };
}

/** Get unique country list */
export function getCountries(): ApiResponse<string[]> {
  const leads = loadLeads();
  const countries = Array.from(new Set(leads.map((l) => l.country).filter(Boolean))).sort();
  return { success: true, data: countries };
}

/** Invalidate cache (for hot-reload after data changes) */
export function invalidateCache(): void {
  _cache = null;
}

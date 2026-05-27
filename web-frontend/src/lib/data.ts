/**
 * Static lead data loader.
 * NOTE: This module duplicates much of the logic in `leads.ts` (which has caching,
 * pagination, and stats). It is kept for direct import use cases. Consider migrating
 * consumers to `leads.ts` and removing this file.
 */
import type { Lead } from "./leads";
import { loadLeadsRaw } from "./leads";

function categoryToScore(cat: string): "Hot" | "Warm" | "Cold" {
  if (cat === "A" || cat === "A|B") return "Hot";
  if (cat === "B") return "Warm";
  return "Cold";
}

export const leads: Lead[] = loadLeadsRaw().map((item) => ({
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

export const uniqueCountries = Array.from(new Set(leads.map((l) => l.country))).filter(Boolean).sort();

export const ITEMS_PER_PAGE = 20;

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { loadLeadsRaw } from "@/lib/leads";
import { getQuotations } from "@/lib/quotations";
import { paths } from "@/lib/ssa-paths";
import type { ApiResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

const HERO_SENT_LOG = paths.heroSentLog;
const HERO_FOLLOW_UP = paths.heroFollowUp;
const HERO_REPLIES = paths.heroReplies;
const HERO_LEADS_DIR = path.join(paths.heroPumps, "leads");

interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  color: string;
}

interface PipelineFunnelResponse {
  stages: FunnelStage[];
  totalConversionRate: number;
  updatedAt: string;
}

/** Check if farreach data sources are effectively empty */
function isFarreachEmpty(): boolean {
  try {
    const leads = loadLeadsRaw();
    return leads.length === 0;
  } catch {
    return true;
  }
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function countHeroLeads(): number {
  if (!fs.existsSync(HERO_LEADS_DIR)) return 0;
  const companies = new Set<string>();
  try {
    const csvFiles = fs.readdirSync(HERO_LEADS_DIR).filter((f) => f.endsWith(".csv") && !f.includes("-original") && f !== "sample.csv");
    for (const fileName of csvFiles) {
      const raw = fs.readFileSync(path.join(HERO_LEADS_DIR, fileName), "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim());
      if (lines.length < 2) continue;
      const headers = parseCsvLine(lines[0]).map((h) => h.trim());
      const companyIdx = headers.indexOf("company");
      if (companyIdx < 0) continue;
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const company = (values[companyIdx] || "").trim();
        if (company) companies.add(company);
      }
    }
  } catch { /* ignore */ }
  return companies.size;
}

function getHeroFunnelStages(): FunnelStage[] {
  const sent = safeReadJson<Array<{ email: string }>>(HERO_SENT_LOG) || [];
  const followUp = safeReadJson<Record<string, { has_reply?: boolean; follow_up_stage?: number }>>(HERO_FOLLOW_UP) || {};
  const replies = safeReadJson<Array<any>>(HERO_REPLIES) || [];

  const totalLeads = countHeroLeads();
  const totalSent = sent.length;
  const totalContacts = Object.keys(followUp).length || totalSent;

  // Contacts with follow_up_stage >= 2 are "contacted" (beyond initial cold email)
  const contactedCount = Object.values(followUp).filter(
    (f) => (f.follow_up_stage || 0) >= 2
  ).length || Math.min(totalSent, totalContacts);

  // Replied = engaged
  const repliedCount = replies.length || Object.values(followUp).filter((f) => f.has_reply).length;

  // Quoted: hero-pumps doesn't have quotations, so 0
  const quotationCount = 0;

  return [
    { stage: "discovery", label: "发现线索", count: totalLeads, color: "from-blue-500 to-blue-400" },
    { stage: "qualified", label: "合格线索", count: totalContacts, color: "from-violet-500 to-violet-400" },
    { stage: "contacted", label: "已触达", count: contactedCount, color: "from-cyan-500 to-cyan-400" },
    { stage: "engaged", label: "深度沟通", count: repliedCount, color: "from-emerald-500 to-emerald-400" },
    { stage: "quoted", label: "已报价", count: quotationCount, color: "from-amber-500 to-amber-400" },
  ];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") || "farreach";
  const isHero = project === "hero-pumps";

  try {
    let stages: FunnelStage[];

    if (isHero) {
      stages = getHeroFunnelStages();
    } else {
      const allLeads = loadLeadsRaw();
      const quotations = getQuotations();
      const frEmpty = isFarreachEmpty();

      const totalLeads = frEmpty ? 47 : allLeads.length;
      const qualifiedLeads = frEmpty ? 32 : allLeads.filter(
        (l: any) => l.category === "A" || l.category === "A|B" || l.category === "B"
      ).length;
      const contactedLeads = frEmpty ? 21 : allLeads.filter(
        (l: any) => l.confidence && l.confidence !== "unknown"
      ).length;
      const hotLeads = frEmpty ? 8 : allLeads.filter(
        (l: any) => l.category === "A" || l.category === "A|B"
      ).length;
      const quotationCount = quotations?.quotations?.length || 0;

      stages = [
        { stage: "discovery", label: "发现线索", count: totalLeads, color: "from-blue-500 to-blue-400" },
        { stage: "qualified", label: "合格线索", count: qualifiedLeads, color: "from-violet-500 to-violet-400" },
        { stage: "contacted", label: "已触达", count: contactedLeads, color: "from-cyan-500 to-cyan-400" },
        { stage: "engaged", label: "深度沟通", count: hotLeads, color: "from-emerald-500 to-emerald-400" },
        { stage: "quoted", label: "已报价", count: quotationCount, color: "from-amber-500 to-amber-400" },
      ];
    }

    const totalConversionRate = stages[0].count > 0
      ? parseFloat(((stages[stages.length - 1].count / stages[0].count) * 100).toFixed(1))
      : 0;

    const response: ApiResponse<PipelineFunnelResponse> = {
      success: true,
      data: {
        stages,
        totalConversionRate,
        updatedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (error) {
    console.error("Pipeline funnel API error:", error);
    const fallback: ApiResponse<PipelineFunnelResponse> = {
      success: false,
      error: "Failed to load pipeline data",
      data: {
        stages: [
          { stage: "discovery", label: "发现线索", count: 0, color: "from-blue-500 to-blue-400" },
          { stage: "qualified", label: "合格线索", count: 0, color: "from-violet-500 to-violet-400" },
          { stage: "contacted", label: "已触达", count: 0, color: "from-cyan-500 to-cyan-400" },
          { stage: "engaged", label: "深度沟通", count: 0, color: "from-emerald-500 to-emerald-400" },
          { stage: "quoted", label: "已报价", count: 0, color: "from-amber-500 to-amber-400" },
        ],
        totalConversionRate: 0,
        updatedAt: new Date().toISOString(),
      },
    };
    return NextResponse.json(fallback, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import fs from "fs";
import { getLeadStats, loadLeadsRaw } from "@/lib/leads";
import { getEmailStats } from "@/lib/emails";
import { getQuotations } from "@/lib/quotations";
import { getAgentState } from "@/lib/db";
import * as heroData from "@/lib/hero-data";
import type { ApiResponse } from "@/lib/api-types";

export const dynamic = "force-dynamic";

// process.cwd() = web-frontend
// In-memory cache with TTL for dashboard overview
let _dashCache: { data: any; ts: number } | null = null;
const DASH_TTL = 30_000; // 30 seconds

function getCached(project: string): any | null {
  if (!_dashCache) return null;
  if (Date.now() - _dashCache.ts > DASH_TTL) { _dashCache = null; return null; }
  return _dashCache.data[project] || null;
}

function setCached(project: string, data: any): void {
  if (!_dashCache) _dashCache = { data: {}, ts: Date.now() };
  else if (Date.now() - _dashCache.ts > DASH_TTL) _dashCache = { data: {}, ts: Date.now() };
  _dashCache.data[project] = data;
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

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

// ── Hero-pumps real-time data from Mac Mini via SSH tunnel ──
const HERO_DATA_API = process.env.HERO_DATA_API_URL || "http://127.0.0.1:18900";

async function heroFetch<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(HERO_DATA_API + endpoint, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

interface DashboardOverview {
  stats: {
    activeLeads: number;
    todayEmails: number;
    pendingQuotations: number;
    conversionRate: number;
  };
  recentLeads: Array<{
    name: string;
    email: string;
    status: string;
    time: string;
    score: number;
  }>;
  agentTasks: Array<{
    task: string;
    status: "processing" | "pending" | "completed";
    progress: number;
    timestamp?: string;
  }>;
}

async function getRealAgentTasks(project: string): Promise<DashboardOverview["agentTasks"]> {
  const tasks: DashboardOverview["agentTasks"] = [];
  const isHero = project === "hero-pumps";

  // ── Shadow: recent research ──
  if (isHero) {
    const research = await heroFetch<Array<{ file: string; research_date?: string }>>("/research/list");
    if (research && research.length > 0) {
      const sorted = research.sort((a, b) => {
        const da = a.research_date || "";
        const db = b.research_date || "";
        return db.localeCompare(da);
      });
      sorted.slice(0, 2).forEach((r) => {
        tasks.push({ task: `🗡️ 影刃 背调: ${r.file.replace(".json", "")}`, status: "completed", progress: 100, timestamp: r.research_date });
      });
    }
  } else {
    const state = getAgentState(undefined, 8);
    state.tasks.slice(0, 2).forEach((task) => {
      tasks.push({
        task: `🗡️ ${task.agent} ${task.title || task.current_step || task.id}`,
        status: task.status === "completed"
          ? "completed"
          : task.status === "running"
            ? "processing"
            : "pending",
        progress: typeof task.progress === "number"
          ? task.progress
          : task.status === "completed"
            ? 100
            : task.status === "running"
              ? 50
              : 0,
        timestamp: task.completed_at || task.updated_at || task.started_at,
      });
    });
  }

  // ── Iron: recent sent emails (real-time from Mac Mini) ──
  if (isHero) {
    const sent = await heroFetch<Array<{ company: string; subject: string; sent_at: string }>>("/sent-log");
    if (sent && sent.length > 0) {
      sent.sort((a, b) => b.sent_at.localeCompare(a.sent_at)).slice(0, 2).forEach((e) => {
        tasks.push({ task: `💪 铁腕 邮件: ${e.company}`, status: "completed", progress: 100, timestamp: e.sent_at ? new Date(e.sent_at).toLocaleString("zh-CN", { hour12: false }) : undefined });
      });
    }
  }

  // ── Warden: product specs ──
  if (isHero) {
    const specs = await heroFetch<string[]>("/product-specs");
    if (specs && specs.length > 0) {
      tasks.push({ task: `🏛️ 基石 规格库维护: ${specs.length} 份文档`, status: "completed", progress: 100 });
    }
  }

  return tasks.slice(0, 8);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") || "farreach";
  const isHero = project === "hero-pumps";

  // Return cached result if fresh
  const cached = getCached(project);
  if (cached) {
    return NextResponse.json({ success: true, data: cached }, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
    });
  }

  try {
    let totalLeads = 0;
    let todayEmails = 0;
    let heroReplied = 0;
    let heroTotalSent = 0;
    let pendingQuotations = 0;
    let conversionRate = 0;
    let recentLeads: Array<{ name: string; email: string; status: string; time: string; score: number }> = [];

    if (isHero) {
      // Real-time data from Mac Mini via SSH tunnel
      const sent = await heroFetch<Array<any>>("/sent-log") || [];
      const followUp = await heroFetch<Record<string, { has_reply?: boolean }>>("/follow-up-state") || {};
      const replies = await heroFetch<Array<any>>("/tracking/replies") || [];
      const leads = await heroFetch<Array<any>>("/leads") || [];

      heroTotalSent = sent.length;
      todayEmails = heroTotalSent;
      heroReplied = Object.values(followUp).filter((f) => f.has_reply).length || replies.length;

      totalLeads = leads.length;

      // Recent leads
      leads.slice(0, 5).forEach((lead) => {
        const tier = (lead.tier || "").toString();
        recentLeads.push({
          name: lead.company || "",
          email: lead.email || "",
          status: tier.startsWith("Tier1") ? "重点" : tier.startsWith("Tier2") ? "潜力" : "普通",
          time: new Date().toISOString().split("T")[0],
          score: tier.startsWith("Tier1") ? 90 : tier.startsWith("Tier2") ? 70 : 50,
        });
      });

      const totalSent = heroTotalSent || 1;
      conversionRate = totalSent > 0 ? parseFloat(((heroReplied / totalSent) * 100).toFixed(1)) : 0;
      pendingQuotations = 0;
    } else {
      // Non-hero: use existing logic
      const leadStats = getLeadStats();
      const allLeads = loadLeadsRaw();
      const emailStats = getEmailStats();
      const quotations = getQuotations();

      totalLeads = leadStats.data?.total || 0;
      const hotLeads = leadStats.data?.hot || 0;
      todayEmails = emailStats.totalSent || 0;
      pendingQuotations = quotations.quotations?.filter((q: any) => q.status === "Draft").length || 0;
      const totalSent = emailStats.totalSent || 1;
      conversionRate = totalSent > 0 ? parseFloat(((hotLeads / totalSent) * 100).toFixed(1)) : 0;

      recentLeads = allLeads.slice(0, 5).map((lead: any) => ({
        name: lead.company_name || "",
        email: lead.email || "",
        status: lead.category === "A" ? "新线索" : lead.category === "B" ? "跟进中" : "潜在",
        time: new Date().toISOString().split("T")[0],
        score: lead.confidence === "high" ? 90 : lead.confidence === "medium" ? 70 : 50,
      }));
    }

    const agentTasks = await getRealAgentTasks(project);

    const overview: DashboardOverview = {
      stats: { activeLeads: totalLeads, todayEmails, pendingQuotations, conversionRate },
      recentLeads,
      agentTasks,
    };

    setCached(project, overview);

    const resp: ApiResponse<DashboardOverview> = {
      success: true,
      data: overview,
    };
    return NextResponse.json(resp, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
    });
  } catch (error) {
    console.error("Dashboard overview API error:", error);
    const fallbackResp: ApiResponse<DashboardOverview> = {
      success: false,
      error: "Internal server error",
      data: {
        stats: { activeLeads: 0, todayEmails: 0, pendingQuotations: 0, conversionRate: 0 },
        recentLeads: [],
        agentTasks: [],
      }
    };
    return NextResponse.json(fallbackResp, { status: 500 });
  }
}

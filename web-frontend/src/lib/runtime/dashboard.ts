import fs from "fs";
import path from "path";
import type { ApiResponse } from "../api-types";
import type { SalesRuntime } from "./sales-runtime";
import type { DashboardAgentTask, DashboardOverviewReadModel, HeroDashboardData } from "./sales-memory";
import type { SideEffectDecision } from "./types";

const PROJECT_ROOT = process.cwd();
const DASH_TTL = 30_000;

interface DashboardOverview extends DashboardOverviewReadModel {
  sideEffect?: SideEffectDecision;
}

let overviewCache: { data: Record<string, DashboardOverview>; ts: number } | null = null;

function heroDataApiUrl() {
  return process.env.HERO_DATA_API_URL || "http://127.0.0.1:18900";
}

function getCached(project: string): DashboardOverview | null {
  if (!overviewCache) return null;
  if (Date.now() - overviewCache.ts > DASH_TTL) {
    overviewCache = null;
    return null;
  }
  return overviewCache.data[project] || null;
}

function setCached(project: string, data: DashboardOverview): void {
  if (!overviewCache || Date.now() - overviewCache.ts > DASH_TTL) {
    overviewCache = { data: {}, ts: Date.now() };
  }
  overviewCache.data[project] = data;
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function heroFetch<T>(endpoint: string, sideEffect?: SideEffectDecision | null): Promise<T | null> {
  if (sideEffect?.status !== "allowed") return null;
  try {
    const res = await fetch(heroDataApiUrl() + endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function getDashboardAgentTasks(
  project: string,
  sideEffect?: SideEffectDecision | null
): Promise<DashboardAgentTask[]> {
  const tasks: DashboardAgentTask[] = [];
  const isHero = project === "hero-pumps";

  if (isHero) {
    const research = await heroFetch<Array<{ file: string; research_date?: string }>>("/research/list", sideEffect);
    if (research && research.length > 0) {
      const sorted = research.sort((a, b) => {
        const da = a.research_date || "";
        const db = b.research_date || "";
        return db.localeCompare(da);
      });
      sorted.slice(0, 2).forEach((item) => {
        tasks.push({
          task: `🗡️ 影刃 背调: ${item.file.replace(".json", "")}`,
          status: "completed",
          progress: 100,
          timestamp: item.research_date,
        });
      });
    }
  } else {
    const researchDir = path.join(PROJECT_ROOT, "../../../farreach-emails", "research", "tier1");
    if (fs.existsSync(researchDir)) {
      const files = fs.readdirSync(researchDir).filter((file) => file.endsWith(".json"));
      const filesWithDate = files.map((file) => {
        const filePath = path.join(researchDir, file);
        const data = safeReadJson<{ research_date?: string }>(filePath);
        const timestamp = data?.research_date ?? fs.statSync(filePath).mtime.toISOString().split("T")[0];
        return { file, timestamp };
      });
      filesWithDate.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      filesWithDate.slice(0, 2).forEach(({ file, timestamp }) => {
        tasks.push({
          task: `🗡️ 影刃 背调: ${file.replace(".json", "").replace(/^\d+-/, "")}`,
          status: "completed",
          progress: 100,
          timestamp,
        });
      });
    }
  }

  if (isHero) {
    const sent = await heroFetch<Array<{ company: string; subject: string; sent_at: string }>>("/sent-log", sideEffect);
    if (sent && sent.length > 0) {
      sent.sort((a, b) => b.sent_at.localeCompare(a.sent_at)).slice(0, 2).forEach((email) => {
        tasks.push({
          task: `💪 铁腕 邮件: ${email.company}`,
          status: "completed",
          progress: 100,
          timestamp: email.sent_at ? new Date(email.sent_at).toLocaleString("zh-CN", { hour12: false }) : undefined,
        });
      });
    }

    const specs = await heroFetch<string[]>("/product-specs", sideEffect);
    if (specs && specs.length > 0) {
      tasks.push({
        task: `🏛️ 基石 规格库维护: ${specs.length} 份文档`,
        status: "completed",
        progress: 100,
      });
    }
  }

  return tasks.slice(0, 8);
}

async function getHeroDashboardData(sideEffect?: SideEffectDecision): Promise<HeroDashboardData> {
  return {
    sent: await heroFetch<Array<{ company?: string; subject?: string; sent_at?: string }>>("/sent-log", sideEffect) || [],
    followUp: await heroFetch<Record<string, { has_reply?: boolean }>>("/follow-up-state", sideEffect) || {},
    replies: await heroFetch<Array<Record<string, unknown>>>("/tracking/replies", sideEffect) || [],
    leads: await heroFetch<Array<{ company?: string; email?: string; tier?: string }>>("/leads", sideEffect) || undefined,
  };
}

export async function getDashboardOverview(runtime: SalesRuntime, project: string): Promise<ApiResponse<DashboardOverview>> {
  const workspace = runtime.getWorkspace(project);
  const isHero = workspace.id === "hero-pumps";
  let sideEffect: SideEffectDecision | undefined;

  if (isHero) {
    sideEffect = runtime.requestSideEffect({
      kind: "data.read",
      workspaceId: workspace.id,
      summary: "Read Hero Pumps dashboard data from external data API",
      payload: {
        source: "dashboard.overview",
        endpoint: heroDataApiUrl(),
      },
      idempotencyKey: `${workspace.id}:dashboard:overview:data-read`,
    });
  }

  const cacheKey = isHero ? `${workspace.id}:${sideEffect?.status || "local"}` : workspace.id;
  const cached = getCached(cacheKey);
  if (cached) {
    return {
      success: true,
      data: isHero ? { ...cached, sideEffect } : cached,
    };
  }

  const heroData = isHero ? await getHeroDashboardData(sideEffect) : undefined;
  const agentTasks = await getDashboardAgentTasks(workspace.id, sideEffect);
  const overview: DashboardOverview = {
    ...runtime.memory.getDashboardOverview(workspace.id, { heroData, agentTasks }),
    sideEffect,
  };

  setCached(cacheKey, overview);
  return { success: true, data: overview };
}

export function clearDashboardOverviewCache(): void {
  overviewCache = null;
}

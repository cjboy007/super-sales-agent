import fs from "fs";
import path from "path";
import { ssaDataPath } from "./ssa-data-paths";

const PROJECT_ROOT = process.cwd();

interface AgentTask {
  id: string;
  description: string;
  status: "completed" | "running" | "failed" | "pending";
  startedAt: string;
  duration?: string;
  agentId: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: "online" | "offline" | "busy" | "error";
  lastActive: string;
  tasksCompleted: number;
  tasksRunning: number;
  tasks: AgentTask[];
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getFileMtime(filePath: string): string {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// ── Shadow tasks: Farreach back-research ──

function getFarreachShadowTasks(): AgentTask[] {
  const researchDir = path.join(PROJECT_ROOT, "../../../obsidian-vault/research/farreach/raw/tier1");
  if (!fs.existsSync(researchDir)) return [];

  const files = fs.readdirSync(researchDir).filter((f) => f.endsWith(".json"));
  const recent = files
    .map((f) => ({ file: f, mtime: getFileMtime(path.join(researchDir, f)) }))
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
    .slice(0, 10);

  return recent.map((f, i) => {
    const name = f.file.replace(".json", "").replace(/^\d+-/, "");
    const data = safeReadJson<{ country?: string; tier?: string }>(path.join(researchDir, f.file));
    return {
      id: `fr-shadow-${i}`,
      description: `背调: ${name} — ${data?.country || "未知"}`,
      status: "completed" as const,
      startedAt: f.mtime,
      duration: "5m",
      agentId: "shadow",
    };
  });
}

// ── Shadow tasks: Hero-pumps back-research ──

function getHeroShadowTasks(): AgentTask[] {
  const researchDir = path.join(PROJECT_ROOT, "../../../obsidian-vault/research/hero-pumps/companies");
  if (!fs.existsSync(researchDir)) return [];

  const files = fs.readdirSync(researchDir).filter((f) => f.endsWith(".json"));
  const recent = files
    .map((f) => ({ file: f, mtime: getFileMtime(path.join(researchDir, f)) }))
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
    .slice(0, 10);

  return recent.map((f, i) => {
    const name = f.file.replace(".json", "");
    const data = safeReadJson<{ country?: string; tier?: string }>(path.join(researchDir, f.file));
    return {
      id: `hp-shadow-${i}`,
      description: `背调: ${name} — ${data?.country || "未知"} ${data?.tier || ""}`,
      status: "completed" as const,
      startedAt: f.mtime,
      duration: "5m",
      agentId: "shadow",
    };
  });
}

// ── Iron tasks: Hero-pumps sent emails ──

function getHeroIronTasks(): AgentTask[] {
  const sentLogPath = ssaDataPath("mail", "sent-log.json");
  const emails = safeReadJson<Array<{ email: string; company: string; sent_at: string; subject: string }>>(sentLogPath) || [];
  return emails
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
    .slice(0, 10)
    .map((e, i) => ({
      id: `hp-iron-${i}`,
      description: `邮件: ${e.company} — ${e.subject}`,
      status: "completed" as const,
      startedAt: e.sent_at,
      duration: "3m",
      agentId: "iron",
    }));
}

// ── Oracle tasks: Hero-pumps intelligence ──

function getHeroOracleTasks(): AgentTask[] {
  const trendsPath = ssaDataPath("intelligence", "trends.json");
  const competitorsPath = ssaDataPath("intelligence", "competitors.json");
  const trends = safeReadJson<{ updatedAt?: string; trends?: Array<{ label: string }> }>(trendsPath);
  const competitors = safeReadJson<{ updatedAt?: string; competitors?: Array<{ company: string }> }>(competitorsPath);

  const tasks: AgentTask[] = [];
  if (trends?.trends?.some((t) => t.label?.includes("铜价"))) {
    tasks.push({ id: "hp-oracle-copper", description: "LME 铜价数据采集 — 本周价格更新", status: "completed", startedAt: trends.updatedAt || new Date().toISOString(), duration: "2m", agentId: "oracle" });
  }
  if (competitors?.competitors?.length) {
    tasks.push({ id: "hp-oracle-competitors", description: `竞品动态采集 — 发现 ${competitors.competitors.length} 条工厂动态`, status: "completed", startedAt: competitors.updatedAt || new Date().toISOString(), duration: "8m", agentId: "oracle" });
  }
  const nonCopper = trends?.trends?.filter((t) => !t.label?.includes("铜价")) || [];
  if (nonCopper.length) {
    tasks.push({ id: "hp-oracle-trends", description: `行业趋势追踪 — ${nonCopper.map((t) => t.label).join("、")}`, status: "completed", startedAt: trends?.updatedAt || new Date().toISOString(), duration: "10m", agentId: "oracle" });
  }
  return tasks.slice(0, 10);
}

// ── Warden tasks: Hero-pumps product specs ──

function getHeroWardenTasks(): AgentTask[] {
  const specsDir = path.join(PROJECT_ROOT, "..", "hero-pumps", "product-specs");
  if (!fs.existsSync(specsDir)) return [];
  const files = fs.readdirSync(specsDir);
  return files.length > 0
    ? [{ id: "hp-warden-specs", description: `产品规格库维护 — ${files.length} 份文档已归档`, status: "completed", startedAt: getFileMtime(path.join(specsDir, files[0])), duration: "5m", agentId: "warden" }]
    : [];
}

// ── Build agent list (shared by list and detail routes) ──

export function getAgents(project: string = "farreach"): Agent[] {
  const isHero = project === "hero-pumps";

  const shadowTasks = isHero ? getHeroShadowTasks() : getFarreachShadowTasks();
  const ironTasks = isHero ? getHeroIronTasks() : [];
  const oracleTasks = isHero ? getHeroOracleTasks() : [];
  const wardenTasks = isHero ? getHeroWardenTasks() : [];

  const agents: Agent[] = [];

  // Shadow — always present (both projects have back-research)
  agents.push({
    id: "shadow",
    name: "影刃 Shadow",
    role: "客户背调 · 竞品拆解",
    status: shadowTasks.length > 0 ? "online" : "offline",
    lastActive: shadowTasks[0]?.startedAt || new Date().toISOString(),
    tasksCompleted: shadowTasks.length,
    tasksRunning: 0,
    tasks: shadowTasks.slice(0, 6),
  });

  // Iron — only when email sync is active
  if (ironTasks.length > 0) {
    agents.push({
      id: "iron",
      name: "铁腕 Iron",
      role: "询盘转化 · 邮件撰写",
      status: "online",
      lastActive: ironTasks[0].startedAt,
      tasksCompleted: ironTasks.length,
      tasksRunning: 0,
      tasks: ironTasks.slice(0, 6),
    });
  }

  // Oracle — only when intelligence tracking is active
  if (oracleTasks.length > 0) {
    agents.push({
      id: "oracle",
      name: "天眼 Oracle",
      role: isHero ? "HDMI/DP/USB 行业趋势分析" : "线缆行业趋势分析",
      status: "online",
      lastActive: oracleTasks[0].startedAt,
      tasksCompleted: oracleTasks.length,
      tasksRunning: 0,
      tasks: oracleTasks.slice(0, 6),
    });
  }

  // Warden — only when product specs exist
  if (wardenTasks.length > 0) {
    agents.push({
      id: "warden",
      name: "基石 Warden",
      role: isHero ? "线材规格库 · 记忆维护" : "产品库 · 记忆维护",
      status: "online",
      lastActive: wardenTasks[0].startedAt,
      tasksCompleted: wardenTasks.length,
      tasksRunning: 0,
      tasks: wardenTasks.slice(0, 6),
    });
  }

  return agents;
}

/**
 * Look up a single agent by ID. Returns null if not found.
 */
export function getAgentById(id: string, project: string = "farreach"): Agent | null {
  const agents = getAgents(project);
  return agents.find((a) => a.id === id) || null;
}

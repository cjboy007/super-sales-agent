import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getEmailStats } from "@/lib/emails";
import { paths } from "@/lib/ssa-paths";

const HERO_SENT_LOG = paths.heroSentLog;
const HERO_FOLLOW_UP = paths.heroFollowUp;
const HERO_TEMPLATES_DIR = paths.heroTemplates;
const HERO_REPLIES = paths.heroReplies;

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getHeroEmailStats() {
  const sent = safeReadJson<Array<{ email: string; sent_at: string; subject: string }>>(HERO_SENT_LOG) || [];
  const followUp = safeReadJson<Record<string, { has_reply?: boolean }>>(HERO_FOLLOW_UP) || {};
  const replies = safeReadJson<Array<any>>(HERO_REPLIES) || [];

  // Source of truth: followUp.has_reply === true (not raw replies array length)
  const repliedCount = Object.values(followUp).filter((f) => f.has_reply).length || (replies.length || 0);
  const totalSent = sent.length;
  const replyRate = totalSent > 0 ? Math.min(Math.round((repliedCount / totalSent) * 100), 100) : 0;

  let totalDrafts = 0;
  try {
    if (fs.existsSync(HERO_TEMPLATES_DIR)) {
      totalDrafts = fs.readdirSync(HERO_TEMPLATES_DIR).filter((f) => f.endsWith(".md") || f.endsWith(".json")).length;
    }
  } catch { /* ignore */ }

  return {
    totalSent,
    totalReceived: repliedCount,
    totalReplied: repliedCount,
    replyRate,
    totalDrafts,
  };
}

export async function GET(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const isHero = project === "hero-pumps";

    const stats = isHero ? getHeroEmailStats() : getEmailStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

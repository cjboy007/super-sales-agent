import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getPendingEmails } from "@/lib/emails";
import { paths } from "@/lib/ssa-paths";

const HERO_FOLLOW_UP = paths.heroFollowUp;
const HERO_SENT_LOG = paths.heroSentLog;

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getHeroPendingEmails() {
  const followUp = safeReadJson<
    Record<string, {
      email: string;
      company?: string;
      follow_up_stage?: number;
      next_follow_up_at?: string;
      has_reply?: boolean;
      is_due?: boolean;
      template_path?: string;
    }>
  >(HERO_FOLLOW_UP) || {};

  const sentLog = safeReadJson<Array<{ email: string; subject: string }>>(HERO_SENT_LOG) || [];
  const sentSubjects = new Map(sentLog.map((s) => [s.email.toLowerCase(), s.subject]));

  const pending: Array<{ id: string; to: string; subject: string; scheduledAt: string; reason: string }> = [];

  for (const [_key, entry] of Object.entries(followUp)) {
    if (entry.has_reply || !entry.is_due) continue;

    const lastSubject = sentSubjects.get(entry.email.toLowerCase()) || "";
    const stage = entry.follow_up_stage || 1;

    pending.push({
      id: `hero-pending-${entry.email.split("@")[0]}`,
      to: entry.email,
      subject: `Follow-up #${stage}: ${lastSubject || "Regarding pump supply"}`,
      scheduledAt: entry.next_follow_up_at || new Date().toISOString(),
      reason: `第 ${stage} 次跟进`,
    });
  }

  return pending.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export async function GET(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const isHero = project === "hero-pumps";

    const pending = isHero ? getHeroPendingEmails() : getPendingEmails();
    return NextResponse.json({ success: true, data: pending });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

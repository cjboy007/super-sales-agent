import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getSentEmailsPaginated } from "@/lib/emails";
import { paths } from "@/lib/ssa-paths";

const HERO_SENT_LOG = paths.heroSentLog;

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getHeroSentEmailsPaginated(page: number, limit: number) {
  const data = safeReadJson<Array<{ email: string; sent_at: string; subject: string }>>(HERO_SENT_LOG) || [];
  const sorted = [...data].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const items = sorted.slice(start, start + limit);
  return { items, total, page, totalPages };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const project = searchParams.get("project") || "farreach";
    const isHero = project === "hero-pumps";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

    const result = isHero
      ? getHeroSentEmailsPaginated(page, limit)
      : getSentEmailsPaginated(page, limit);

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

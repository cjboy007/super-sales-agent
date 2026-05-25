import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// 过滤市场报告/研究报告/主页索引等垃圾内容
const JUNK_TITLE_PATTERNS = [
  /market (size|share|forecast|report|analysis|demand|statistics|outlook)/i,
  /\$[\d.]+\s*(billion|bn)/i,
  /\d+(\.\d+)?%\s*cagr/i,
  /market (to (garner|reach)|is expected to)/i,
  /key (players|trends|drivers)/i,
  /segmentation by/i,
  /latest top stories?/i,
  /follow the latest/i,
];

const JUNK_SOURCES = [
  "alliedmarketresearch",
  "researchnester",
  "thebusinessresearchcompany",
  "grandviewresearch",
  "mordorintelligence",
  "marketresearchfuture",
  "gii.tw",
  "statista",
];

function isJunk(item: { title?: string; source?: string }) {
  const title = (item.title || "").toLowerCase();
  const source = (item.source || "").toLowerCase();
  return JUNK_TITLE_PATTERNS.some((p) => p.test(title)) || JUNK_SOURCES.some((s) => source.includes(s));
}

// 按 tag 交错排列，避免同类扎堆
function interleaveByTag(items: Array<Record<string, unknown>>) {
  const byTag: Record<string, typeof items> = {};
  for (const item of items) {
    const tag = String(item.tag || "");
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(item);
  }
  const groups = Object.values(byTag);
  if (!groups.length) return items;
  const result: typeof items = [];
  const maxLen = Math.max(...groups.map((g) => g.length));
  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (i < group.length) result.push(group[i]);
    }
  }
  return result;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "intelligence", "news.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const allNews: Array<Record<string, unknown>> = data.news || [];

    // 过滤垃圾
    const filtered = allNews.filter((n) => !isJunk(n));

    // 交错排列
    const shuffled = interleaveByTag(filtered);

    return NextResponse.json({
      success: true,
      news: shuffled,
      updatedAt: data.updatedAt,
      _totalRaw: allNews.length,
      _filtered: filtered.length,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

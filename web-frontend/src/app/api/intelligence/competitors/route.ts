export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// 过滤垃圾竞品内容
const JUNK_PATTERNS = [
  /discover\//i,
  /tag\//i,
  /trending/i,
];

function isJunk(item: { title?: string; url?: string }) {
  const title = item.title || "";
  const url = item.url || "";
  return JUNK_PATTERNS.some((p) => p.test(title) || p.test(url));
}

// 按 company 交错排列
function interleaveByCompany(items: Array<Record<string, unknown>>) {
  const byCompany: Record<string, typeof items> = {};
  for (const item of items) {
    const company = String(item.company || "");
    if (!byCompany[company]) byCompany[company] = [];
    byCompany[company].push(item);
  }
  const groups = Object.values(byCompany);
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
    const filePath = path.join(process.cwd(), "data", "intelligence", "competitors.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const allCompetitors: Array<Record<string, unknown>> = data.competitors || [];

    // 过滤垃圾
    const filtered = allCompetitors.filter((c) => !isJunk(c));

    // 交错排列
    const shuffled = interleaveByCompany(filtered);

    return NextResponse.json({
      success: true,
      competitors: shuffled,
      updatedAt: data.updatedAt,
      _totalRaw: allCompetitors.length,
      _filtered: filtered.length,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

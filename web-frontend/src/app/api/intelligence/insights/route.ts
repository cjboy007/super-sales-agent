export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const INSIGHTS_PATH = path.join(process.cwd(), "data", "intelligence", "insights.json");

export async function GET() {
  try {
    const raw = fs.readFileSync(INSIGHTS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json({ success: true, insights: data.insights, cached: true, generatedAt: data.generatedAt });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

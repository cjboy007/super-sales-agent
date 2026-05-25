import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getEmailDrafts } from "@/lib/emails";
import { paths } from "@/lib/ssa-paths";

const HERO_TEMPLATES_DIR = paths.heroTemplates;

function getHeroEmailDrafts() {
  try {
    if (!fs.existsSync(HERO_TEMPLATES_DIR)) return [];
    const files = fs.readdirSync(HERO_TEMPLATES_DIR)
      .filter((f) => f.endsWith(".md") || f.endsWith(".json"))
      .sort()
      .reverse();

    return files.slice(0, 50).map((file, i) => ({
      id: `hero-draft-${i + 1}`,
      subject: file
        .replace(/\.(json|md)$/, "")
        .replace(/^followup[-_]/, "")
        .replace(/[-_]/g, " "),
      template: file,
    }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const project = request.nextUrl.searchParams.get("project") || "farreach";
    const isHero = project === "hero-pumps";

    const drafts = isHero ? getHeroEmailDrafts() : getEmailDrafts();
    return NextResponse.json({ success: true, data: drafts });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

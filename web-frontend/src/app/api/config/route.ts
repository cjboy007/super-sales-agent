import { NextRequest, NextResponse } from "next/server";
import { readSettings, writeSettings, maskSettings, exportSettings, importSettings } from "@/lib/config-store";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function GET() {
  try {
    const settings = readSettings();
    const masked = maskSettings(settings);
    return NextResponse.json({ success: true, data: masked });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: errorMessage(e) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    writeSettings(body);
    const masked = maskSettings(body);
    return NextResponse.json({ success: true, data: masked });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: errorMessage(e) },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = importSettings(JSON.stringify(body));
    writeSettings(settings);
    return NextResponse.json({ success: true, message: "配置已导入" });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: errorMessage(e) },
      { status: 400 }
    );
  }
}

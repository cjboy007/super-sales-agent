import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function GET() {
  try {
    const runtime = createSalesRuntime();
    return NextResponse.json({ success: true, data: runtime.getMaskedSettings() });
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
    const runtime = createSalesRuntime();
    const masked = runtime.updateSettings(body);
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
    const runtime = createSalesRuntime();
    runtime.importSettings(body);
    return NextResponse.json({ success: true, message: "配置已导入" });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: errorMessage(e) },
      { status: 400 }
    );
  }
}

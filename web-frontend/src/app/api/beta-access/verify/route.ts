import { NextRequest, NextResponse } from "next/server";
import { betaAccessSessionView, redeemBetaToken } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const auth = redeemBetaToken(token);

  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: "Access pass is invalid." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      access: "granted",
      ...betaAccessSessionView(auth.session),
    },
  });
}

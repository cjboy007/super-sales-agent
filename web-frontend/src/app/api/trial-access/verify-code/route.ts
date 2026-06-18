import { NextRequest, NextResponse } from "next/server";
import {
  TRIAL_PRESENT_COOKIE,
  TRIAL_SESSION_COOKIE,
  maskTrialPhone,
  verifyTrialSmsCode,
} from "@/lib/runtime/trial-auth";

export const dynamic = "force-dynamic";

function requestIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
}

function statusForReason(reason: string): number {
  if (reason === "invalid_phone" || reason === "invalid_code") return 400;
  if (reason === "trial_disabled") return 503;
  return 403;
}

function sessionMaxAgeSeconds(expiresAt: string): number {
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return Math.max(0, seconds);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { phone?: unknown; code?: unknown };
  const phone = typeof body.phone === "string" ? body.phone : "";
  const code = typeof body.code === "string" ? body.code : "";
  const result = await verifyTrialSmsCode({ phone, code, ip: requestIp(request) });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.message,
        reason: result.reason,
        contactPhone: result.contactPhone,
      },
      { status: statusForReason(result.reason) }
    );
  }

  const maxAge = sessionMaxAgeSeconds(result.session.trialExpiresAt);
  const response = NextResponse.json({
    success: true,
    data: {
      access: "granted",
      phone: maskTrialPhone(result.session.phone),
      trialStartedAt: result.session.trialStartedAt,
      trialExpiresAt: result.session.trialExpiresAt,
      contactPhone: result.session.contactPhone,
      workspaces: result.session.workspaces,
      defaultWorkspace: result.session.workspaces[0] || null,
      wildcard: false,
    },
  });
  response.cookies.set(TRIAL_SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  response.cookies.set(TRIAL_PRESENT_COOKIE, "1", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return response;
}

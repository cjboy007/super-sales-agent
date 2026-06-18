import { NextRequest, NextResponse } from "next/server";
import { requestTrialSmsCode } from "@/lib/runtime/trial-auth";

export const dynamic = "force-dynamic";

function requestIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
}

function statusForReason(reason: string): number {
  if (reason === "invalid_phone") return 400;
  if (reason === "sms_unavailable" || reason === "trial_disabled") return 503;
  if (reason === "sms_cooldown" || reason === "sms_phone_daily_limit" || reason === "sms_ip_daily_limit") return 429;
  return 403;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { phone?: unknown };
  const phone = typeof body.phone === "string" ? body.phone : "";
  const result = await requestTrialSmsCode({ phone, ip: requestIp(request) });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.message,
        reason: result.reason,
        contactPhone: result.contactPhone,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      { status: statusForReason(result.reason) }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      phone: result.phone,
      expiresInSeconds: result.expiresInSeconds,
    },
  });
}

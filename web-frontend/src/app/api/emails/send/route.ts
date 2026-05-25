import { NextRequest, NextResponse } from "next/server";
import {
  emailSideEffectBlockedPayload,
  gateCustomerEmailSend,
} from "@/lib/customer-side-effects";
import { sendViaLocalSmtp } from "@/lib/email-delivery";

interface SendRequestBody {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
  approvalId?: string;
  approval_id?: string;
  requestedBy?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<SendRequestBody>;

    if (!body?.to || !body.subject || !body.body) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: to, subject, body" },
        { status: 400 }
      );
    }

    const decision = gateCustomerEmailSend({
      to: body.to,
      subject: body.subject,
      body: body.body,
      html: body.html,
      approvalId: body.approvalId,
      approval_id: body.approval_id,
      requestedBy: body.requestedBy,
      route: "web-frontend:/api/emails/send",
    });
    if (decision.gate.blocked) {
      return NextResponse.json(emailSideEffectBlockedPayload(decision.gate), { status: 403 });
    }
    const result = await sendViaLocalSmtp({
      to: body.to,
      subject: body.subject,
      body: decision.body,
      html: body.html || false,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      detail: result.detail,
      sent_at: result.sentAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Check for common error patterns
    if (message.includes("ENOTFOUND") || message.includes("ECONNREFUSED")) {
      return NextResponse.json(
        { success: false, error: "SMTP 连接失败，请检查邮件配置" },
        { status: 502 }
      );
    }
    if (message.includes("EAUTH") || message.includes("authentication")) {
      return NextResponse.json(
        { success: false, error: "SMTP 认证失败，请检查账号密码" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

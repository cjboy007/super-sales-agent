import { NextResponse } from "next/server";
import {
  emailSideEffectBlockedPayload,
  gateCustomerEmailSend,
} from "@/lib/customer-side-effects";
import { sendViaLocalSmtp } from "@/lib/email-delivery";

const FARREACH_URL = process.env.SSA_FARREACH_URL || "http://localhost:3456";

// POST /api/inbox/[emailId]/send — confirm and send only after SSA approval gate allows it.
export async function POST(
  req: Request,
  { params }: { params: { emailId: string } }
) {
  const { emailId } = params;
  const body = (await req.json()) as Partial<{
    to: string;
    subject: string;
    body: string;
    content: string;
    html: boolean;
    approvalId: string;
    approval_id: string;
    requestedBy: string;
  }>;
  const emailBody = body.body || body.content || "";

  if (!body?.to || !body.subject || !emailBody) {
    return NextResponse.json(
      { success: false, error: "Missing required fields: to, subject, body" },
      { status: 400 }
    );
  }

  const decision = gateCustomerEmailSend({
    to: body.to,
    subject: body.subject,
    body: emailBody,
    content: body.content,
    html: body.html,
    approvalId: body.approvalId,
    approval_id: body.approval_id,
    requestedBy: body.requestedBy,
    route: `web-frontend:/api/inbox/${emailId}/send`,
  });
  if (decision.gate.blocked) {
    return NextResponse.json(
      emailSideEffectBlockedPayload(decision.gate, { email_id: emailId }),
      { status: 403 }
    );
  }

  // Try farreach first
  try {
    const res = await fetch(`${FARREACH_URL}/api/v1/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: body.to,
        subject: body.subject,
        body: decision.body,
        html: body.html || false,
        approvalId: decision.approvalId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        success: true,
        email_id: emailId,
        sent_at: data.sentAt || new Date().toISOString(),
        to: body.to,
        subject: body.subject,
        message: data.detail || "Email sent successfully",
      });
    }
  } catch (error) {
    try {
      const fallback = await sendViaLocalSmtp({
        to: body.to,
        subject: body.subject,
        body: decision.body,
        html: body.html || false,
      });
      return NextResponse.json({
        success: true,
        fallback: true,
        email_id: emailId,
        sent_at: fallback.sentAt,
        to: body.to,
        subject: body.subject,
        message: fallback.detail,
        note: error instanceof Error ? error.message : String(error),
      });
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      return NextResponse.json(
        { success: false, email_id: emailId, error: `Email send failed: ${message}` },
        { status: 502 }
      );
    }
  }

  try {
    const fallback = await sendViaLocalSmtp({
      to: body.to,
      subject: body.subject,
      body: decision.body,
      html: body.html || false,
    });

    return NextResponse.json({
      success: true,
      fallback: true,
      email_id: emailId,
      sent_at: fallback.sentAt,
      to: body.to,
      subject: body.subject,
      message: fallback.detail,
      note: "Farreach send service returned an error; local SMTP fallback used.",
    });
  } catch (fallbackError) {
    const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    return NextResponse.json(
      { success: false, email_id: emailId, error: `Email send failed: ${message}` },
      { status: 502 }
    );
  }
}

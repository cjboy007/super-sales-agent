import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireWorkspaceAccess } from "@/lib/runtime/beta-auth";

export const dynamic = "force-dynamic";

interface SendRequestBody {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
  humanApproval?: {
    approved?: boolean;
    approvedBy?: string;
    approvedAt?: string;
    note?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: SendRequestBody = await request.json();
    const project = new URL(request.url).searchParams.get("project") || "farreach";
    const auth = requireWorkspaceAccess(request, project);
    if (!auth.ok) return auth.response;

    if (!body.to || !body.subject || !body.body) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: to, subject, body" },
        { status: 400 }
      );
    }

    const runtime = createSalesRuntime();
    const result = await runtime.sendEmail({
      workspaceId: project,
      to: body.to,
      subject: body.subject,
      body: body.body,
      html: body.html,
      humanApproval: body.humanApproval,
    });

    return NextResponse.json(result);
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

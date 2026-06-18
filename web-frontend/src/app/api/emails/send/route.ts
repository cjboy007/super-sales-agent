import { NextRequest, NextResponse } from "next/server";
import { createSalesRuntime } from "@/lib/runtime";
import { requireResolvedWorkspaceAccess } from "@/lib/runtime/beta-auth";
import { withPublicAction } from "../../public-action";

export const dynamic = "force-dynamic";

interface SendRequestBody {
  to: string;
  subject: string;
  body: string;
  html?: boolean;
  decisionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SendRequestBody = await request.json();
    const auth = requireResolvedWorkspaceAccess(request, body as unknown as Record<string, unknown>);
    if (!auth.ok) return auth.response;
    const project = auth.workspaceId;

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
      decisionId: body.decisionId,
    });

    return NextResponse.json(withPublicAction(result));
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

import { NextResponse } from "next/server";
import { generateRuntimeReplyDraft } from "@/lib/llm-runtime";
import { createAuditEvent, upsertDraftRecord } from "@/lib/db";

const FARREACH_URL = process.env.SSA_FARREACH_URL || "http://localhost:3456";

// POST /api/inbox/[emailId]/reply — generate AI reply draft.
// Farreach can enrich this route, but SSA must still work without that service.
export async function POST(
  req: Request,
  { params }: { params: { emailId: string } }
) {
  const { emailId } = params;
  const body = await req.json();
  let farreachError: string | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${FARREACH_URL}/api/v1/inbox/${emailId}/reply`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: emailId,
        from: body.from || "",
        subject: body.subject || "",
        body: body.body || body.content || "",
        language: body.language || "en",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.draft) {
        const draft = data.draft as {
          draftId?: string;
          subject?: string;
          source?: string;
          createdAt?: string;
          note?: string;
        };
        upsertDraftRecord({
          id: draft.draftId || `DRAFT-${emailId}-${Date.now()}`,
          subject: draft.subject || body.subject || "",
          template: draft.source || "farreach",
          body: JSON.stringify(draft),
          status: "draft",
          source: draft.source || "farreach",
          metadata: {
            emailId,
            source: draft.source || "farreach",
            note: draft.note || null,
          },
        });
        createAuditEvent({
          type: "draft_generated",
          actor: "web-frontend",
          target: emailId,
          summary: `Reply draft generated via ${draft.source || "farreach"}`,
          metadata: { source: draft.source || "farreach", fallback: false },
        });
      }
      return NextResponse.json(data);
    }
    farreachError = `Farreach reply service returned ${res.status}`;
  } catch (error) {
    farreachError = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
  }

  const draft = await generateRuntimeReplyDraft({
    emailId,
    from: body.from || "",
    subject: body.subject || "",
    body: body.body || body.content || "",
    language: body.language || "en",
  });

  upsertDraftRecord({
    id: draft.draftId,
    subject: draft.subject,
    template: draft.source,
    body: JSON.stringify(draft),
    status: "draft",
    source: draft.source,
    metadata: {
      emailId,
      fallback: true,
      note: draft.note || null,
    },
  });
  createAuditEvent({
    type: "draft_generated",
    actor: "web-frontend",
    target: emailId,
    summary: `Reply draft generated via ${draft.source}`,
    metadata: { source: draft.source, fallback: true },
  });

  return NextResponse.json({
    success: true,
    fallback: true,
    source: draft.source,
    draft,
    note: farreachError
      ? `Farreach unavailable; generated through ${draft.source}.`
      : undefined,
  });
}

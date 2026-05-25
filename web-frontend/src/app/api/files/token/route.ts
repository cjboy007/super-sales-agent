import { NextRequest, NextResponse } from "next/server";
import { registerFile, sweepExpiredTokens } from "@/lib/file-registry";

/**
 * POST /api/files/token
 *
 * Accepts { path: string } and returns a short-lived file access token.
 * The server validates the path against allowed directories — the client
 * never sees or sends absolute paths to the download endpoint.
 */
export async function POST(request: NextRequest) {
  sweepExpiredTokens();

  let body: { path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.path) {
    return NextResponse.json({ error: "Missing 'path' in request body" }, { status: 400 });
  }

  const result = registerFile(body.path);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 403 });
  }

  return NextResponse.json({
    token: result.token,
    fileName: result.entry.fileName,
    contentType: result.entry.contentType,
    size: result.entry.size,
  });
}

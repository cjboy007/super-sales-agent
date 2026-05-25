import { NextRequest, NextResponse } from "next/server";

/**
 * SSA API Authentication Middleware
 *
 * All /api/* routes require a valid X-API-Key header except:
 *   - GET /api/health (public health check)
 *   - Development mode (SSA_API_KEY not set = open access for local dev)
 *
 * The API key is read from SSA_API_KEY environment variable.
 * When SSA_API_KEY is set, all non-public requests must include it.
 */

const PUBLIC_PATHS = ["/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const expectedKey = process.env.SSA_API_KEY;

  // No key configured = development mode, allow all requests
  if (!expectedKey) {
    return NextResponse.next();
  }

  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

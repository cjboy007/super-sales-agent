import { NextRequest, NextResponse } from "next/server";
import { betaAccessRequiredForPageRuntime, trialAccessRequiredForPageRuntime, validatePageBetaToken } from "@/lib/runtime/beta-auth-edge";

const PUBLIC_FILE = /\.(?:ico|png|jpg|jpeg|svg|webp|gif|css|js|txt|xml|webmanifest)$/i;

function isPageRequest(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_next/")) return false;
  if (pathname === "/beta-access") return false;
  if (pathname === "/user-guide") return false;
  if (PUBLIC_FILE.test(pathname)) return false;
  return true;
}

export function middleware(request: NextRequest) {
  if (!betaAccessRequiredForPageRuntime()) return NextResponse.next();
  if (!isPageRequest(request.nextUrl.pathname)) return NextResponse.next();

  const token = request.cookies.get("ssa-beta-token")?.value || "";
  const trialToken = request.cookies.get("ssa-trial-session")?.value || "";
  if (trialAccessRequiredForPageRuntime() && trialToken.trim()) return NextResponse.next();
  if (validatePageBetaToken(token)) return NextResponse.next();

  const redirectUrl = request.nextUrl.clone();
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    redirectUrl.host = forwardedHost;
    if (!forwardedHost.includes(":")) redirectUrl.port = "";
  }
  if (forwardedProto === "http" || forwardedProto === "https") redirectUrl.protocol = `${forwardedProto}:`;
  redirectUrl.pathname = "/beta-access";
  redirectUrl.search = "";
  redirectUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|brand).*)"],
};

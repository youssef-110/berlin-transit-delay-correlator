import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_API = ["/api/auth/login", "/api/auth/register", "/api/health", "/api/cron"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF defense-in-depth (in addition to SameSite=Strict): mutating API calls
  // must originate from our own origin.
  if (pathname.startsWith("/api/") && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
    }
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.some((p) => pathname.startsWith(p))) return NextResponse.next();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard") && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if ((pathname === "/login" || pathname === "/register") && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/api/:path*"],
};

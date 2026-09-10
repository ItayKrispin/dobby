import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "dobby_dash_auth";

export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/dev/") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/login") ||
    pathname === "/" ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.json"
  ) {
    return NextResponse.next();
  }

  const needsAuth =
    pathname.startsWith("/dashboard") || pathname.startsWith("/api/");

  if (!needsAuth) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie === password) {
    return NextResponse.next();
  }

  const basic = request.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    try {
      const decoded = atob(basic.slice(6));
      const [, pass] = decoded.split(":");
      if (pass === password) {
        return NextResponse.next();
      }
    } catch {
      // fall through
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/login"],
};

import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "dobby_dash_auth";

function isAuthorized(request: NextRequest, password: string) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie === password) return true;

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const [, pass] = decoded.split(":");
      if (pass === password) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) {
    return NextResponse.json(
      { ok: false, error: "DASHBOARD_PASSWORD is not configured" },
      { status: 400 },
    );
  }

  const body = (await request.json()) as { password?: string };
  if (!body.password || body.password !== password) {
    return NextResponse.json({ ok: false, error: "סיסמה שגויה" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, password, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export { isAuthorized, COOKIE_NAME };

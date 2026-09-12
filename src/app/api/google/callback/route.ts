import { NextRequest, NextResponse } from "next/server";
import { handleGoogleOAuthCallback } from "@/lib/google/auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/dashboard/business?gcal=error&reason=${oauthError}`, request.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard/business?gcal=error&reason=missing_code", request.url),
    );
  }

  try {
    await handleGoogleOAuthCallback(code);
    return NextResponse.redirect(
      new URL("/dashboard/business?gcal=connected", request.url),
    );
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/business?gcal=error&reason=callback_failed", request.url),
    );
  }
}

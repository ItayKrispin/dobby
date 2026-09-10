import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google/auth";

export async function GET() {
  try {
    const url = getGoogleAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Google auth start error:", error);
    return NextResponse.json(
      { ok: false, error: "Google OAuth is not configured" },
      { status: 500 },
    );
  }
}

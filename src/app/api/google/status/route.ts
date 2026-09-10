import { NextResponse } from "next/server";
import { getGoogleCalendarStatus } from "@/lib/google/auth";

export async function GET() {
  try {
    const status = await getGoogleCalendarStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    console.error("Google status error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load Google Calendar status" },
      { status: 500 },
    );
  }
}

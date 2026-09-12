import { NextRequest, NextResponse } from "next/server";
import { flushDueReminders } from "@/lib/reminders";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");

  if (secret) {
    const bearerOk = auth === `Bearer ${secret}`;
    const queryOk = querySecret === secret;
    if (!bearerOk && !queryOk) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const sent = await flushDueReminders();
    return NextResponse.json({ ok: true, remindersSent: sent });
  } catch (error) {
    console.error("Cron tick error:", error);
    return NextResponse.json(
      { ok: false, error: "Cron tick failed" },
      { status: 500 },
    );
  }
}

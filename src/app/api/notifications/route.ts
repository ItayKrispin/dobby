import { NextRequest, NextResponse } from "next/server";
import {
  countUnreadNotifications,
  listOwnerNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications";
import { flushDueReminders } from "@/lib/reminders";

export async function GET(request: NextRequest) {
  try {
    // Opportunistic reminder flush so local/dev works without cron.
    try {
      await flushDueReminders();
    } catch (flushError) {
      console.error("Reminder flush on notifications list failed:", flushError);
    }

    const unreadOnly =
      request.nextUrl.searchParams.get("unread") === "1" ||
      request.nextUrl.searchParams.get("unread") === "true";
    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 50;

    const [notifications, unreadCount] = await Promise.all([
      listOwnerNotifications({ limit, unreadOnly }),
      countUnreadNotifications(),
    ]);

    return NextResponse.json({
      ok: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("List notifications error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to list notifications" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { markAllRead?: boolean };
    if (!body.markAllRead) {
      return NextResponse.json(
        { ok: false, error: "markAllRead is required" },
        { status: 400 },
      );
    }

    const updated = await markAllNotificationsRead();
    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to mark notifications read" },
      { status: 500 },
    );
  }
}

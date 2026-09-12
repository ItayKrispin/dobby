import { NextRequest, NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const notification = await markNotificationRead(id);
    if (!notification) {
      return NextResponse.json(
        { ok: false, error: "Notification not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, notification });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to mark notification read" },
      { status: 500 },
    );
  }
}

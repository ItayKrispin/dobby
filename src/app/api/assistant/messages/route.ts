import { NextResponse } from "next/server";
import { listOwnerAssistantMessages } from "@/lib/owner-assistant";

export async function GET() {
  try {
    const messages = await listOwnerAssistantMessages();
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    console.error("List assistant messages error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load assistant messages",
      },
      { status: 500 },
    );
  }
}

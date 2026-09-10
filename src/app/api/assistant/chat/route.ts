import { NextRequest, NextResponse } from "next/server";
import { ownerChat } from "@/lib/ai/owner-chat";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "message is required" },
        { status: 400 },
      );
    }

    const reply = await ownerChat(message);
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    console.error("Owner assistant chat error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to process assistant message",
      },
      { status: 500 },
    );
  }
}

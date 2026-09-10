import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/ai/chat";

type DevChatRequest = {
  phone?: string;
  message?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DevChatRequest;
    const phone = body.phone?.trim();
    const message = body.message?.trim();

    if (!phone || !message) {
      return NextResponse.json(
        {
          ok: false,
          error: "Request must include non-empty phone and message fields",
        },
        { status: 400 },
      );
    }

    const reply = await chat(phone, message);

    return NextResponse.json({
      ok: true,
      phone,
      message,
      reply,
    });
  } catch (error) {
    console.error("Dev chat route error:", error);
    return NextResponse.json({ ok: false, error: "Failed to process chat" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { saveMessage } from "@/lib/conversations";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

type Params = {
  params: Promise<{ phone: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { phone: rawPhone } = await params;
    const phone = decodeURIComponent(rawPhone);
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "message is required" },
        { status: 400 },
      );
    }

    await sendWhatsAppMessage(phone, message);
    await saveMessage(phone, "owner", message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Owner reply error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to send owner reply" },
      { status: 500 },
    );
  }
}

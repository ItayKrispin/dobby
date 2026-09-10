import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/ai/chat";
import { isAiPaused, saveMessage } from "@/lib/conversations";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import {
  applyWhatsAppLocation,
  storeWhatsAppImage,
} from "@/lib/whatsapp/media";

type WhatsAppInbound = {
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };
};

function extractMessage(payload: unknown): WhatsAppInbound | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const entry = (payload as { entry?: unknown[] }).entry?.[0];
  const changes =
    entry && typeof entry === "object"
      ? (entry as { changes?: unknown[] }).changes?.[0]
      : null;
  const value =
    changes && typeof changes === "object"
      ? (changes as { value?: unknown }).value
      : null;
  const messages =
    value && typeof value === "object"
      ? (value as { messages?: unknown[] }).messages
      : null;
  const firstMessage = messages?.[0];

  if (!firstMessage || typeof firstMessage !== "object") {
    return null;
  }

  return firstMessage as WhatsAppInbound;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ ok: false, error: "Verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const message = extractMessage(payload);

    if (!message?.from || !message.type) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const phone = message.from;
    const paused = await isAiPaused(phone);

    if (message.type === "image" && message.image?.id) {
      await storeWhatsAppImage({
        phone,
        mediaId: message.image.id,
        caption: message.image.caption,
      });
      const note = message.image.caption?.trim()
        ? `[הלקוח שלח תמונה] ${message.image.caption.trim()}`
        : "[הלקוח שלח תמונה]";
      if (paused) {
        await saveMessage(phone, "user", note);
        return NextResponse.json({ ok: true, paused: true, image: true });
      }
      const reply = await chat(phone, note);
      await sendWhatsAppMessage(phone, reply);
      return NextResponse.json({ ok: true, image: true });
    }

    if (
      message.type === "location" &&
      typeof message.location?.latitude === "number" &&
      typeof message.location?.longitude === "number"
    ) {
      await applyWhatsAppLocation({
        phone,
        latitude: message.location.latitude,
        longitude: message.location.longitude,
        name: message.location.name,
        address: message.location.address,
      });
      const note = `[הלקוח שלח מיקום] ${
        message.location.address ||
        message.location.name ||
        `${message.location.latitude}, ${message.location.longitude}`
      }`;
      if (paused) {
        await saveMessage(phone, "user", note);
        return NextResponse.json({ ok: true, paused: true, location: true });
      }
      const reply = await chat(phone, note);
      await sendWhatsAppMessage(phone, reply);
      return NextResponse.json({ ok: true, location: true });
    }

    if (message.type !== "text" || !message.text?.body) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const text = message.text.body;

    if (paused) {
      await saveMessage(phone, "user", text);
      return NextResponse.json({ ok: true, paused: true });
    }

    const reply = await chat(phone, text);
    await sendWhatsAppMessage(phone, reply);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json({ ok: false, error: "Webhook processing failed" }, { status: 500 });
  }
}

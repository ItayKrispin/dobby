import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/ai/chat";
import {
  getCustomerName,
  getOrCreateConversation,
  isAiPaused,
  saveMessage,
} from "@/lib/conversations";
import { createPausedMessageNotification } from "@/lib/notifications";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import {
  claimWhatsAppMessage,
  releaseWhatsAppMessageClaim,
} from "@/lib/whatsapp/dedupe";
import {
  applyWhatsAppLocation,
  storeWhatsAppImage,
} from "@/lib/whatsapp/media";

type WhatsAppInbound = {
  id?: string;
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

/** Serialize inbound processing per phone so burst messages don't race on draft. */
const phoneQueues = new Map<string, Promise<void>>();

function enqueueForPhone(phone: string, task: () => Promise<void>) {
  const previous = phoneQueues.get(phone) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (phoneQueues.get(phone) === next) {
        phoneQueues.delete(phone);
      }
    });
  phoneQueues.set(phone, next);
  return next;
}

/**
 * WhatsApp delivers multi-image albums as separate webhook events milliseconds
 * apart. Buffer briefly so we store all media, then run one AI turn / one reply.
 */
type PhoneCoalesceBuffer = {
  messages: WhatsAppInbound[];
  waMessageIds: string[];
  resolvers: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }>;
  timer: ReturnType<typeof setTimeout> | null;
};

const coalesceBuffers = new Map<string, PhoneCoalesceBuffer>();

function coalesceDelayMs(messages: WhatsAppInbound[]) {
  const hasMedia = messages.some(
    (message) => message.type === "image" || message.type === "location",
  );
  return hasMedia ? 2000 : 800;
}

function extractMessages(payload: unknown): WhatsAppInbound[] {
  if (!payload || typeof payload !== "object") {
    return [];
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

  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.filter(
    (item): item is WhatsAppInbound =>
      Boolean(item) && typeof item === "object",
  );
}

async function notifyPausedInbound(phone: string, preview: string) {
  try {
    const conversation = await getOrCreateConversation(phone);
    const customerName = await getCustomerName(phone);
    await createPausedMessageNotification({
      phone,
      conversationId: conversation.id,
      customerName,
      preview,
    });
  } catch (error) {
    console.error("Failed to create paused message notification:", error);
  }
}

function buildImageNote(imageCount: number, captions: string[]) {
  const captionBlock = captions.join("\n").trim();
  const prefix =
    imageCount > 1
      ? `[הלקוח שלח ${imageCount} תמונות]`
      : "[הלקוח שלח תמונה]";
  return captionBlock ? `${prefix} ${captionBlock}` : prefix;
}

/**
 * Materialize side effects (media / location) and build a single user-facing
 * note for the model from a coalesced burst.
 */
async function prepareBatch(
  phone: string,
  messages: WhatsAppInbound[],
): Promise<{ note: string | null; kind: "chat" | "voice" | "empty" }> {
  const textParts: string[] = [];
  const captions: string[] = [];
  let imageCount = 0;
  let hadVoice = false;

  for (const message of messages) {
    if (message.type === "image" && message.image?.id) {
      await storeWhatsAppImage({
        phone,
        mediaId: message.image.id,
        caption: message.image.caption,
      });
      imageCount += 1;
      if (message.image.caption?.trim()) {
        captions.push(message.image.caption.trim());
      }
      continue;
    }

    if (message.type === "audio" || message.type === "voice") {
      hadVoice = true;
      continue;
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
      textParts.push(
        `[הלקוח שלח מיקום] ${
          message.location.address ||
          message.location.name ||
          `${message.location.latitude}, ${message.location.longitude}`
        }`,
      );
      continue;
    }

    if (message.type === "text" && message.text?.body) {
      textParts.push(message.text.body);
    }
  }

  if (imageCount > 0) {
    textParts.unshift(buildImageNote(imageCount, captions));
  }

  const note = textParts.join("\n").trim();
  if (note) {
    return { note, kind: "chat" };
  }
  if (hadVoice) {
    return { note: "[הלקוח שלח הודעת קול]", kind: "voice" };
  }
  return { note: null, kind: "empty" };
}

async function processInboundBatch(phone: string, messages: WhatsAppInbound[]) {
  if (messages.length === 0) return;

  const paused = await isAiPaused(phone);
  const prepared = await prepareBatch(phone, messages);

  if (prepared.kind === "empty" || !prepared.note) {
    return;
  }

  if (paused) {
    await saveMessage(phone, "user", prepared.note);
    await notifyPausedInbound(phone, prepared.note);
    return;
  }

  if (prepared.kind === "voice") {
    await saveMessage(phone, "user", prepared.note);
    const reply =
      "אני לא יכול להקשיב להקלטות בשלב הזה, תוכל לכתוב לי?";
    await saveMessage(phone, "assistant", reply);
    try {
      await sendWhatsAppMessage(phone, reply);
    } catch (sendError) {
      console.error("Voice fallback WhatsApp send failed:", sendError);
    }
    return;
  }

  const reply = await chat(phone, prepared.note);
  await sendWhatsAppMessage(phone, reply);
}

async function flushCoalesceBuffer(phone: string) {
  const buffer = coalesceBuffers.get(phone);
  if (!buffer) return;

  coalesceBuffers.delete(phone);
  if (buffer.timer) {
    clearTimeout(buffer.timer);
    buffer.timer = null;
  }

  const { messages, waMessageIds, resolvers } = buffer;

  try {
    await enqueueForPhone(phone, () => processInboundBatch(phone, messages));
    for (const entry of resolvers) {
      entry.resolve();
    }
  } catch (error) {
    for (const id of waMessageIds) {
      await releaseWhatsAppMessageClaim(id);
    }
    for (const entry of resolvers) {
      entry.reject(error);
    }
  }
}

/**
 * Hold the Next.js `after()` callback open until the debounce window ends and
 * the batch is processed (otherwise the timer would be killed early).
 */
function enqueueCoalesced(
  phone: string,
  message: WhatsAppInbound,
  waMessageId?: string,
): Promise<void> {
  let buffer = coalesceBuffers.get(phone);
  if (!buffer) {
    buffer = {
      messages: [],
      waMessageIds: [],
      resolvers: [],
      timer: null,
    };
    coalesceBuffers.set(phone, buffer);
  }

  buffer.messages.push(message);
  if (waMessageId) {
    buffer.waMessageIds.push(waMessageId);
  }

  return new Promise<void>((resolve, reject) => {
    buffer!.resolvers.push({ resolve, reject });
    if (buffer!.timer) {
      clearTimeout(buffer!.timer);
    }
    const delay = coalesceDelayMs(buffer!.messages);
    buffer!.timer = setTimeout(() => {
      void flushCoalesceBuffer(phone);
    }, delay);
  });
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

  return NextResponse.json(
    { ok: false, error: "Verification failed" },
    { status: 403 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const messages = extractMessages(payload);

    if (messages.length === 0) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const claimed: Array<{ message: WhatsAppInbound; waMessageId?: string }> =
      [];

    for (const message of messages) {
      if (!message.from || !message.type) {
        continue;
      }
      const waMessageId = message.id?.trim();
      if (waMessageId) {
        const ok = await claimWhatsAppMessage(waMessageId, message.from);
        if (!ok) {
          continue;
        }
      }
      claimed.push({ message, waMessageId });
    }

    if (claimed.length === 0) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Ack Meta immediately; process in the background so slow Gemini
    // turns don't trigger webhook retries (which duplicated messages).
    after(async () => {
      await Promise.all(
        claimed.map(async ({ message, waMessageId }) => {
          try {
            await enqueueCoalesced(message.from!, message, waMessageId);
          } catch (error) {
            console.error("WhatsApp inbound processing error:", error);
            if (waMessageId) {
              await releaseWhatsAppMessageClaim(waMessageId);
            }
          }
        }),
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json(
      { ok: false, error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}

const WHATSAPP_BASE_URL = "https://graph.facebook.com/v21.0";

function getWhatsAppConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      "Missing WhatsApp env vars: WHATSAPP_ACCESS_TOKEN and/or WHATSAPP_PHONE_NUMBER_ID",
    );
  }

  return { accessToken, phoneNumberId };
}

export async function sendWhatsAppMessage(to: string, text: string) {
  const { accessToken, phoneNumberId } = getWhatsAppConfig();

  const response = await fetch(`${WHATSAPP_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${errorBody}`);
  }

  return response.json();
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{
  buffer: ArrayBuffer;
  mimeType: string;
}> {
  const { accessToken } = getWhatsAppConfig();

  const metaRes = await fetch(`${WHATSAPP_BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to resolve WhatsApp media: ${metaRes.status}`);
  }

  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) {
    throw new Error("WhatsApp media URL missing");
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileRes.ok) {
    throw new Error(`Failed to download WhatsApp media: ${fileRes.status}`);
  }

  return {
    buffer: await fileRes.arrayBuffer(),
    mimeType: meta.mime_type || fileRes.headers.get("content-type") || "image/jpeg",
  };
}

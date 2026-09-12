import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOrCreateConversation,
  incrementDraftPhotoCount,
  updateJobDraft,
} from "@/lib/conversations";
import { findLatestOpenJobId } from "@/lib/jobs";
import { downloadWhatsAppMedia } from "@/lib/whatsapp/client";

function extensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

export async function storeWhatsAppImage(options: {
  phone: string;
  mediaId: string;
  caption?: string | null;
}) {
  const conversation = await getOrCreateConversation(options.phone);
  const { buffer, mimeType } = await downloadWhatsAppMedia(options.mediaId);
  const supabase = createAdminClient();
  const ext = extensionForMime(mimeType);
  const path = `${conversation.id}/${Date.now()}-${options.mediaId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("job-photos")
    .upload(path, Buffer.from(buffer), {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload photo: ${uploadError.message}`);
  }

  const openJobId = await findLatestOpenJobId(conversation.id);

  const { error: insertError } = await supabase.from("job_media").insert({
    conversation_id: conversation.id,
    job_id: openJobId,
    storage_path: path,
    mime_type: mimeType,
    whatsapp_media_id: options.mediaId,
  });

  if (insertError) {
    throw new Error(`Failed to save media row: ${insertError.message}`);
  }

  // Only bump draft photo count when photos are still for the in-progress intake.
  if (!openJobId) {
    await incrementDraftPhotoCount(options.phone);
  }

  return {
    path,
    mimeType,
    caption: options.caption?.trim() || null,
    jobId: openJobId,
  };
}

export async function applyWhatsAppLocation(options: {
  phone: string;
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
}) {
  const addressParts = [options.name, options.address]
    .map((part) => part?.trim())
    .filter(Boolean);
  const addressText =
    addressParts.join(", ") ||
    `מיקום: ${options.latitude.toFixed(5)}, ${options.longitude.toFixed(5)}`;

  return updateJobDraft(options.phone, {
    address: addressText,
    locationLat: options.latitude,
    locationLng: options.longitude,
  });
}

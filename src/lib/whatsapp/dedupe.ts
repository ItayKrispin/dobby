import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Atomically claim a WhatsApp message id so concurrent webhook retries
 * (Meta re-delivers if the first handler is slow) only process once.
 * Returns true if this invocation owns the message.
 */
export async function claimWhatsAppMessage(
  waMessageId: string,
  phone?: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("processed_whatsapp_messages").insert({
    wa_message_id: waMessageId,
    phone: phone ?? null,
  });

  if (!error) return true;

  // Unique violation — already claimed
  if (error.code === "23505") return false;

  throw new Error(`Failed to claim WhatsApp message: ${error.message}`);
}

/** Release claim so Meta can safely retry after a processing failure. */
export async function releaseWhatsAppMessageClaim(waMessageId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("processed_whatsapp_messages")
    .delete()
    .eq("wa_message_id", waMessageId);

  if (error) {
    console.error("Failed to release WhatsApp message claim:", error.message);
  }
}

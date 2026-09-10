import { createAdminClient } from "@/lib/supabase/admin";

export type OwnerAssistantRole = "owner" | "assistant";

export type OwnerAssistantMessage = {
  id: string;
  role: OwnerAssistantRole;
  content: string;
  created_at: string;
};

const MAX_HISTORY_MESSAGES = 30;

export async function listOwnerAssistantMessages(): Promise<
  OwnerAssistantMessage[]
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("owner_assistant_messages")
    .select("id, role, content, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load assistant messages: ${error.message}`);
  }

  return (data ?? []) as OwnerAssistantMessage[];
}

export async function loadOwnerAssistantHistory(): Promise<
  { role: OwnerAssistantRole; content: string }[]
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("owner_assistant_messages")
    .select("role, content")
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (error) {
    throw new Error(`Failed to load assistant history: ${error.message}`);
  }

  return (data ?? [])
    .reverse()
    .map((row) => ({
      role: row.role as OwnerAssistantRole,
      content: row.content,
    }));
}

export async function saveOwnerAssistantExchange(
  ownerMessage: string,
  assistantMessage: string,
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("owner_assistant_messages").insert([
    { role: "owner", content: ownerMessage },
    { role: "assistant", content: assistantMessage },
  ]);

  if (error) {
    throw new Error(`Failed to save assistant exchange: ${error.message}`);
  }
}

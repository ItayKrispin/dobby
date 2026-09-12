import { createAdminClient } from "@/lib/supabase/admin";

export type ChatRole = "user" | "assistant";
export type MessageRole = ChatRole | "owner";

export type ChatMessage = {
  role: MessageRole;
  content: string;
};

export type JobDraft = {
  problem: string | null;
  isEmergency: boolean | null;
  address: string | null;
  availability: string | null;
  jobType: string | null;
  locationLat: number | null;
  locationLng: number | null;
  photoCount: number;
};

const MAX_HISTORY_MESSAGES = 20;

function isMissingSchemaError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    /pinned_at|owner_notifications|job_reminders|schema cache/i.test(message)
  );
}

function previewOf(content: string) {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function mapJobDraft(row: {
  draft_problem: string | null;
  draft_is_emergency: boolean | null;
  draft_address: string | null;
  draft_availability: string | null;
  draft_job_type: string | null;
  draft_location_lat: number | null;
  draft_location_lng: number | null;
  draft_photo_count: number | null;
}): JobDraft {
  return {
    problem: row.draft_problem,
    isEmergency: row.draft_is_emergency,
    address: row.draft_address,
    availability: row.draft_availability,
    jobType: row.draft_job_type,
    locationLat: row.draft_location_lat,
    locationLng: row.draft_location_lng,
    photoCount: row.draft_photo_count ?? 0,
  };
}

export async function getOrCreateConversation(phone: string) {
  const supabase = createAdminClient();

  const { data: existing, error: selectError } = await supabase
    .from("conversations")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to load conversation: ${selectError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from("conversations")
    .insert({ phone })
    .select("*")
    .single();

  // Parallel chat loaders can race on first message — unique phone is fine.
  if (insertError?.code === "23505") {
    const { data: raced, error: retryError } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    if (retryError || !raced) {
      throw new Error(
        `Failed to load conversation after race: ${retryError?.message ?? "unknown error"}`,
      );
    }
    return raced;
  }

  if (insertError || !created) {
    throw new Error(
      `Failed to create conversation: ${insertError?.message ?? "unknown error"}`,
    );
  }

  return created;
}

export async function isAiPaused(phone: string) {
  const conversation = await getOrCreateConversation(phone);
  return Boolean(conversation.ai_paused);
}

export async function setAiPaused(phone: string, paused: boolean) {
  const conversation = await getOrCreateConversation(phone);
  const supabase = createAdminClient();

  // Keep paused_at on resume so the UI can mark the last handoff boundary.
  const patch = paused
    ? { ai_paused: true, paused_at: new Date().toISOString() }
    : { ai_paused: false };

  const { data, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", conversation.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update pause state: ${error?.message}`);
  }

  return data;
}

export async function saveMessage(
  phone: string,
  role: MessageRole,
  content: string,
) {
  const conversation = await getOrCreateConversation(phone);
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role,
    content,
  });

  if (insertError) {
    throw new Error(`Failed to save message: ${insertError.message}`);
  }

  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      last_message_preview: previewOf(content),
    })
    .eq("id", conversation.id);

  if (updateError) {
    throw new Error(`Failed to update conversation: ${updateError.message}`);
  }
}

export async function loadRecentHistory(phone: string): Promise<ChatMessage[]> {
  const conversation = await getOrCreateConversation(phone);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .in("role", ["user", "assistant", "owner"])
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (error) {
    throw new Error(`Failed to load history: ${error.message}`);
  }

  return (data ?? [])
    .reverse()
    .map((row) => ({
      role: row.role as MessageRole,
      content: row.content,
    }));
}

export async function saveExchange(
  phone: string,
  userMessage: string,
  assistantMessage: string,
) {
  await saveMessage(phone, "user", userMessage);
  await saveMessage(phone, "assistant", assistantMessage);
}

export async function listConversations() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("last_message_at", { ascending: false });

  if (error) {
    // Fallback while migration 00007 is not yet applied.
    if (/pinned_at/i.test(error.message) || isMissingSchemaError(error)) {
      const fallback = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (fallback.error) {
        throw new Error(`Failed to list conversations: ${fallback.error.message}`);
      }
      return fallback.data ?? [];
    }
    throw new Error(`Failed to list conversations: ${error.message}`);
  }

  return data ?? [];
}

const MAX_PINNED_CONVERSATIONS = 3;

export async function setConversationPinned(phone: string, pinned: boolean) {
  const conversation = await getOrCreateConversation(phone);
  const supabase = createAdminClient();

  if (pinned) {
    if (conversation.pinned_at) {
      return { ok: true as const, conversation };
    }

    const { data: rows, error: countError } = await supabase
      .from("conversations")
      .select("*");

    if (countError) {
      throw new Error(`Failed to count pinned conversations: ${countError.message}`);
    }

    const pinnedCount = (rows ?? []).filter((row) =>
      Boolean((row as { pinned_at?: string | null }).pinned_at),
    ).length;
    if (pinnedCount >= MAX_PINNED_CONVERSATIONS) {
      return {
        ok: false as const,
        error: "אפשר לנעוץ עד 3 שיחות",
        code: "PIN_LIMIT" as const,
      };
    }
  }

  const { data, error } = await supabase
    .from("conversations")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", conversation.id)
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingSchemaError(error) || /pinned_at|PGRST204|schema cache/i.test(error?.message ?? error?.code ?? "")) {
      return {
        ok: false as const,
        error: "יש להריץ את מיגרציה 00007_owner_ux_upgrades.sql",
        code: "MIGRATION_REQUIRED" as const,
      };
    }
    // PostgREST sometimes returns empty message for unknown columns.
    if (error && !data) {
      return {
        ok: false as const,
        error: "יש להריץ את מיגרציה 00007_owner_ux_upgrades.sql",
        code: "MIGRATION_REQUIRED" as const,
      };
    }
    throw new Error(`Failed to update pin state: ${error?.message}`);
  }

  return { ok: true as const, conversation: data };
}

export async function getCustomerName(phone: string): Promise<string | null> {
  const conversation = await getOrCreateConversation(phone);
  return conversation.customer_name?.trim() || null;
}

export async function setCustomerName(phone: string, name: string | null) {
  const conversation = await getOrCreateConversation(phone);
  const supabase = createAdminClient();
  const next = name?.trim() || null;

  const { data, error } = await supabase
    .from("conversations")
    .update({ customer_name: next })
    .eq("id", conversation.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update customer name: ${error?.message}`);
  }

  return data;
}

export async function getOwnerNotes(phone: string): Promise<string | null> {
  const conversation = await getOrCreateConversation(phone);
  return conversation.owner_notes?.trim() || null;
}

export async function setOwnerNotes(phone: string, notes: string | null) {
  const conversation = await getOrCreateConversation(phone);
  const supabase = createAdminClient();
  const next = notes?.trim() || null;

  const { data, error } = await supabase
    .from("conversations")
    .update({ owner_notes: next })
    .eq("id", conversation.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update owner notes: ${error?.message}`);
  }

  return data;
}

export async function findCustomers(query: string) {
  const supabase = createAdminClient();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select("id, phone, customer_name, last_message_at, owner_notes")
    .or(
      `phone.ilike.%${trimmed}%,customer_name.ilike.%${trimmed}%`,
    )
    .order("last_message_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to find customers: ${error.message}`);
  }

  return data ?? [];
}

export async function getJobDraft(phone: string): Promise<JobDraft> {
  const conversation = await getOrCreateConversation(phone);
  return mapJobDraft(conversation);
}

export async function updateJobDraft(
  phone: string,
  patch: {
    problem?: string | null;
    isEmergency?: boolean | null;
    address?: string | null;
    availability?: string | null;
    jobType?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
    photoCount?: number;
  },
): Promise<JobDraft> {
  const conversation = await getOrCreateConversation(phone);
  const supabase = createAdminClient();

  const next: {
    draft_problem?: string | null;
    draft_is_emergency?: boolean | null;
    draft_address?: string | null;
    draft_availability?: string | null;
    draft_job_type?: string | null;
    draft_location_lat?: number | null;
    draft_location_lng?: number | null;
    draft_photo_count?: number;
  } = {};

  if (patch.problem !== undefined) {
    next.draft_problem = patch.problem?.trim() || null;
  }
  if (patch.isEmergency !== undefined) {
    next.draft_is_emergency = patch.isEmergency;
  }
  if (patch.address !== undefined) {
    next.draft_address = patch.address?.trim() || null;
  }
  if (patch.availability !== undefined) {
    next.draft_availability = patch.availability?.trim() || null;
  }
  if (patch.jobType !== undefined) {
    next.draft_job_type = patch.jobType?.trim() || null;
  }
  if (patch.locationLat !== undefined) {
    next.draft_location_lat = patch.locationLat;
  }
  if (patch.locationLng !== undefined) {
    next.draft_location_lng = patch.locationLng;
  }
  if (patch.photoCount !== undefined) {
    next.draft_photo_count = Math.max(0, Math.floor(patch.photoCount));
  }

  if (Object.keys(next).length === 0) {
    return mapJobDraft(conversation);
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(next)
    .eq("id", conversation.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update job draft: ${error?.message}`);
  }

  return mapJobDraft(data);
}

export async function clearJobDraft(phone: string) {
  const conversation = await getOrCreateConversation(phone);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("conversations")
    .update({
      draft_problem: null,
      draft_is_emergency: null,
      draft_address: null,
      draft_availability: null,
      draft_job_type: null,
      draft_location_lat: null,
      draft_location_lng: null,
      draft_photo_count: 0,
    })
    .eq("id", conversation.id);

  if (error) {
    throw new Error(`Failed to clear job draft: ${error.message}`);
  }
}

export async function incrementDraftPhotoCount(phone: string) {
  const draft = await getJobDraft(phone);
  return updateJobDraft(phone, { photoCount: draft.photoCount + 1 });
}

export async function listContacts() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("conversations")
    .select("id, phone, customer_name, last_message_at, created_at")
    .order("customer_name", { ascending: true, nullsFirst: false })
    .order("last_message_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list contacts: ${error.message}`);
  }

  return data ?? [];
}

export async function getConversationThread(phone: string) {
  const supabase = createAdminClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (conversationError) {
    throw new Error(`Failed to load conversation: ${conversationError.message}`);
  }

  if (!conversation) {
    return null;
  }

  const [{ data: messages, error: messagesError }, { data: jobs, error: jobsError }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("jobs")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false }),
    ]);

  if (messagesError) {
    throw new Error(`Failed to load thread: ${messagesError.message}`);
  }
  if (jobsError) {
    throw new Error(`Failed to load jobs: ${jobsError.message}`);
  }

  const jobIds = (jobs ?? []).map((job) => job.id);
  let media: {
    id: string;
    job_id: string | null;
    conversation_id: string;
    storage_path: string;
    mime_type: string | null;
    created_at: string;
  }[] = [];

  if (jobIds.length > 0 || conversation.id) {
    const { data: mediaRows, error: mediaError } = await supabase
      .from("job_media")
      .select("id, job_id, conversation_id, storage_path, mime_type, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });

    if (mediaError) {
      throw new Error(`Failed to load job media: ${mediaError.message}`);
    }
    media = mediaRows ?? [];
  }

  return {
    conversation,
    messages: messages ?? [],
    jobs: jobs ?? [],
    media,
    draft: mapJobDraft(conversation),
  };
}

export async function deleteConversation(phone: string) {
  const supabase = createAdminClient();

  const { data: conversation, error: loadError } = await supabase
    .from("conversations")
    .select("id, phone")
    .eq("phone", phone)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load conversation: ${loadError.message}`);
  }
  if (!conversation) {
    return { ok: false as const, notFound: true };
  }

  // Keep job requests; FK should SET NULL conversation_id (not cascade).
  const { error: deleteError } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversation.id);

  if (deleteError) {
    throw new Error(`Failed to delete conversation: ${deleteError.message}`);
  }

  return { ok: true as const, phone: conversation.phone };
}

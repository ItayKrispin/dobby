import { createAdminClient } from "@/lib/supabase/admin";
import type { OwnerNotificationType } from "@/types/database";

export type OwnerNotification = {
  id: string;
  type: OwnerNotificationType;
  title: string;
  body: string;
  phone: string | null;
  conversationId: string | null;
  jobId: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  type: OwnerNotificationType;
  title: string;
  body: string;
  phone: string | null;
  conversation_id: string | null;
  job_id: string | null;
  read_at: string | null;
  created_at: string;
};

function mapNotification(row: NotificationRow): OwnerNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    phone: row.phone,
    conversationId: row.conversation_id,
    jobId: row.job_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function isMissingSchemaError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    /pinned_at|owner_notifications|job_reminders|schema cache/i.test(message)
  );
}

export async function createOwnerNotification(input: {
  type: OwnerNotificationType;
  title: string;
  body?: string;
  phone?: string | null;
  conversationId?: string | null;
  jobId?: string | null;
}): Promise<OwnerNotification> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("owner_notifications")
    .insert({
      type: input.type,
      title: input.title,
      body: input.body?.trim() || "",
      phone: input.phone ?? null,
      conversation_id: input.conversationId ?? null,
      job_id: input.jobId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingSchemaError(error)) {
      console.error(
        "owner_notifications table missing — run migration 00007_owner_ux_upgrades.sql",
      );
      throw new Error(
        "Notifications table missing. Apply migration 00007_owner_ux_upgrades.sql",
      );
    }
    throw new Error(
      `Failed to create notification: ${error?.message ?? "unknown error"}`,
    );
  }

  return mapNotification(data as NotificationRow);
}

/** Avoid duplicate handoff alerts within a short window for the same conversation. */
export async function createOwnerHandoffNotification(options: {
  phone: string;
  conversationId: string;
  customerName?: string | null;
}): Promise<{ created: boolean; notification?: OwnerNotification }> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: recent, error: recentError } = await supabase
    .from("owner_notifications")
    .select("id")
    .eq("type", "owner_handoff")
    .eq("conversation_id", options.conversationId)
    .is("read_at", null)
    .gte("created_at", since)
    .limit(1);

  if (recentError) {
    if (isMissingSchemaError(recentError)) {
      return { created: false };
    }
    throw new Error(recentError.message);
  }

  if (recent && recent.length > 0) {
    return { created: false };
  }

  const label = options.customerName?.trim() || options.phone;
  const notification = await createOwnerNotification({
    type: "owner_handoff",
    title: `${label} מבקש לדבר איתך`,
    body: "הלקוח ביקש לדבר ישירות עם בעל העסק. ה־AI הושהה.",
    phone: options.phone,
    conversationId: options.conversationId,
  });

  return { created: true, notification };
}

export async function createPausedMessageNotification(options: {
  phone: string;
  conversationId: string;
  customerName?: string | null;
  preview?: string;
}): Promise<{ created: boolean; notification?: OwnerNotification }> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: recent, error: recentError } = await supabase
    .from("owner_notifications")
    .select("id")
    .eq("type", "paused_message")
    .eq("conversation_id", options.conversationId)
    .is("read_at", null)
    .gte("created_at", since)
    .limit(1);

  if (recentError) {
    if (isMissingSchemaError(recentError)) {
      return { created: false };
    }
    throw new Error(recentError.message);
  }

  if (recent && recent.length > 0) {
    return { created: false };
  }

  const label = options.customerName?.trim() || options.phone;
  const preview = options.preview?.trim();
  const notification = await createOwnerNotification({
    type: "paused_message",
    title: `${label} שלח הודעה בזמן שה־AI מושהה`,
    body: preview
      ? preview.slice(0, 160)
      : "הלקוח שלח הודעה בזמן שה־AI מושהה — כדאי לבדוק את השיחה.",
    phone: options.phone,
    conversationId: options.conversationId,
  });

  return { created: true, notification };
}

export async function listOwnerNotifications(options: {
  limit?: number;
  unreadOnly?: boolean;
} = {}): Promise<OwnerNotification[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("owner_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw new Error(`Failed to list notifications: ${error.message}`);
  }

  return ((data ?? []) as NotificationRow[]).map(mapNotification);
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("owner_notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    if (isMissingSchemaError(error)) {
      return 0;
    }
    throw new Error(`Failed to count notifications: ${error.message}`);
  }

  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<OwnerNotification | null> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("owner_notifications")
    .update({ read_at: now })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark notification read: ${error.message}`);
  }
  if (!data) return null;
  return mapNotification(data as NotificationRow);
}

export async function markAllNotificationsRead(): Promise<number> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("owner_notifications")
    .update({ read_at: now })
    .is("read_at", null)
    .select("id");

  if (error) {
    throw new Error(`Failed to mark all notifications read: ${error.message}`);
  }

  return data?.length ?? 0;
}

import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessProfile } from "@/lib/business";
import { createOwnerNotification } from "@/lib/notifications";
import { phonesMatch } from "@/lib/utils/phone";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import type { ReminderOffsetMinutes } from "@/types/database";

function isMissingSchemaError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    /job_reminders|owner_notifications|schema cache/i.test(message)
  );
}

export const REMINDER_OFFSETS = [60, 180, 1440] as const satisfies ReminderOffsetMinutes[];

export type JobReminder = {
  id: string;
  jobId: string;
  offsetMinutes: ReminderOffsetMinutes;
  fireAt: string;
  sentAt: string | null;
  createdAt: string;
};

type ReminderRow = {
  id: string;
  job_id: string;
  offset_minutes: ReminderOffsetMinutes;
  fire_at: string;
  sent_at: string | null;
  created_at: string;
};

function mapReminder(row: ReminderRow): JobReminder {
  return {
    id: row.id,
    jobId: row.job_id,
    offsetMinutes: row.offset_minutes,
    fireAt: row.fire_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

export function offsetLabel(minutes: ReminderOffsetMinutes) {
  if (minutes === 60) return "שעה לפני";
  if (minutes === 180) return "3 שעות לפני";
  return "יום לפני";
}

export async function listRemindersForJob(jobId: string): Promise<JobReminder[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("job_reminders")
    .select("*")
    .eq("job_id", jobId)
    .order("offset_minutes", { ascending: true });

  if (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw new Error(`Failed to list reminders: ${error.message}`);
  }

  return ((data ?? []) as ReminderRow[]).map(mapReminder);
}

export async function listRemindersForJobs(
  jobIds: string[],
): Promise<Map<string, JobReminder[]>> {
  const map = new Map<string, JobReminder[]>();
  if (jobIds.length === 0) return map;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("job_reminders")
    .select("*")
    .in("job_id", jobIds);

  if (error) {
    if (isMissingSchemaError(error)) {
      return map;
    }
    throw new Error(`Failed to list reminders: ${error.message}`);
  }

  for (const row of (data ?? []) as ReminderRow[]) {
    const list = map.get(row.job_id) ?? [];
    list.push(mapReminder(row));
    map.set(row.job_id, list);
  }

  return map;
}

/**
 * Replace reminder offsets for a job based on scheduled_start.
 * Drops offsets whose fire_at is already in the past.
 * Clears all reminders when scheduledStart is null.
 */
export async function syncJobReminders(
  jobId: string,
  scheduledStart: string | null,
  offsets: ReminderOffsetMinutes[],
): Promise<JobReminder[]> {
  const supabase = createAdminClient();
  const unique = Array.from(
    new Set(
      offsets.filter((value): value is ReminderOffsetMinutes =>
        REMINDER_OFFSETS.includes(value as ReminderOffsetMinutes),
      ),
    ),
  );

  const { error: clearError } = await supabase
    .from("job_reminders")
    .delete()
    .eq("job_id", jobId)
    .is("sent_at", null);

  if (clearError) {
    if (isMissingSchemaError(clearError)) {
      console.error(
        "job_reminders table missing — run migration 00007_owner_ux_upgrades.sql",
      );
      return [];
    }
    throw new Error(`Failed to clear reminders: ${clearError.message}`);
  }

  if (!scheduledStart || unique.length === 0) {
    return listRemindersForJob(jobId);
  }

  const startMs = new Date(scheduledStart).getTime();
  if (Number.isNaN(startMs)) {
    return listRemindersForJob(jobId);
  }

  const now = Date.now();
  const rows = unique
    .map((offset) => {
      const fireAt = new Date(startMs - offset * 60_000);
      if (fireAt.getTime() <= now) return null;
      return {
        job_id: jobId,
        offset_minutes: offset,
        fire_at: fireAt.toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return listRemindersForJob(jobId);
  }

  const { error: insertError } = await supabase.from("job_reminders").upsert(rows, {
    onConflict: "job_id,offset_minutes",
  });

  if (insertError) {
    throw new Error(`Failed to save reminders: ${insertError.message}`);
  }

  return listRemindersForJob(jobId);
}

export async function flushDueReminders(): Promise<number> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("job_reminders")
    .select("*")
    .is("sent_at", null)
    .lte("fire_at", now)
    .order("fire_at", { ascending: true })
    .limit(50);

  if (error) {
    if (isMissingSchemaError(error)) {
      return 0;
    }
    throw new Error(`Failed to load due reminders: ${error.message}`);
  }

  const rows = (due ?? []) as ReminderRow[];
  if (rows.length === 0) return 0;

  const profile = await getBusinessProfile();
  const notifyPhone = profile.ownerNotifyPhone.trim();
  let sent = 0;

  for (const row of rows) {
    const { data: job } = await supabase
      .from("jobs")
      .select(
        "id, phone, customer_name, problem, address_text, scheduled_start, in_diary, status",
      )
      .eq("id", row.job_id)
      .maybeSingle();

    if (!job || job.status === "completed" || job.status === "cancelled" || !job.in_diary) {
      await supabase
        .from("job_reminders")
        .update({ sent_at: now })
        .eq("id", row.id);
      continue;
    }

    const label = job.customer_name?.trim() || job.phone;
    const when = offsetLabel(row.offset_minutes);
    const title = `תזכורת: ${label} (${when})`;
    const bodyParts = [
      job.problem || "קריאה ביומן",
      job.address_text ? `כתובת: ${job.address_text}` : null,
      job.scheduled_start
        ? `שעה: ${new Intl.DateTimeFormat("he-IL", {
            timeZone: "Asia/Jerusalem",
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(job.scheduled_start))}`
        : null,
    ].filter(Boolean);

    await createOwnerNotification({
      type: "job_reminder",
      title,
      body: bodyParts.join(" · "),
      phone: job.phone,
      jobId: job.id,
    });

    if (notifyPhone && !phonesMatch(notifyPhone, job.phone)) {
      try {
        await sendWhatsAppMessage(
          notifyPhone,
          [`⏰ ${title}`, ...bodyParts].join("\n"),
        );
      } catch (notifyError) {
        console.error("Reminder WhatsApp failed:", notifyError);
      }
    }

    await supabase
      .from("job_reminders")
      .update({ sent_at: now })
      .eq("id", row.id);
    sent += 1;
  }

  return sent;
}

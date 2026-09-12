import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessProfile } from "@/lib/business";
import {
  clearJobDraft,
  getCustomerName,
  getJobDraft,
  getOrCreateConversation,
  type JobDraft,
} from "@/lib/conversations";
import { createOwnerNotification } from "@/lib/notifications";
import { syncJobReminders, type JobReminder } from "@/lib/reminders";
import { startOfTodayIsrael } from "@/lib/utils/date";
import { phonesMatch } from "@/lib/utils/phone";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import {
  isTerminalJobStatus,
  type JobStatus,
  type ReminderOffsetMinutes,
} from "@/types/database";

export type JobPhoto = {
  id: string;
  url: string | null;
  storagePath: string;
};

export type Job = {
  id: string;
  conversationId: string | null;
  phone: string;
  customerName: string | null;
  problem: string;
  jobType: string | null;
  isEmergency: boolean;
  addressText: string | null;
  locationLat: number | null;
  locationLng: number | null;
  customerAvailability: string | null;
  status: JobStatus;
  notifiedAt: string | null;
  inDiary: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  googleEventId: string | null;
  diaryAddedAt: string | null;
  paymentAmount: number | null;
  paymentIncludesVat: boolean | null;
  outcomeAt: string | null;
  createdAt: string;
  updatedAt: string;
  photoCount?: number;
  photos?: JobPhoto[];
  reminderOffsets?: ReminderOffsetMinutes[];
};

type JobRow = {
  id: string;
  conversation_id: string | null;
  phone: string;
  customer_name: string | null;
  problem: string;
  job_type: string | null;
  is_emergency: boolean;
  address_text: string | null;
  location_lat: number | null;
  location_lng: number | null;
  customer_availability: string | null;
  status: JobStatus;
  notified_at: string | null;
  in_diary: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  google_event_id: string | null;
  diary_added_at: string | null;
  payment_amount: number | null;
  payment_includes_vat: boolean | null;
  outcome_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapJob(
  row: JobRow,
  extras?: {
    photoCount?: number;
    photos?: JobPhoto[];
    reminderOffsets?: ReminderOffsetMinutes[];
  },
): Job {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    phone: row.phone,
    customerName: row.customer_name,
    problem: row.problem,
    jobType: row.job_type,
    isEmergency: row.is_emergency,
    addressText: row.address_text,
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    customerAvailability: row.customer_availability,
    status: row.status,
    notifiedAt: row.notified_at,
    inDiary: Boolean(row.in_diary),
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    googleEventId: row.google_event_id,
    diaryAddedAt: row.diary_added_at,
    paymentAmount:
      row.payment_amount == null ? null : Number(row.payment_amount),
    paymentIncludesVat: row.payment_includes_vat,
    outcomeAt: row.outcome_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoCount: extras?.photoCount,
    photos: extras?.photos,
    reminderOffsets: extras?.reminderOffsets,
  };
}

async function attachPhotoData(jobs: Job[]): Promise<Job[]> {
  if (jobs.length === 0) return jobs;

  const supabase = createAdminClient();
  const { getSignedStorageUrl } = await import("@/lib/storage-signed-url");
  const ids = jobs.map((job) => job.id);
  const { data: media } = await supabase
    .from("job_media")
    .select("id, job_id, storage_path")
    .in("job_id", ids)
    .order("created_at", { ascending: true });

  const byJob = new Map<string, { id: string; storage_path: string }[]>();
  for (const row of media ?? []) {
    if (!row.job_id) continue;
    const list = byJob.get(row.job_id) ?? [];
    list.push({ id: row.id, storage_path: row.storage_path });
    byJob.set(row.job_id, list);
  }

  return Promise.all(
    jobs.map(async (job) => {
      const rows = byJob.get(job.id) ?? [];
      const photos = await Promise.all(
        rows.slice(0, 3).map(async (row) => {
          const url = await getSignedStorageUrl(
            supabase,
            "job-photos",
            row.storage_path,
          );
          return {
            id: row.id,
            url,
            storagePath: row.storage_path,
          };
        }),
      );
      return {
        ...job,
        photoCount: rows.length,
        photos,
      };
    }),
  );
}

async function attachReminderOffsets(jobs: Job[]): Promise<Job[]> {
  if (jobs.length === 0) return jobs;
  const { listRemindersForJobs } = await import("@/lib/reminders");
  const map = await listRemindersForJobs(jobs.map((job) => job.id));
  return jobs.map((job) => ({
    ...job,
    reminderOffsets: (map.get(job.id) ?? [])
      .filter((reminder: JobReminder) => !reminder.sentAt)
      .map((reminder: JobReminder) => reminder.offsetMinutes),
  }));
}

export function draftChecklist(draft: JobDraft) {
  return {
    problem: Boolean(draft.problem?.trim()),
    address: Boolean(draft.address?.trim()),
    availability: Boolean(draft.availability?.trim()),
    photos: draft.photoCount > 0,
  };
}

export function isPacketComplete(
  draft: JobDraft,
  photoPolicy: "always" | "if_helpful" | "never",
) {
  const hasCore =
    Boolean(draft.problem?.trim()) &&
    Boolean(draft.address?.trim()) &&
    Boolean(draft.availability?.trim());

  if (!hasCore) return false;
  if (photoPolicy === "always" && draft.photoCount < 1) return false;
  return true;
}

export async function listJobs(
  options: {
    openOnly?: boolean;
    archiveOnly?: boolean;
    /** @deprecated use archiveOnly */
    closedOnly?: boolean;
    inProgressOnly?: boolean;
  } = {},
) {
  const supabase = createAdminClient();
  let query = supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  const archiveOnly = options.archiveOnly || options.closedOnly;
  if (archiveOnly) {
    query = query
      .in("status", ["completed", "cancelled"])
      .order("outcome_at", { ascending: false });
  } else if (options.inProgressOnly) {
    query = query.eq("status", "owner_handling");
  } else if (options.openOnly) {
    query = query.in("status", ["intake", "ready", "notified"]);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list jobs: ${error.message}`);
  }

  const rows = (data ?? []) as JobRow[];
  const mapped = rows.map((row) => mapJob(row));
  return attachPhotoData(mapped);
}

/** Pick a sensible open status when restoring an archived job. */
export function restoreStatusForJob(
  job: Pick<Job, "inDiary" | "notifiedAt">,
): JobStatus {
  if (job.inDiary) return "owner_handling";
  if (job.notifiedAt) return "notified";
  return "ready";
}

export async function restoreJob(id: string) {
  const job = await getJobById(id);
  if (!job) {
    throw new Error("Job not found");
  }
  if (!isTerminalJobStatus(job.status)) {
    return job;
  }
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      status: restoreStatusForJob(job),
      payment_amount: null,
      payment_includes_vat: null,
      outcome_at: null,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to restore job: ${error.message}`);
  }
  if (!data) {
    throw new Error("Job not found");
  }
  return mapJob(data as JobRow);
}

export async function listJobsForPhone(phone: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list jobs: ${error.message}`);
  }

  return ((data ?? []) as JobRow[]).map((row) => mapJob(row));
}

export async function getJobById(id: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load job: ${error.message}`);
  }
  if (!data) return null;
  return mapJob(data as JobRow);
}

export async function updateJobStatus(id: string, status: JobStatus) {
  if (status === "completed" || status === "cancelled") {
    throw new Error("Use completeJob or cancelJob for terminal statuses");
  }

  const existing = await getJobById(id);
  if (!existing) {
    throw new Error("Job not found");
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status,
    payment_amount: null,
    payment_includes_vat: null,
    outcome_at: null,
    updated_at: now,
  };

  // "בטיפול" also parks the job in the work diary (untimed unless already scheduled).
  if (status === "owner_handling") {
    updates.in_diary = true;
    updates.diary_added_at = existing.diaryAddedAt ?? now;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update job: ${error.message}`);
  }
  if (!data) {
    throw new Error("Job not found");
  }

  return mapJob(data as JobRow);
}

export async function completeJob(
  id: string,
  options: {
    paymentAmount?: number | null;
    paymentIncludesVat?: boolean;
  } = {},
) {
  const amount =
    options.paymentAmount == null || options.paymentAmount === undefined
      ? null
      : Number(options.paymentAmount);

  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error("Invalid payment amount");
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const includesVat =
    amount == null ? null : options.paymentIncludesVat !== false;

  const { data, error } = await supabase
    .from("jobs")
    .update({
      status: "completed",
      payment_amount: amount,
      payment_includes_vat: includesVat,
      outcome_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to complete job: ${error.message}`);
  }
  if (!data) {
    throw new Error("Job not found");
  }

  return mapJob(data as JobRow);
}

export async function cancelJob(id: string) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      status: "cancelled",
      payment_amount: null,
      payment_includes_vat: null,
      outcome_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to cancel job: ${error.message}`);
  }
  if (!data) {
    throw new Error("Job not found");
  }

  return mapJob(data as JobRow);
}

async function attachPendingMedia(conversationId: string, jobId: string) {
  const supabase = createAdminClient();
  await supabase
    .from("job_media")
    .update({ job_id: jobId })
    .eq("conversation_id", conversationId)
    .is("job_id", null);
}

export async function notifyOwnerAboutJob(job: Job) {
  const profile = await getBusinessProfile();
  const notifyPhone = profile.ownerNotifyPhone.trim();
  if (!notifyPhone) {
    return { ok: false as const, error: "owner_notify_phone not configured" };
  }

  // Never WhatsApp the intake packet to the customer thread — happens when
  // owner_notify_phone is the same handset used for testing as a customer.
  if (phonesMatch(notifyPhone, job.phone)) {
    console.warn(
      "Skipping owner WhatsApp notify: notify phone matches customer phone",
      { notifyPhone, customerPhone: job.phone, jobId: job.id },
    );
    return {
      ok: false as const,
      error: "owner_notify_phone matches customer phone",
    };
  }

  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const dashLink = `${baseUrl}/dashboard/${encodeURIComponent(job.phone)}`;
  const header = "📋 קריאה חדשה";
  const lines = [
    header,
    `שם: ${job.customerName || "לא ידוע"}`,
    `טלפון: ${job.phone}`,
    job.jobType ? `סוג: ${job.jobType}` : null,
    `כתובת: ${job.addressText || "לא נמסרה"}`,
    `בעיה: ${job.problem || "—"}`,
    job.customerAvailability
      ? `זמינות: ${job.customerAvailability}`
      : null,
    `תמונות: ${job.photoCount ?? 0}`,
    `פרטים: ${dashLink}`,
  ].filter(Boolean);

  try {
    await sendWhatsAppMessage(notifyPhone, lines.join("\n"));
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    await supabase
      .from("jobs")
      .update({
        status: "notified",
        notified_at: now,
        updated_at: now,
      })
      .eq("id", job.id);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to notify owner",
    };
  }
}

export async function submitJob(phone: string): Promise<{
  ok: boolean;
  job?: Job;
  error?: string;
  notified?: boolean;
  notifyError?: string;
}> {
  const conversation = await getOrCreateConversation(phone);
  const [draft, customerName, profile] = await Promise.all([
    getJobDraft(phone),
    getCustomerName(phone),
    getBusinessProfile(),
  ]);

  const complete = isPacketComplete(draft, profile.photoPolicy);

  if (!complete) {
    return {
      ok: false,
      error:
        "Job packet incomplete. Need problem, address, and availability (photos if policy=always).",
    };
  }

  if (!draft.problem?.trim()) {
    return { ok: false, error: "problem is required" };
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      conversation_id: conversation.id,
      phone,
      customer_name: customerName,
      problem: draft.problem.trim(),
      job_type: draft.jobType,
      is_emergency: false,
      address_text: draft.address,
      location_lat: draft.locationLat,
      location_lng: draft.locationLng,
      customer_availability: draft.availability,
      status: "ready",
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create job" };
  }

  await attachPendingMedia(conversation.id, data.id);
  await clearJobDraft(phone);

  const { count } = await supabase
    .from("job_media")
    .select("*", { count: "exact", head: true })
    .eq("job_id", data.id);

  const job = mapJob(data as JobRow, { photoCount: count ?? 0 });
  const notify = await notifyOwnerAboutJob(job);

  try {
    await createOwnerNotification({
      type: "new_job",
      title: `קריאה חדשה: ${job.customerName?.trim() || job.phone}`,
      body: [
        job.problem || "—",
        job.addressText ? `כתובת: ${job.addressText}` : null,
        job.customerAvailability ? `זמינות: ${job.customerAvailability}` : null,
        (job.photoCount ?? 0) > 0 ? `${job.photoCount} תמונות` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      phone: job.phone,
      conversationId: job.conversationId,
      jobId: job.id,
    });
  } catch (notifyError) {
    console.error("Failed to create in-app job notification:", notifyError);
  }

  return {
    ok: true,
    job: notify.ok ? { ...job, status: "notified", notifiedAt: now } : job,
    notified: notify.ok,
    notifyError: notify.ok ? undefined : notify.error,
  };
}

export async function getOpenJobSummaryForPhone(phone: string) {
  const jobs = await listJobsForPhone(phone);
  const open = jobs.filter((job) => !isTerminalJobStatus(job.status));
  const latest = open[0] ?? null;
  return {
    openCount: open.length,
    latest,
    hasEmergency: open.some((job) => job.isEmergency),
  };
}

function intervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
) {
  return startA < endB && endA > startB;
}

export async function findDiaryConflicts(
  start: Date,
  end: Date,
  excludeJobId?: string,
): Promise<Job[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("jobs")
    .select("*")
    .eq("in_diary", true)
    .not("status", "in", "(completed,cancelled)")
    .not("scheduled_start", "is", null)
    .not("scheduled_end", "is", null);

  if (excludeJobId) {
    query = query.neq("id", excludeJobId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to check diary conflicts: ${error.message}`);
  }

  return ((data ?? []) as JobRow[])
    .map((row) => mapJob(row))
    .filter((job) => {
      if (!job.scheduledStart || !job.scheduledEnd) return false;
      return intervalsOverlap(
        start,
        end,
        new Date(job.scheduledStart),
        new Date(job.scheduledEnd),
      );
    });
}

export type DiaryScheduleInput = {
  start?: string | Date | null;
  end?: string | Date | null;
  durationMinutes?: number | null;
  force?: boolean;
  replaceJobId?: string | null;
  reminderOffsets?: ReminderOffsetMinutes[];
};

export type DiaryMutationResult =
  | { ok: true; job: Job; replacedJob?: Job }
  | { ok: false; conflict: true; conflicts: Job[] }
  | { ok: false; error: string };

async function resolveScheduleBounds(
  _job: Job,
  input: DiaryScheduleInput,
): Promise<
  | { start: Date; end: Date }
  | { start: Date; end: null }
  | { start: null; end: null }
  | { error: string }
> {
  const hasStart = input.start != null && String(input.start).trim() !== "";
  if (!hasStart) {
    return { start: null, end: null };
  }

  const start = new Date(input.start as string | Date);
  if (Number.isNaN(start.getTime())) {
    return { error: "Invalid start time" };
  }

  if (input.end != null && String(input.end).trim() !== "") {
    const end = new Date(input.end as string | Date);
    if (Number.isNaN(end.getTime())) {
      return { error: "Invalid end time" };
    }
    if (end <= start) {
      return { error: "End must be after start" };
    }
    return { start, end };
  }

  const duration = input.durationMinutes ?? null;
  if (duration == null || !Number.isFinite(duration) || duration <= 0) {
    // Start-only: owner doesn't know how long the job will take.
    return { start, end: null };
  }

  const end = new Date(start.getTime() + duration * 60_000);
  return { start, end };
}

async function applyReplaceJob(replaceJobId: string): Promise<Job> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      status: "cancelled",
      payment_amount: null,
      payment_includes_vat: null,
      outcome_at: now,
      in_diary: false,
      scheduled_start: null,
      scheduled_end: null,
      google_event_id: null,
      updated_at: now,
    })
    .eq("id", replaceJobId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to replace job: ${error.message}`);
  }
  if (!data) {
    throw new Error("Replace job not found");
  }
  return mapJob(data as JobRow);
}

export async function listDiaryJobs(
  options: { past?: boolean } = {},
): Promise<Job[]> {
  const supabase = createAdminClient();
  const cutoffIso = startOfTodayIsrael().toISOString();

  let query = supabase.from("jobs").select("*").eq("in_diary", true);

  if (options.past) {
    query = query
      .not("scheduled_start", "is", null)
      .lt("scheduled_start", cutoffIso)
      .order("scheduled_start", { ascending: false });
  } else {
    // Upcoming: not archived, and untimed or scheduled on/after today (Israel midnight).
    query = query
      .not("status", "in", "(completed,cancelled)")
      .or(`scheduled_start.is.null,scheduled_start.gte.${cutoffIso}`)
      .order("scheduled_start", { ascending: true, nullsFirst: true })
      .order("diary_added_at", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list diary jobs: ${error.message}`);
  }

  let jobs = ((data ?? []) as JobRow[]).map((row) => mapJob(row));

  if (!options.past) {
    // Keep untimed first, then chronological — matches previous client sort.
    jobs = jobs.sort((a, b) => {
      if (!a.scheduledStart && !b.scheduledStart) {
        return (a.diaryAddedAt ?? "").localeCompare(b.diaryAddedAt ?? "");
      }
      if (!a.scheduledStart) return -1;
      if (!b.scheduledStart) return 1;
      return a.scheduledStart.localeCompare(b.scheduledStart);
    });
  }

  jobs = await attachPhotoData(jobs);
  return attachReminderOffsets(jobs);
}

export async function addJobToDiary(
  id: string,
  input: DiaryScheduleInput = {},
): Promise<DiaryMutationResult> {
  const job = await getJobById(id);
  if (!job) {
    return { ok: false, error: "Job not found" };
  }

  const bounds = await resolveScheduleBounds(job, input);
  if ("error" in bounds) {
    return { ok: false, error: bounds.error };
  }

  let replacedJob: Job | undefined;
  if (bounds.start && bounds.end && !input.force) {
    if (input.replaceJobId) {
      replacedJob = await applyReplaceJob(input.replaceJobId);
    } else {
      const conflicts = await findDiaryConflicts(bounds.start, bounds.end, id);
      if (conflicts.length > 0) {
        return { ok: false, conflict: true, conflicts };
      }
    }
  } else if (bounds.start && bounds.end && input.replaceJobId) {
    replacedJob = await applyReplaceJob(input.replaceJobId);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      in_diary: true,
      diary_added_at: job.diaryAddedAt ?? now,
      status: "owner_handling",
      scheduled_start: bounds.start ? bounds.start.toISOString() : null,
      scheduled_end: bounds.end ? bounds.end.toISOString() : null,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Job not found" };
  }

  const mapped = mapJob(data as JobRow);
  if (input.reminderOffsets !== undefined) {
    await syncJobReminders(
      mapped.id,
      mapped.scheduledStart,
      input.reminderOffsets,
    );
  } else if (!mapped.scheduledStart) {
    await syncJobReminders(mapped.id, null, []);
  }

  return { ok: true, job: mapped, replacedJob };
}

export async function scheduleDiaryJob(
  id: string,
  input: DiaryScheduleInput,
): Promise<DiaryMutationResult> {
  const job = await getJobById(id);
  if (!job) {
    return { ok: false, error: "Job not found" };
  }
  if (!job.inDiary) {
    return { ok: false, error: "Job is not in the diary" };
  }

  const bounds = await resolveScheduleBounds(job, input);
  if ("error" in bounds) {
    return { ok: false, error: bounds.error };
  }
  if (!bounds.start) {
    return { ok: false, error: "Start time is required" };
  }

  let replacedJob: Job | undefined;
  if (bounds.end && !input.force) {
    if (input.replaceJobId) {
      replacedJob = await applyReplaceJob(input.replaceJobId);
    } else {
      const conflicts = await findDiaryConflicts(bounds.start, bounds.end, id);
      if (conflicts.length > 0) {
        return { ok: false, conflict: true, conflicts };
      }
    }
  } else if (input.replaceJobId) {
    replacedJob = await applyReplaceJob(input.replaceJobId);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      scheduled_start: bounds.start.toISOString(),
      scheduled_end: bounds.end ? bounds.end.toISOString() : null,
      google_event_id: null,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Job not found" };
  }

  const mapped = mapJob(data as JobRow);
  if (input.reminderOffsets !== undefined) {
    await syncJobReminders(
      mapped.id,
      mapped.scheduledStart,
      input.reminderOffsets,
    );
  }

  return { ok: true, job: mapped, replacedJob };
}

export async function clearDiarySchedule(id: string): Promise<Job> {
  const job = await getJobById(id);
  if (!job) {
    throw new Error("Job not found");
  }
  if (!job.inDiary) {
    throw new Error("Job is not in the diary");
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      scheduled_start: null,
      scheduled_end: null,
      google_event_id: null,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to clear schedule: ${error.message}`);
  }
  if (!data) {
    throw new Error("Job not found");
  }

  await syncJobReminders(id, null, []);
  return mapJob(data as JobRow);
}

export async function setJobGoogleEventId(
  id: string,
  googleEventId: string,
): Promise<Job> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      google_event_id: googleEventId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to save calendar event: ${error.message}`);
  }
  if (!data) {
    throw new Error("Job not found");
  }
  return mapJob(data as JobRow);
}

/** Latest open job for a conversation (if any), for attaching late photos. */
export async function findLatestOpenJobId(
  conversationId: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("conversation_id", conversationId)
    .not("status", "in", "(completed,cancelled)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find open job: ${error.message}`);
  }

  return data?.id ?? null;
}

import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessProfile } from "@/lib/business";
import {
  clearJobDraft,
  getCustomerName,
  getJobDraft,
  getOrCreateConversation,
  type JobDraft,
} from "@/lib/conversations";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import type { JobStatus } from "@/types/database";

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
  createdAt: string;
  updatedAt: string;
  photoCount?: number;
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
  created_at: string;
  updated_at: string;
};

function mapJob(row: JobRow, photoCount?: number): Job {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoCount,
  };
}

export function draftChecklist(draft: JobDraft) {
  return {
    problem: Boolean(draft.problem?.trim()),
    emergency: draft.isEmergency !== null,
    address: Boolean(draft.address?.trim()),
    availability: Boolean(draft.availability?.trim()),
    photos: draft.photoCount > 0,
  };
}

export function isEmergencyReady(draft: JobDraft) {
  return (
    draft.isEmergency === true &&
    Boolean(draft.problem?.trim()) &&
    Boolean(draft.address?.trim())
  );
}

export function isPacketComplete(
  draft: JobDraft,
  photoPolicy: "always" | "if_helpful" | "never",
) {
  const hasCore =
    Boolean(draft.problem?.trim()) &&
    draft.isEmergency !== null &&
    Boolean(draft.address?.trim()) &&
    Boolean(draft.availability?.trim());

  if (!hasCore) return false;
  if (photoPolicy === "always" && draft.photoCount < 1) return false;
  return true;
}

export async function listJobs(options: { openOnly?: boolean } = {}) {
  const supabase = createAdminClient();
  let query = supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (options.openOnly) {
    query = query.in("status", ["intake", "ready", "notified", "owner_handling"]);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list jobs: ${error.message}`);
  }

  const rows = (data ?? []) as JobRow[];
  const ids = rows.map((row) => row.id);
  const photoCounts = new Map<string, number>();

  if (ids.length > 0) {
    const { data: media } = await supabase
      .from("job_media")
      .select("job_id")
      .in("job_id", ids);

    for (const row of media ?? []) {
      if (!row.job_id) continue;
      photoCounts.set(row.job_id, (photoCounts.get(row.job_id) ?? 0) + 1);
    }
  }

  return rows.map((row) => mapJob(row, photoCounts.get(row.id) ?? 0));
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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ status, updated_at: new Date().toISOString() })
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

  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const dashLink = `${baseUrl}/dashboard/${encodeURIComponent(job.phone)}`;
  const header = job.isEmergency ? "🚨 קריאת חירום" : "📋 קריאה חדשה";
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

  const emergencyReady = isEmergencyReady(draft);
  const complete = isPacketComplete(draft, profile.photoPolicy);

  if (!emergencyReady && !complete) {
    return {
      ok: false,
      error:
        "Job packet incomplete. Need problem, emergency yes/no, address, and availability (photos if policy=always).",
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
      is_emergency: draft.isEmergency === true,
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

  const job = mapJob(data as JobRow, count ?? 0);
  const notify = await notifyOwnerAboutJob(job);

  return {
    ok: true,
    job: notify.ok ? { ...job, status: "notified", notifiedAt: now } : job,
    notified: notify.ok,
    notifyError: notify.ok ? undefined : notify.error,
  };
}

export async function getOpenJobSummaryForPhone(phone: string) {
  const jobs = await listJobsForPhone(phone);
  const open = jobs.filter((job) => job.status !== "closed");
  const latest = open[0] ?? null;
  return {
    openCount: open.length,
    latest,
    hasEmergency: open.some((job) => job.isEmergency),
  };
}

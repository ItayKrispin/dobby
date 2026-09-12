import { apiFetch } from "@/lib/api-fetch";
import type { Job } from "@/lib/jobs";
import type { OwnerNotification } from "@/lib/notifications";

export const queryKeys = {
  jobs: (tab: string) => ["jobs", tab] as const,
  conversations: ["conversations"] as const,
  conversation: (phone: string) => ["conversation", phone] as const,
  diary: (scope: string) => ["diary", scope] as const,
  googleStatus: ["google", "status"] as const,
  notifications: ["notifications"] as const,
  contacts: ["contacts"] as const,
  business: ["business"] as const,
  services: ["services"] as const,
  stats: (preset: string) => ["stats", preset] as const,
};

/** Polling intervals matching previous setInterval behavior. */
export const pollMs = {
  jobs: 5_000,
  conversations: 4_000,
  conversation: 4_000,
  diary: 8_000,
  notifications: 8_000,
} as const;

export const listStaleTime = 30_000;
export const listGcTime = 10 * 60_000;

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function parseApiJson<T extends { ok?: boolean; error?: string }>(
  response: Response,
): Promise<T> {
  const json = (await response.json()) as T;
  if (!json.ok) {
    throw new ApiError(json.error || "Request failed");
  }
  return json;
}

export type JobsTab = "open" | "in_progress" | "archive";

export function jobsUrlForTab(tab: JobsTab) {
  if (tab === "archive") return "/api/jobs?status=archive";
  if (tab === "in_progress") return "/api/jobs?status=owner_handling";
  return "/api/jobs?open=1";
}

export async function fetchJobs(tab: JobsTab): Promise<Job[]> {
  const json = await parseApiJson<{ ok: true; jobs: Job[] }>(
    await apiFetch(jobsUrlForTab(tab)),
  );
  return json.jobs ?? [];
}

export type ConversationListItem = {
  id: string;
  phone: string;
  customer_name: string | null;
  last_message_at: string;
  last_message_preview: string;
  pinned_at: string | null;
  openJobCount: number;
  hasIntakeDraft: boolean;
  aiPaused: boolean;
};

export async function fetchConversations(): Promise<ConversationListItem[]> {
  const json = await parseApiJson<{
    ok: true;
    conversations: ConversationListItem[];
  }>(await apiFetch("/api/conversations"));
  return (json.conversations ?? []).map((item) => ({
    ...item,
    pinned_at: item.pinned_at ?? null,
  }));
}

export type ConversationThreadData = {
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "owner";
    content: string;
    created_at: string;
  }>;
  jobs: Array<{
    id: string;
    problem: string;
    job_type: string | null;
    is_emergency: boolean;
    address_text: string | null;
    customer_availability: string | null;
    status: string;
    in_diary: boolean;
    created_at: string;
  }>;
  media: Array<{
    id: string;
    job_id: string | null;
    storage_path: string;
    url: string | null;
    created_at: string;
  }>;
  conversation: {
    ai_paused: boolean;
    paused_at?: string | null;
    customer_name: string | null;
    draft_problem?: string | null;
    draft_is_emergency?: boolean | null;
    draft_address?: string | null;
    draft_availability?: string | null;
    draft_job_type?: string | null;
    draft_photo_count?: number;
  } | null;
};

export async function fetchConversationThread(
  phone: string,
): Promise<ConversationThreadData & { notFound?: boolean }> {
  const response = await apiFetch(
    `/api/conversations/${encodeURIComponent(phone)}`,
  );
  if (response.status === 404) {
    return {
      notFound: true,
      messages: [],
      jobs: [],
      media: [],
      conversation: null,
    };
  }
  const json = await parseApiJson<{ ok: true } & ConversationThreadData>(
    response,
  );
  return {
    messages: json.messages ?? [],
    jobs: json.jobs ?? [],
    media: json.media ?? [],
    conversation: json.conversation ?? null,
  };
}

export async function fetchDiary(scope: "upcoming" | "past"): Promise<Job[]> {
  const json = await parseApiJson<{ ok: true; jobs: Job[] }>(
    await apiFetch(`/api/diary?scope=${scope}`),
  );
  return json.jobs ?? [];
}

export async function fetchGoogleStatus(): Promise<boolean> {
  const response = await apiFetch("/api/google/status");
  const json = (await response.json()) as { connected?: boolean };
  return Boolean(json.connected);
}

export type NotificationsPayload = {
  notifications: OwnerNotification[];
  unreadCount: number;
};

export async function fetchNotifications(
  limit = 100,
): Promise<NotificationsPayload> {
  const json = await parseApiJson<{
    ok: true;
    notifications: OwnerNotification[];
    unreadCount: number;
  }>(await apiFetch(`/api/notifications?limit=${limit}`));
  return {
    notifications: json.notifications ?? [],
    unreadCount: Number(json.unreadCount ?? 0),
  };
}

export type ContactItem = {
  id: string;
  phone: string;
  customer_name: string | null;
  last_message_at: string;
  created_at: string;
};

export async function fetchContacts(): Promise<ContactItem[]> {
  const json = await parseApiJson<{ ok: true; contacts: ContactItem[] }>(
    await apiFetch("/api/contacts"),
  );
  return json.contacts ?? [];
}

export async function fetchBusiness() {
  const json = await parseApiJson<{ ok: true; profile: unknown }>(
    await apiFetch("/api/business"),
  );
  return json.profile;
}

export async function fetchServices() {
  const json = await parseApiJson<{ ok: true; services: unknown[] }>(
    await apiFetch("/api/services"),
  );
  return json.services ?? [];
}

/** Invalidate owner list surfaces that share job/conversation badges. */
export function invalidateOwnerLists(
  queryClient: {
    invalidateQueries: (opts: { queryKey: readonly unknown[] }) => Promise<void>;
  },
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["jobs"] }),
    queryClient.invalidateQueries({ queryKey: ["diary"] }),
    queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    queryClient.invalidateQueries({ queryKey: ["stats"] }),
  ]);
}

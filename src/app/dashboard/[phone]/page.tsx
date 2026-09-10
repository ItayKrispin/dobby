"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatShell } from "@/components/dashboard/chat-shell";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant" | "owner";
  content: string;
  created_at: string;
};

type Job = {
  id: string;
  problem: string;
  job_type: string | null;
  is_emergency: boolean;
  address_text: string | null;
  customer_availability: string | null;
  status: string;
  created_at: string;
};

type MediaItem = {
  id: string;
  job_id: string | null;
  storage_path: string;
  url: string | null;
  created_at: string;
};

type Conversation = {
  ai_paused: boolean;
  customer_name: string | null;
  draft_problem?: string | null;
  draft_is_emergency?: boolean | null;
  draft_address?: string | null;
  draft_availability?: string | null;
  draft_job_type?: string | null;
  draft_photo_count?: number;
};

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function roleLabel(role: Message["role"]) {
  if (role === "user") return "לקוח";
  if (role === "owner") return "בעל העסק";
  return "Dobby";
}

function statusLabel(status: string) {
  switch (status) {
    case "intake":
      return "באיסוף";
    case "ready":
      return "מוכנה";
    case "notified":
      return "נשלחה";
    case "owner_handling":
      return "בטיפול";
    case "closed":
      return "סגורה";
    default:
      return status;
  }
}

export default function ConversationThreadPage() {
  const params = useParams<{ phone: string }>();
  const router = useRouter();
  const phone = decodeURIComponent(params.phone);
  const [messages, setMessages] = useState<Message[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nameDirtyRef = useRef(false);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function refresh() {
    try {
      const response = await apiFetch(
        `/api/conversations/${encodeURIComponent(phone)}`,
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to load conversation");
      }
      setMessages(json.messages ?? []);
      setJobs(json.jobs ?? []);
      setMedia(json.media ?? []);
      setConversation(json.conversation ?? null);
      if (!nameDirtyRef.current) {
        setNameDraft(json.conversation?.customer_name ?? "");
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [phone]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function togglePause() {
    if (!conversation) return;
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/conversations/${encodeURIComponent(phone)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiPaused: !conversation.ai_paused }),
        },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to update pause state");
      }
      setConversation(json.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomerName() {
    setBusy(true);
    try {
      const value = nameDraft.trim();
      const response = await apiFetch(
        `/api/contacts/${encodeURIComponent(phone)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerName: value || null }),
        },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to save name");
      }
      setConversation((prev) =>
        prev
          ? { ...prev, customer_name: json.contact?.customer_name ?? null }
          : prev,
      );
      setNameDraft(json.contact?.customer_name ?? "");
      nameDirtyRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת שם");
    } finally {
      setBusy(false);
    }
  }

  async function sendOwnerReply() {
    const message = draft.trim();
    if (!message) return;
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/conversations/${encodeURIComponent(phone)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to send reply");
      }
      setDraft("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setBusy(false);
    }
  }

  async function setJobStatus(jobId: string, status: string) {
    setBusy(true);
    try {
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, status }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to update job");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בעדכון קריאה");
    } finally {
      setBusy(false);
    }
  }

  async function deleteThisConversation() {
    const label = conversation?.customer_name?.trim() || phone;
    const confirmed = window.confirm(
      `למחוק את השיחה עם ${label}?\nהודעות וקריאות משויכות יימחקו גם כן.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/conversations/${encodeURIComponent(phone)}`,
        { method: "DELETE" },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to delete");
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה במחיקה");
      setBusy(false);
    }
  }

  const paused = Boolean(conversation?.ai_paused);
  const savedName = conversation?.customer_name ?? "";
  const nameDirty = nameDraft.trim() !== savedName;
  const displayName = conversation?.customer_name?.trim();
  const checklist = [
    { label: "בעיה", ok: Boolean(conversation?.draft_problem) },
    {
      label: "חירום",
      ok: conversation?.draft_is_emergency !== null && conversation?.draft_is_emergency !== undefined,
    },
    { label: "כתובת", ok: Boolean(conversation?.draft_address) },
    { label: "זמינות", ok: Boolean(conversation?.draft_availability) },
    { label: "תמונות", ok: (conversation?.draft_photo_count ?? 0) > 0 },
  ];
  const hasDraft = checklist.some((item) => item.ok);

  return (
    <ChatShell
      leading={
        <Link
          href="/dashboard"
          aria-label="חזרה לתיבה"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "size-10 shrink-0 active:scale-[0.98]",
          )}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      }
      title={
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="w-full min-w-0 rounded-lg px-1 py-0.5 text-start transition hover:bg-accent/60 active:scale-[0.99]"
          aria-label="פתח פרטי לקוח"
        >
          <p className="truncate text-sm font-semibold leading-tight">
            {displayName || (
              <span dir="ltr" className="inline-block tracking-wide">
                {phone}
              </span>
            )}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {displayName ? (
              <span
                dir="ltr"
                className="truncate text-[11px] tracking-wide text-muted-foreground"
              >
                {phone}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">פרטים</span>
            )}
            {paused && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                AI מושהה
              </Badge>
            )}
            {hasDraft && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                טיוטה
              </Badge>
            )}
          </div>
        </button>
      }
      actions={
        <>
          <Button
            variant={paused ? "default" : "outline"}
            size="sm"
            className="min-h-9 px-2.5 text-xs active:scale-[0.98]"
            onClick={togglePause}
            disabled={busy || !conversation}
          >
            {paused ? "הפעל AI" : "השהה AI"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 active:scale-[0.98]"
                  aria-label="עוד פעולות"
                  disabled={busy}
                />
              }
            >
              <MoreVertical className="size-5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              <DropdownMenuItem onClick={() => refresh()} disabled={busy}>
                רענון
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDetailsOpen(true)} disabled={busy}>
                פרטי לקוח
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={deleteThisConversation}
                disabled={busy}
              >
                מחק שיחה
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {loading && (
        <p className="px-4 py-2 text-sm text-muted-foreground">טוען הודעות...</p>
      )}
      {error && (
        <p className="mx-3 mt-2 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3">
        {messages.map((message) => {
          const isUser = message.role === "user";
          const isOwner = message.role === "owner";
          return (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                isUser &&
                  "self-start border border-border bg-secondary text-secondary-foreground",
                isOwner &&
                  "self-end border-2 border-foreground/20 bg-accent text-accent-foreground",
                !isUser &&
                  !isOwner &&
                  "self-end bg-primary text-primary-foreground",
              )}
            >
              <p className="mb-1 text-[11px] font-medium opacity-70">
                {roleLabel(message.role)} · {formatTime(message.created_at)}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {paused && (
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            AI מושהה — התשובות שלך יישלחו ללקוח.
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder="כתוב תשובה ללקוח..."
            className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
          />
          <Button
            className="min-h-11 min-w-14 px-4 active:scale-[0.98]"
            onClick={sendOwnerReply}
            disabled={busy || !draft.trim()}
          >
            שלח
          </Button>
        </div>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-0 rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="border-b border-border pb-3">
            <SheetTitle>פרטי לקוח וקריאה</SheetTitle>
            <SheetDescription dir="ltr" className="tracking-wide">
              {phone}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {hasDraft && (
              <section className="space-y-2 rounded-xl border border-border bg-card p-3">
                <h2 className="text-sm font-semibold">צ׳קליסט טיוטה</h2>
                <ul className="space-y-1 text-sm">
                  {checklist.map((item) => (
                    <li key={item.label} className="flex justify-between gap-2">
                      <span>{item.label}</span>
                      <span className={item.ok ? "text-green-700" : "text-muted-foreground"}>
                        {item.ok ? "✓" : "חסר"}
                      </span>
                    </li>
                  ))}
                </ul>
                {conversation?.draft_problem && (
                  <p className="text-sm text-muted-foreground">
                    {conversation.draft_problem}
                  </p>
                )}
                {conversation?.draft_address && (
                  <p className="text-sm">{conversation.draft_address}</p>
                )}
              </section>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={nameDraft}
                onChange={(event) => {
                  nameDirtyRef.current = true;
                  setNameDraft(event.target.value);
                }}
                placeholder="שם לקוח (אופציונלי)"
                className="min-h-11 flex-1 rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
              />
              <Button
                className="min-h-11 px-4 active:scale-[0.98]"
                variant="outline"
                disabled={!nameDirty || busy}
                onClick={saveCustomerName}
              >
                שמור שם
              </Button>
            </div>

            {jobs.length > 0 && (
              <section className="space-y-2 rounded-xl border border-border bg-card p-3">
                <h2 className="text-sm font-semibold">קריאות</h2>
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="space-y-2 rounded-lg border border-border/70 p-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {job.is_emergency && (
                        <Badge variant="destructive">חירום</Badge>
                      )}
                      <Badge variant="secondary">{statusLabel(job.status)}</Badge>
                      {job.job_type && <Badge variant="outline">{job.job_type}</Badge>}
                    </div>
                    <p className="font-medium">{job.problem || "—"}</p>
                    {job.address_text && <p>{job.address_text}</p>}
                    {job.customer_availability && (
                      <p className="text-muted-foreground">
                        זמינות: {job.customer_availability}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatTime(job.created_at)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {job.status !== "closed" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setJobStatus(job.id, "owner_handling")}
                          >
                            בטיפול
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => setJobStatus(job.id, "closed")}
                          >
                            סגור
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {media.length > 0 && (
              <section className="space-y-2 rounded-xl border border-border bg-card p-3">
                <h2 className="text-sm font-semibold">תמונות</h2>
                <div className="grid grid-cols-2 gap-2">
                  {media.map((item) =>
                    item.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={item.id}
                        src={item.url}
                        alt="תמונת קריאה"
                        className="h-28 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        key={item.id}
                        className="flex h-28 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground"
                      >
                        אין תצוגה
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}
          </div>

          <SheetFooter>
            <Button
              variant="destructive"
              className="min-h-11 w-full active:scale-[0.98]"
              onClick={deleteThisConversation}
              disabled={busy}
            >
              מחק שיחה
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ChatShell>
  );
}

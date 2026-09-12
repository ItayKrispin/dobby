"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatShell } from "@/components/dashboard/chat-shell";
import { CallButton } from "@/components/dashboard/call-button";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { apiFetch } from "@/lib/api-fetch";
import {
  fetchConversationThread,
  invalidateOwnerLists,
  pollMs,
  queryKeys,
  type ConversationThreadData,
} from "@/lib/dashboard-query";
import { cn } from "@/lib/utils";
import { isTerminalJobStatus, type JobStatus } from "@/types/database";

type Message = ConversationThreadData["messages"][number];
type Conversation = NonNullable<ConversationThreadData["conversation"]>;

let tempMessageSeq = 0;
function nextTempMessageId() {
  tempMessageSeq += 1;
  return `temp-${tempMessageSeq}`;
}

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

function roleLabel(role: Message["role"], customerName?: string | null) {
  if (role === "user") return customerName?.trim() || "לקוח";
  if (role === "owner") return "בעל העסק";
  return "עוזר";
}

function messagesFingerprint(messages: Message[]) {
  if (messages.length === 0) return "0";
  const last = messages[messages.length - 1];
  return `${messages.length}:${last.id}`;
}

export default function ConversationThreadPage() {
  const params = useParams<{ phone: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const phone = decodeURIComponent(params.phone);
  const [nameDraft, setNameDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [suggestPause, setSuggestPause] = useState(false);
  const [pauseHintDismissed, setPauseHintDismissed] = useState(false);
  const [forceScroll, setForceScroll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingCompleteJobId, setPendingCompleteJobId] = useState<string | null>(
    null,
  );
  const [pendingCancelJobId, setPendingCancelJobId] = useState<string | null>(
    null,
  );
  const [paymentDraft, setPaymentDraft] = useState("");
  const [includesVat, setIncludesVat] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const nameDirtyRef = useRef(false);
  const fingerprintRef = useRef("");
  const initialScrollDoneRef = useRef(false);
  const mutatingRef = useRef(false);
  const forceScrollOnNextRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  function onScrollContainer() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
  }

  const {
    data,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.conversation(phone),
    queryFn: async () => {
      if (mutatingRef.current) {
        return (
          queryClient.getQueryData<ConversationThreadData>(
            queryKeys.conversation(phone),
          ) ?? {
            messages: [],
            jobs: [],
            media: [],
            conversation: null,
          }
        );
      }
      return fetchConversationThread(phone);
    },
    refetchInterval: pollMs.conversation,
  });

  const messages = data?.messages ?? [];
  const jobs = data?.jobs ?? [];
  const media = data?.media ?? [];
  const conversation = data?.conversation ?? null;

  useEffect(() => {
    fingerprintRef.current = "";
    initialScrollDoneRef.current = false;
    stickToBottomRef.current = true;
    nameDirtyRef.current = false;
    forceScrollOnNextRef.current = true;
    // Reset interaction hints when switching threads (remount-like).
    queueMicrotask(() => {
      setPauseHintDismissed(false);
      setSuggestPause(false);
    });
  }, [phone]);

  useEffect(() => {
    if (!data) return;
    const nextFp = messagesFingerprint(data.messages);
    const messagesChanged = nextFp !== fingerprintRef.current;
    fingerprintRef.current = nextFp;

    if (
      messagesChanged &&
      (forceScrollOnNextRef.current ||
        stickToBottomRef.current ||
        !initialScrollDoneRef.current)
    ) {
      forceScrollOnNextRef.current = false;
      queueMicrotask(() => setForceScroll(true));
    }

    if (!nameDirtyRef.current) {
      const nextName = data.conversation?.customer_name ?? "";
      queueMicrotask(() => setNameDraft(nextName));
    }
  }, [data]);

  useEffect(() => {
    if (!forceScroll) return;
    const behavior = initialScrollDoneRef.current ? "smooth" : "auto";
    scrollToBottom(behavior);
    initialScrollDoneRef.current = true;
    queueMicrotask(() => setForceScroll(false));
  }, [forceScroll, data?.messages, scrollToBottom]);

  function setThreadData(
    updater: (prev: ConversationThreadData) => ConversationThreadData,
  ) {
    queryClient.setQueryData<ConversationThreadData>(
      queryKeys.conversation(phone),
      (prev) =>
        updater(
          prev ?? {
            messages: [],
            jobs: [],
            media: [],
            conversation: null,
          },
        ),
    );
  }

  async function refresh(options: { forceScroll?: boolean } = {}) {
    if (options.forceScroll) {
      forceScrollOnNextRef.current = true;
    }
    await refetch();
  }

  async function togglePause(nextPaused?: boolean) {
    if (!conversation) return;
    const target =
      typeof nextPaused === "boolean" ? nextPaused : !conversation.ai_paused;
    const previous = conversation;
    mutatingRef.current = true;
    setThreadData((prev) => ({
      ...prev,
      conversation: prev.conversation
        ? {
            ...prev.conversation,
            ai_paused: target,
            paused_at: target
              ? prev.conversation.paused_at ?? new Date().toISOString()
              : prev.conversation.paused_at,
          }
        : prev.conversation,
    }));
    setSuggestPause(false);
    if (target) setPauseHintDismissed(false);
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/conversations/${encodeURIComponent(phone)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiPaused: target }),
        },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to update pause state");
      }
      setThreadData((prev) => ({
        ...prev,
        conversation: json.conversation as Conversation,
      }));
    } catch (err) {
      setThreadData((prev) => ({ ...prev, conversation: previous }));
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setBusy(false);
      mutatingRef.current = false;
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
      setThreadData((prev) => ({
        ...prev,
        conversation: prev.conversation
          ? {
              ...prev.conversation,
              customer_name: json.contact?.customer_name ?? null,
            }
          : prev.conversation,
      }));
      setNameDraft(json.contact?.customer_name ?? "");
      nameDirtyRef.current = false;
      toast.success("השם נשמר");
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      await queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירת שם");
    } finally {
      setBusy(false);
    }
  }

  async function sendOwnerReply() {
    const message = draft.trim();
    if (!message) return;
    const optimisticId = nextTempMessageId();
    const previous = queryClient.getQueryData<ConversationThreadData>(
      queryKeys.conversation(phone),
    );
    mutatingRef.current = true;
    setDraft("");
    setSuggestPause(false);
    stickToBottomRef.current = true;
    setThreadData((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          id: optimisticId,
          role: "owner",
          content: message,
          created_at: new Date().toISOString(),
        },
      ],
      conversation: prev.conversation
        ? {
            ...prev.conversation,
            ai_paused: true,
            paused_at: prev.conversation.paused_at ?? new Date().toISOString(),
          }
        : prev.conversation,
    }));
    setForceScroll(true);
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
      mutatingRef.current = false;
      await refresh({ forceScroll: true });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(queryKeys.conversation(phone), previous);
      }
      setDraft(message);
      toast.error(err instanceof Error ? err.message : "שגיאה בשליחה");
      mutatingRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  async function setJobStatus(jobId: string, status: JobStatus) {
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
      if (status === "owner_handling") {
        toast.success("הבקשה בטיפול והועברה ליומן עבודה");
      }
      await refresh();
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בעדכון בקשה");
    } finally {
      setBusy(false);
    }
  }

  async function completeJob(jobId: string) {
    setBusy(true);
    try {
      const trimmed = paymentDraft.trim();
      let paymentAmount: number | null = null;
      if (trimmed) {
        const parsed = Number(trimmed.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error("סכום לא תקין");
        }
        paymentAmount = parsed;
      }
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: jobId,
          action: "complete",
          paymentAmount,
          paymentIncludesVat: paymentAmount == null ? true : includesVat,
        }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to complete job");
      }
      setPendingCompleteJobId(null);
      setPaymentDraft("");
      setIncludesVat(true);
      toast.success("הבקשה סומנה כבוצע");
      await refresh();
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בעדכון בקשה");
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob(jobId: string) {
    setBusy(true);
    try {
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, action: "cancel" }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to cancel job");
      }
      setPendingCancelJobId(null);
      toast.success("הבקשה סומנה כבוטל");
      await refresh();
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בביטול בקשה");
    } finally {
      setBusy(false);
    }
  }

  async function restoreJob(jobId: string) {
    setBusy(true);
    try {
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, action: "restore" }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to restore job");
      }
      await refresh();
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בשחזור בקשה");
    } finally {
      setBusy(false);
    }
  }

  async function deleteThisConversation() {
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      router.push("/dashboard/conversations");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה במחיקה");
      setBusy(false);
    }
  }

  function onComposerInteract() {
    if (!conversation || conversation.ai_paused || pauseHintDismissed) return;
    setSuggestPause(true);
  }

  const loading = isLoading && !data;
  const notFound = Boolean(data && "notFound" in data && data.notFound);
  const loadError =
    actionError ??
    (error instanceof Error ? error.message : error ? "שגיאה בטעינה" : null);
  const paused = Boolean(conversation?.ai_paused);
  const savedName = conversation?.customer_name ?? "";
  const nameDirty = nameDraft.trim() !== savedName;
  const displayName = conversation?.customer_name?.trim();
  const checklist = [
    { label: "בעיה", ok: Boolean(conversation?.draft_problem) },
    { label: "כתובת", ok: Boolean(conversation?.draft_address) },
    { label: "זמינות", ok: Boolean(conversation?.draft_availability) },
    { label: "תמונות", ok: (conversation?.draft_photo_count ?? 0) > 0 },
  ];
  const hasDraft = checklist.some((item) => item.ok);
  const pausedAt = conversation?.paused_at ?? null;
  const deleteLabel = conversation?.customer_name?.trim() || phone;

  if (notFound) {
    return (
      <ChatShell
        leading={
          <Link
            href="/dashboard/conversations"
            aria-label="חזרה לתיבה"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "shrink-0",
            )}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        }
        title={<p className="text-base font-semibold">שיחה</p>}
      >
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            title="השיחה לא נמצאה"
            description="ייתכן שהשיחה נמחקה. חזרו לרשימת השיחות."
            action={
              <Link
                href="/dashboard/conversations"
                className={buttonVariants({ variant: "default" })}
              >
                חזרה לשיחות
              </Link>
            }
          />
        </div>
      </ChatShell>
    );
  }

  return (
    <ChatShell
      leading={
        <Link
          href="/dashboard/conversations"
          aria-label="חזרה לתיבה"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "shrink-0",
          )}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      }
      title={
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="w-full min-w-0 rounded-xl px-1 py-0.5 text-start transition hover:bg-muted/60"
          aria-label="פתח פרטי לקוח"
        >
          <p className="truncate text-base font-semibold leading-tight">
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
                className="truncate text-sm tracking-wide text-muted-foreground"
              >
                {phone}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">פרטים</span>
            )}
            {paused && <Badge variant="destructive">AI מושהה</Badge>}
          </div>
        </button>
      }
      actions={
        <>
          <CallButton phone={phone} size="icon-sm" />
          <Button
            variant={paused ? "default" : "outline"}
            size="sm"
            className={
              paused
                ? "bg-chat-owner text-chat-owner-foreground hover:bg-chat-owner/90"
                : undefined
            }
            onClick={() => togglePause()}
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
                  className="shrink-0"
                  aria-label="עוד פעולות"
                  disabled={busy}
                />
              }
            >
              <MoreVertical className="size-5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              <DropdownMenuItem
                onClick={() => refresh({ forceScroll: true })}
                disabled={busy}
              >
                רענון
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDetailsOpen(true)}
                disabled={busy}
              >
                פרטי לקוח
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
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
        <p className="px-4 py-2 text-base text-muted-foreground">טוען הודעות...</p>
      )}
      {loadError && (
        <p className="mx-3 mt-2 shrink-0 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {loadError}
        </p>
      )}

      {paused && (
        <div className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-xl border border-attention/50 bg-attention/30 px-2.5 py-1.5 text-sm text-attention-foreground">
          <p className="min-w-0 flex-1 truncate font-medium">
            אתה בטיפול ישיר — ה-AI מושהה
          </p>
          <Button
            size="sm"
            className="h-7 shrink-0 px-2.5 text-xs bg-chat-owner text-chat-owner-foreground hover:bg-chat-owner/90"
            onClick={() => togglePause(false)}
            disabled={busy}
          >
            הפעל AI
          </Button>
        </div>
      )}

      {!paused && suggestPause && (
        <div className="mx-3 mt-2 shrink-0 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-base text-accent-foreground">
          <p className="font-semibold">רוצה לקחת שליטה מה-AI?</p>
          <p className="mt-1 leading-snug opacity-90">
            אם תמשיך לכתוב ללקוח, עדיף להשהות את ה-AI — אחרת הוא עלול להתבלבל מי
            מדבר.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => togglePause(true)} disabled={busy}>
              השהה את ה-AI
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSuggestPause(false);
                setPauseHintDismissed(true);
              }}
            >
              לא עכשיו
            </Button>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={onScrollContainer}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          const isOwner = message.role === "owner";
          const showHandoffDivider =
            pausedAt &&
            message.role === "owner" &&
            (index === 0 ||
              messages[index - 1]?.created_at < pausedAt) &&
            message.created_at >= pausedAt;

          return (
            <div key={message.id} className="flex flex-col gap-3">
              {showHandoffDivider && (
                <div className="flex items-center gap-2 py-1">
                  <div className="h-px flex-1 bg-primary/30" />
                  <span className="text-sm font-medium text-primary">
                    בעל העסק לקח שליטה
                  </span>
                  <div className="h-px flex-1 bg-primary/30" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-base shadow-sm",
                  isOwner
                    ? "self-end border border-attention/50 bg-attention/30 text-attention-foreground"
                    : "border border-border bg-chat-bubble text-chat-bubble-foreground",
                  isUser && "self-start",
                  !isUser && !isOwner && "self-end",
                )}
              >
                <p
                  className={cn(
                    "mb-1 text-sm font-semibold",
                    isUser && "text-chat-label-customer",
                    isOwner && "text-attention-foreground/75",
                    !isUser && !isOwner && "text-chat-label-assistant",
                  )}
                >
                  {roleLabel(message.role, displayName)}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p
                  className={cn(
                    "mt-1.5 text-xs",
                    isOwner
                      ? "text-attention-foreground/65"
                      : "text-muted-foreground",
                  )}
                >
                  {formatTime(message.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {paused && (
          <p className="mb-1.5 text-sm text-muted-foreground">
            AI מושהה — התשובות שלך יישלחו ללקוח.
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              onComposerInteract();
            }}
            onFocus={onComposerInteract}
            rows={1}
            placeholder="כתוב תשובה ללקוח..."
            className="max-h-28 min-h-12 flex-1 resize-none"
          />
          <Button
            className="min-w-16 bg-chat-owner text-chat-owner-foreground hover:bg-chat-owner/90"
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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <SheetTitle>פרטי לקוח ובקשה</SheetTitle>
                <SheetDescription dir="ltr" className="tracking-wide">
                  {phone}
                </SheetDescription>
              </div>
              <CallButton phone={phone} />
            </div>
          </SheetHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {hasDraft && (
              <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="text-base font-semibold">צ׳קליסט טיוטה</h2>
                <ul className="space-y-1 text-base">
                  {checklist.map((item) => (
                    <li key={item.label} className="flex justify-between gap-2">
                      <span>{item.label}</span>
                      <span
                        className={
                          item.ok ? "text-chat-owner" : "text-muted-foreground"
                        }
                      >
                        {item.ok ? "✓" : "חסר"}
                      </span>
                    </li>
                  ))}
                </ul>
                {conversation?.draft_problem && (
                  <p className="text-base text-muted-foreground">
                    {conversation.draft_problem}
                  </p>
                )}
                {conversation?.draft_address && (
                  <p className="text-base">{conversation.draft_address}</p>
                )}
              </section>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={nameDraft}
                onChange={(event) => {
                  nameDirtyRef.current = true;
                  setNameDraft(event.target.value);
                }}
                placeholder="שם לקוח (אופציונלי)"
              />
              <Button
                variant="outline"
                disabled={!nameDirty || busy}
                onClick={saveCustomerName}
              >
                שמור שם
              </Button>
            </div>

            {jobs.length > 0 && (
              <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="text-base font-semibold">בקשות עבודה</h2>
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="space-y-2 rounded-xl border border-border/70 p-3 text-base"
                  >
                    <p className="font-medium">{job.problem || "—"}</p>
                    {job.address_text && <p>{job.address_text}</p>}
                    {job.customer_availability && (
                      <p className="text-muted-foreground">
                        זמינות: {job.customer_availability}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {formatTime(job.created_at)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {!isTerminalJobStatus(job.status as JobStatus) ? (
                        <>
                          {job.status === "owner_handling" || job.in_diary ? (
                            <Badge variant="secondary">בטיפול · ביומן</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                setJobStatus(job.id, "owner_handling")
                              }
                            >
                              בטיפול
                            </Button>
                          )}
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setPaymentDraft("");
                              setIncludesVat(true);
                              setPendingCompleteJobId(job.id);
                            }}
                          >
                            בוצע
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => setPendingCancelJobId(job.id)}
                          >
                            בוטל
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => restoreJob(job.id)}
                        >
                          שחזר
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {media.length > 0 && (
              <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="text-base font-semibold">תמונות</h2>
                <div className="grid grid-cols-2 gap-2">
                  {media.map((item) =>
                    item.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={item.id}
                        src={item.url}
                        alt="תמונת בקשה"
                        className="h-28 w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div
                        key={item.id}
                        className="flex h-28 items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground"
                      >
                        אין תצוגה
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="מחיקת שיחה"
        description={`למחוק את השיחה עם ${deleteLabel}?\nהודעות ובקשות עבודה משויכות יימחקו גם כן.`}
        confirmLabel="מחק"
        destructive
        busy={busy}
        onConfirm={deleteThisConversation}
      />

      <Dialog
        open={Boolean(pendingCompleteJobId)}
        onOpenChange={(open) => {
          if (!open) setPendingCompleteJobId(null);
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl" showCloseButton={false}>
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg">סימון כבוצע</DialogTitle>
            <DialogDescription className="text-base">
              אפשר לרשום כמה שולם על העבודה (אופציונלי).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="thread-payment">סכום התשלום (₪)</Label>
              <Input
                id="thread-payment"
                inputMode="decimal"
                placeholder="לדוגמה 350"
                value={paymentDraft}
                onChange={(event) => setPaymentDraft(event.target.value)}
                disabled={busy}
              />
            </div>
            <label className="flex items-center gap-3 text-base">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={includesVat}
                onChange={(event) => setIncludesVat(event.target.checked)}
                disabled={busy || !paymentDraft.trim()}
              />
              הסכום כולל מע״מ
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              disabled={busy}
              onClick={() => {
                if (!pendingCompleteJobId) return;
                void completeJob(pendingCompleteJobId);
              }}
            >
              {busy ? "מבצע..." : "אשר בוצע"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPendingCompleteJobId(null)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingCancelJobId)}
        onOpenChange={(open) => {
          if (!open) setPendingCancelJobId(null);
        }}
        title="ביטול בקשה"
        description="לסמן את הבקשה כבוטל?"
        confirmLabel="בוטל"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!pendingCancelJobId) return;
          await cancelJob(pendingCancelJobId);
        }}
      />
    </ChatShell>
  );
}

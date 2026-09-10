"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChatShell } from "@/components/dashboard/chat-shell";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";

type AssistantMessage = {
  id: string;
  role: "owner" | "assistant";
  content: string;
  created_at: string;
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

export default function OwnerAssistantPage() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function refresh() {
    const response = await apiFetch("/api/assistant/messages");
    const json = await response.json();
    if (!json.ok) {
      throw new Error(json.error || "Failed to load messages");
    }
    setMessages(json.messages ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בטעינה");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function sendMessage() {
    const text = draft.trim();
    if (!text || pending) return;

    setError(null);
    setDraft("");
    const optimisticId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: "owner",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);

    startTransition(async () => {
      try {
        const response = await apiFetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const json = await response.json();
        if (!json.ok) {
          throw new Error(json.error || "Failed to chat");
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בשליחה");
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setDraft(text);
      }
    });
  }

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
        <div className="min-w-0 px-1">
          <p className="truncate text-sm font-semibold leading-tight">
            העוזר שלי
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            ניהול קריאות, הודעות ללקוחות ועוד
          </p>
        </div>
      }
    >
      {loading && (
        <p className="px-4 py-2 text-sm text-muted-foreground">טוען שיחה...</p>
      )}
      {error && (
        <p className="mx-3 mt-2 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3">
        {!loading && messages.length === 0 && (
          <div className="mx-auto max-w-sm px-2 py-8 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">איך אפשר לעזור?</p>
            <p className="mt-2">
              למשל: ״תדחה לי את איתי בחצי שעה ותגיד לו שיש לי עיכוב״
            </p>
          </div>
        )}
        {messages.map((message) => {
          const isOwner = message.role === "owner";
          return (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                isOwner
                  ? "self-end border-2 border-foreground/20 bg-accent text-accent-foreground"
                  : "self-start border border-border bg-secondary text-secondary-foreground",
              )}
            >
              <p className="mb-1 text-[11px] font-medium opacity-70">
                {isOwner ? "אתה" : "העוזר"} · {formatTime(message.created_at)}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          );
        })}
        {pending && (
          <div className="self-start rounded-2xl border border-border bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
            חושב...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            rows={1}
            placeholder="כתוב לעוזר..."
            disabled={pending}
            className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
          />
          <Button
            className="min-h-11 min-w-14 px-4 active:scale-[0.98]"
            onClick={sendMessage}
            disabled={pending || !draft.trim()}
          >
            שלח
          </Button>
        </div>
      </div>
    </ChatShell>
  );
}

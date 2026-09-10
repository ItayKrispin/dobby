"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { apiFetch } from "@/lib/api-fetch";

type Conversation = {
  id: string;
  phone: string;
  customer_name: string | null;
  last_message_at: string;
  last_message_preview: string;
  openJobCount: number;
  hasEmergency: boolean;
  hasIntakeDraft: boolean;
  aiPaused: boolean;
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

export default function DashboardPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingPhone, setDeletingPhone] = useState<string | null>(null);

  async function refresh() {
    try {
      const conversationsRes = await apiFetch("/api/conversations");
      const conversationsJson = await conversationsRes.json();

      if (!conversationsJson.ok) {
        throw new Error(conversationsJson.error || "Failed to load conversations");
      }

      setConversations(conversationsJson.conversations ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }

  async function deleteConversation(phone: string, label: string) {
    const confirmed = window.confirm(
      `למחוק את השיחה עם ${label}?\nהודעות וקריאות משויכות יימחקו גם כן.`,
    );
    if (!confirmed) return;

    setDeletingPhone(phone);
    try {
      const response = await apiFetch(
        `/api/conversations/${encodeURIComponent(phone)}`,
        { method: "DELETE" },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to delete");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה במחיקה");
    } finally {
      setDeletingPhone(null);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <DashboardShell
      title="תיבת שיחות"
      subtitle="קריאות ושיחות AI עם לקוחות בוואטסאפ"
      actions={
        <Button
          variant="outline"
          className="min-h-11 shrink-0 px-4 active:scale-[0.98]"
          onClick={() => refresh()}
        >
          רענון
        </Button>
      }
    >
      {loading && (
        <p className="text-sm text-muted-foreground">טוען שיחות...</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && conversations.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center text-muted-foreground">
          עדיין אין שיחות. שלח הודעה בוואטסאפ או דרך /api/dev/chat.
        </p>
      )}

      <ul className="space-y-2.5">
        {conversations.map((conversation) => {
          const displayName = conversation.customer_name?.trim();
          const label = displayName || conversation.phone;
          return (
            <li key={conversation.id} className="flex items-stretch gap-2">
              <Link
                href={`/dashboard/${encodeURIComponent(conversation.phone)}`}
                className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_1px_0_oklch(0.84_0.015_75)] transition hover:bg-accent/50 active:scale-[0.98] active:bg-accent/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="truncate font-semibold">{label}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTime(conversation.last_message_at)}
                    </span>
                  </div>
                  {displayName && (
                    <p
                      className="mb-1 text-xs tracking-wide text-muted-foreground"
                      dir="ltr"
                    >
                      {conversation.phone}
                    </p>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {conversation.last_message_preview || "—"}
                    </p>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                      {conversation.hasEmergency && (
                        <Badge variant="destructive">חירום</Badge>
                      )}
                      {conversation.aiPaused && (
                        <Badge variant="destructive">AI מושהה</Badge>
                      )}
                      {conversation.hasIntakeDraft && (
                        <Badge variant="secondary">טיוטה</Badge>
                      )}
                      {conversation.openJobCount > 0 && (
                        <Badge variant="secondary">
                          {conversation.openJobCount} קריאות
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronLeft
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
              <Button
                variant="destructive"
                className="min-h-16 shrink-0 px-3 active:scale-[0.98]"
                disabled={deletingPhone === conversation.phone}
                onClick={() => deleteConversation(conversation.phone, label)}
                aria-label={`מחק שיחה עם ${label}`}
              >
                {deletingPhone === conversation.phone ? "..." : "מחק"}
              </Button>
            </li>
          );
        })}
      </ul>
    </DashboardShell>
  );
}

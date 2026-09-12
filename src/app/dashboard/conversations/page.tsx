"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { CallButton } from "@/components/dashboard/call-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ListRow } from "@/components/dashboard/list-row";
import { RowActions } from "@/components/dashboard/row-actions";
import { apiFetch } from "@/lib/api-fetch";
import {
  fetchConversations,
  pollMs,
  queryKeys,
  type ConversationListItem,
} from "@/lib/dashboard-query";

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

function sortConversations(list: ConversationListItem[]) {
  return [...list].sort((a, b) => {
    const aPinned = a.pinned_at ? 1 : 0;
    const bPinned = b.pinned_at ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    if (a.pinned_at && b.pinned_at) {
      return b.pinned_at.localeCompare(a.pinned_at);
    }
    return b.last_message_at.localeCompare(a.last_message_at);
  });
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [deletingPhone, setDeletingPhone] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    phone: string;
    label: string;
  } | null>(null);
  const mutatingRef = useRef(false);

  const {
    data: conversations = [],
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async () => {
      if (mutatingRef.current) {
        return (
          queryClient.getQueryData<ConversationListItem[]>(
            queryKeys.conversations,
          ) ?? []
        );
      }
      return sortConversations(await fetchConversations());
    },
    refetchInterval: pollMs.conversations,
  });

  const showSkeleton = isLoading && conversations.length === 0;
  const loadError =
    error instanceof Error ? error.message : error ? "שגיאה בטעינה" : null;

  async function deleteConversation(phone: string) {
    const previous = queryClient.getQueryData<ConversationListItem[]>(
      queryKeys.conversations,
    );
    mutatingRef.current = true;
    setDeletingPhone(phone);
    queryClient.setQueryData<ConversationListItem[]>(
      queryKeys.conversations,
      (prev) => (prev ?? []).filter((item) => item.phone !== phone),
    );
    setPendingDelete(null);
    try {
      const response = await apiFetch(
        `/api/conversations/${encodeURIComponent(phone)}`,
        { method: "DELETE" },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to delete");
      }
      toast.success("השיחה נמחקה");
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(queryKeys.conversations, previous);
      }
      toast.error(err instanceof Error ? err.message : "שגיאה במחיקה");
    } finally {
      setDeletingPhone(null);
      mutatingRef.current = false;
    }
  }

  async function togglePin(conversation: ConversationListItem) {
    const nextPinned = !conversation.pinned_at;
    const previous = queryClient.getQueryData<ConversationListItem[]>(
      queryKeys.conversations,
    );
    mutatingRef.current = true;
    queryClient.setQueryData<ConversationListItem[]>(
      queryKeys.conversations,
      (prev) =>
        sortConversations(
          (prev ?? []).map((item) =>
            item.id === conversation.id
              ? {
                  ...item,
                  pinned_at: nextPinned ? new Date().toISOString() : null,
                }
              : item,
          ),
        ),
    );
    try {
      const response = await apiFetch(
        `/api/conversations/${encodeURIComponent(conversation.phone)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: nextPinned }),
        },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to pin");
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(queryKeys.conversations, previous);
      }
      toast.error(
        err instanceof Error ? err.message : "לא הצלחתי לעדכן נעיצה",
      );
    } finally {
      mutatingRef.current = false;
    }
  }

  return (
    <DashboardShell
      title="שיחות"
      subtitle="בקשות עבודה ושיחות עם לקוחות בוואטסאפ"
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          רענון
        </Button>
      }
    >
      {showSkeleton && (
        <div className="space-y-3">
          <Skeleton className="h-[4.5rem] w-full rounded-2xl" />
          <Skeleton className="h-[4.5rem] w-full rounded-2xl" />
          <Skeleton className="h-[4.5rem] w-full rounded-2xl" />
        </div>
      )}
      {loadError && (
        <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {loadError}
        </p>
      )}

      {!showSkeleton && conversations.length === 0 && !loadError && (
        <EmptyState
          title="עדיין אין שיחות"
          description="כשלקוח כותב בוואטסאפ, השיחה תופיע כאן."
        />
      )}

      <ul className="space-y-2.5">
        {conversations.map((conversation) => {
          const displayName = conversation.customer_name?.trim();
          const label = displayName || conversation.phone;
          const pinned = Boolean(conversation.pinned_at);
          return (
            <li key={conversation.id}>
              <ListRow
                href={`/dashboard/${encodeURIComponent(conversation.phone)}`}
                title={label}
                leading={
                  pinned ? (
                    <Pin
                      className="size-4 fill-primary text-primary"
                      aria-label="נעוץ"
                    />
                  ) : undefined
                }
                className={pinned ? "border-primary/30 bg-accent/20" : undefined}
                subtitle={
                  displayName ? (
                    <span dir="ltr" className="tracking-wide">
                      {conversation.phone}
                    </span>
                  ) : undefined
                }
                preview={conversation.last_message_preview || "—"}
                meta={formatTime(conversation.last_message_at)}
                badges={
                  <>
                    {conversation.aiPaused && (
                      <Badge variant="destructive">AI מושהה</Badge>
                    )}
                    {conversation.openJobCount > 0 && (
                      <Badge variant="secondary">
                        {conversation.openJobCount} בקשות
                      </Badge>
                    )}
                  </>
                }
                actions={
                  <div className="flex items-center gap-0.5 pe-1">
                    <CallButton phone={conversation.phone} />
                    <RowActions
                      items={[
                        {
                          label: pinned ? "בטל נעיצה" : "נעץ",
                          onSelect: () => togglePin(conversation),
                        },
                        {
                          label: "מחק שיחה",
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () =>
                            setPendingDelete({
                              phone: conversation.phone,
                              label,
                            }),
                        },
                      ]}
                    />
                  </div>
                }
              />
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="מחיקת שיחה"
        description={
          pendingDelete
            ? `למחוק את השיחה עם ${pendingDelete.label}?\nהודעות ובקשות עבודה משויכות יימחקו גם כן.`
            : ""
        }
        confirmLabel="מחק"
        destructive
        busy={Boolean(pendingDelete && deletingPhone === pendingDelete.phone)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteConversation(pendingDelete.phone);
        }}
      />
    </DashboardShell>
  );
}

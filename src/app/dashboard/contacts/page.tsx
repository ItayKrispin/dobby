"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarInitials } from "@/components/dashboard/avatar-initials";
import { BackLink } from "@/components/dashboard/back-link";
import { CallButton } from "@/components/dashboard/call-button";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowActions } from "@/components/dashboard/row-actions";
import { apiFetch } from "@/lib/api-fetch";
import {
  fetchContacts,
  queryKeys,
  type ContactItem,
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

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>(
    {},
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState<string | null>(null);
  const [deletingPhone, setDeletingPhone] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    phone: string;
    label: string;
  } | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);

  const {
    data: contacts = [],
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.contacts,
    queryFn: fetchContacts,
  });

  const baseDrafts = useMemo(
    () =>
      Object.fromEntries(
        contacts.map((contact) => [
          contact.phone,
          contact.customer_name ?? "",
        ]),
      ),
    [contacts],
  );

  const drafts = useMemo(
    () => ({ ...baseDrafts, ...draftOverrides }),
    [baseDrafts, draftOverrides],
  );

  const showSkeleton = isLoading && contacts.length === 0;
  const loadError =
    actionError ??
    (error instanceof Error ? error.message : error ? "שגיאה בטעינה" : null);

  async function saveName(phone: string) {
    setSavingPhone(phone);
    try {
      const value = (drafts[phone] ?? "").trim();
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
      setEditingPhone(null);
      setDraftOverrides((prev) => {
        const next = { ...prev };
        delete next[phone];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSavingPhone(null);
    }
  }

  async function deleteContact(phone: string) {
    setDeletingPhone(phone);
    try {
      const response = await apiFetch(
        `/api/contacts/${encodeURIComponent(phone)}`,
        { method: "DELETE" },
      );
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to delete contact");
      }
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה במחיקה");
    } finally {
      setDeletingPhone(null);
    }
  }

  return (
    <DashboardShell
      title="אנשי קשר"
      subtitle="שמות לקוחות לפי מספר טלפון"
      leading={<BackLink href="/dashboard/more" />}
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
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      )}
      {loadError && (
        <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {loadError}
        </p>
      )}

      {!showSkeleton && contacts.length === 0 && !loadError && (
        <EmptyState
          title="עדיין אין אנשי קשר"
          description="שיחה בוואטסאפ יוצרת איש קשר אוטומטית."
        />
      )}

      <ul className="space-y-2.5">
        {contacts.map((contact: ContactItem) => {
          const draft = drafts[contact.phone] ?? "";
          const saved = contact.customer_name ?? "";
          const dirty = draft.trim() !== saved;
          const displayName = contact.customer_name?.trim() || contact.phone;
          const isEditing = editingPhone === contact.phone;

          return (
            <li
              key={contact.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <Link
                  href={`/dashboard/${encodeURIComponent(contact.phone)}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <AvatarInitials name={displayName} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">
                      {displayName}
                    </p>
                    <p
                      className="text-sm tracking-wide text-muted-foreground"
                      dir="ltr"
                    >
                      {contact.phone}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      עדכון אחרון · {formatTime(contact.last_message_at)}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-0.5">
                  <CallButton phone={contact.phone} />
                  <RowActions
                    items={[
                      {
                        label: "ערוך שם",
                        onSelect: () => setEditingPhone(contact.phone),
                      },
                      {
                        label: "מחק",
                        destructive: true,
                        separatorBefore: true,
                        onSelect: () =>
                          setPendingDelete({
                            phone: contact.phone,
                            label: displayName,
                          }),
                      },
                    ]}
                  />
                </div>
              </div>

              {isEditing && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={draft}
                    onChange={(event) =>
                      setDraftOverrides((prev) => ({
                        ...prev,
                        [contact.phone]: event.target.value,
                      }))
                    }
                    placeholder="שם לקוח (אופציונלי)"
                  />
                  <Button
                    disabled={!dirty || savingPhone === contact.phone}
                    onClick={() => saveName(contact.phone)}
                  >
                    {savingPhone === contact.phone ? "שומר..." : "שמור"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingPhone(null);
                      setDraftOverrides((prev) => {
                        const next = { ...prev };
                        delete next[contact.phone];
                        return next;
                      });
                    }}
                  >
                    ביטול
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="מחיקת איש קשר"
        description={
          pendingDelete
            ? `למחוק את איש הקשר ${pendingDelete.label}?\nהשיחה, ההודעות ובקשות העבודה המשויכות יימחקו.`
            : ""
        }
        confirmLabel="מחק"
        destructive
        busy={Boolean(pendingDelete && deletingPhone === pendingDelete.phone)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteContact(pendingDelete.phone);
        }}
      />
    </DashboardShell>
  );
}

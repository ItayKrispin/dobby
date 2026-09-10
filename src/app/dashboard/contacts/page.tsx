"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";

type Contact = {
  id: string;
  phone: string;
  customer_name: string | null;
  last_message_at: string;
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

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPhone, setSavingPhone] = useState<string | null>(null);
  const [deletingPhone, setDeletingPhone] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await apiFetch("/api/contacts");
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to load contacts");
      }
      const list = (json.contacts ?? []) as Contact[];
      setContacts(list);
      setDrafts(
        Object.fromEntries(
          list.map((contact) => [contact.phone, contact.customer_name ?? ""]),
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSavingPhone(null);
    }
  }

  async function deleteContact(phone: string) {
    const confirmed = window.confirm(
      `למחוק את איש הקשר ${phone}?\nהשיחה, ההודעות והקריאות המשויכות יימחקו.`,
    );
    if (!confirmed) return;

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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה במחיקה");
    } finally {
      setDeletingPhone(null);
    }
  }

  return (
    <DashboardShell
      title="אנשי קשר"
      subtitle="שמות לקוחות לפי מספר טלפון — ריק = מספר בלבד"
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
        <p className="text-sm text-muted-foreground">טוען אנשי קשר...</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && contacts.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center text-muted-foreground">
          עדיין אין אנשי קשר. שיחה בוואטסאפ יוצרת איש קשר אוטומטית.
        </p>
      )}

      <ul className="space-y-3">
        {contacts.map((contact) => {
          const draft = drafts[contact.phone] ?? "";
          const saved = contact.customer_name ?? "";
          const dirty = draft.trim() !== saved;
          return (
            <li
              key={contact.id}
              className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_0_oklch(0.84_0.015_75)]"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold tracking-wide" dir="ltr">
                    {contact.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    עדכון אחרון · {formatTime(contact.last_message_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/${encodeURIComponent(contact.phone)}`}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "min-h-11 px-4 active:scale-[0.98]",
                    )}
                  >
                    פתח שיחה
                  </Link>
                  <Button
                    variant="destructive"
                    className="min-h-11 px-4 active:scale-[0.98]"
                    disabled={deletingPhone === contact.phone}
                    onClick={() => deleteContact(contact.phone)}
                  >
                    {deletingPhone === contact.phone ? "מוחק..." : "מחק"}
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={draft}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [contact.phone]: event.target.value,
                    }))
                  }
                  placeholder="שם לקוח (אופציונלי)"
                  className="min-h-11 flex-1 rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
                />
                <Button
                  className="min-h-11 px-5 active:scale-[0.98]"
                  disabled={!dirty || savingPhone === contact.phone}
                  onClick={() => saveName(contact.phone)}
                >
                  {savingPhone === contact.phone ? "שומר..." : "שמור"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </DashboardShell>
  );
}

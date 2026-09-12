"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowActions } from "@/components/dashboard/row-actions";
import { apiFetch } from "@/lib/api-fetch";
import {
  SERVICE_SUGGESTIONS_BY_TRADE,
  serviceNamePlaceholder,
} from "@/lib/business-shared";
import { fetchServices, queryKeys } from "@/lib/dashboard-query";

export type ServiceItem = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
};

type EditDraft = {
  name: string;
  durationMinutes: string;
  price: string;
};

const emptyCreate = {
  name: "",
  durationMinutes: "",
  price: "",
};

type ServicesManagerProps = {
  trade?: string;
  onError?: (message: string | null) => void;
};

export function ServicesManager({
  trade = "plumber",
  onError,
}: ServicesManagerProps) {
  const queryClient = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ServiceItem | null>(null);

  const {
    data: services = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.services,
    queryFn: async () => (await fetchServices()) as ServiceItem[],
  });

  const loading = isLoading && services.length === 0;
  const suggestions =
    SERVICE_SUGGESTIONS_BY_TRADE[trade] ?? SERVICE_SUGGESTIONS_BY_TRADE.custom;
  const unusedSuggestions = suggestions.filter(
    (name) =>
      !services.some((service) => service.name === name && service.isActive),
  );

  function reportError(message: string | null) {
    setLocalError(message);
    onError?.(message);
  }

  const queryLoadError = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "שגיאה בטעינת שירותים"
    : null;
  const displayError = localError ?? queryLoadError;

  async function refresh() {
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.services });
      reportError(null);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "שגיאה בטעינת שירותים");
    }
  }

  async function createService(overrideName?: string) {
    const name = (overrideName ?? createForm.name).trim();
    const durationMinutes = Number(createForm.durationMinutes || "60");
    const price = Number(createForm.price || "0");

    if (!name) {
      reportError("יש להזין שם שירות");
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      reportError("משך בדקות חייב להיות מספר שלם חיובי");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      reportError("מחיר חייב להיות מספר שאינו שלילי");
      return;
    }

    setCreating(true);
    try {
      const response = await apiFetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          durationMinutes,
          price,
          sortOrder: services.length,
        }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to create service");
      }
      setCreateForm(emptyCreate);
      await refresh();
    } catch (err) {
      reportError(err instanceof Error ? err.message : "שגיאה ביצירה");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(service: ServiceItem) {
    setEditingId(service.id);
    setEditDraft({
      name: service.name,
      durationMinutes: String(service.durationMinutes),
      price: String(service.price),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit(id: string) {
    if (!editDraft) return;

    const name = editDraft.name.trim();
    const durationMinutes = Number(editDraft.durationMinutes);
    const price = Number(editDraft.price);

    if (!name) {
      reportError("יש להזין שם שירות");
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      reportError("משך בדקות חייב להיות מספר שלם חיובי");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      reportError("מחיר חייב להיות מספר שאינו שלילי");
      return;
    }

    setBusyId(id);
    try {
      const response = await apiFetch(`/api/services/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, durationMinutes, price }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to update service");
      }
      cancelEdit();
      await refresh();
    } catch (err) {
      reportError(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(id: string, isActive: boolean) {
    setBusyId(id);
    try {
      const response = await apiFetch(`/api/services/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to update service");
      }
      if (editingId === id) cancelEdit();
      await refresh();
    } catch (err) {
      reportError(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setBusyId(null);
    }
  }

  async function removeService(id: string) {
    setBusyId(id);
    try {
      const response = await apiFetch(`/api/services/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to delete service");
      }
      if (editingId === id) cancelEdit();
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      reportError(err instanceof Error ? err.message : "שגיאה במחיקה");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {loading && (
        <p className="text-base text-muted-foreground">טוען שירותים...</p>
      )}
      {displayError && !onError && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {displayError}
        </p>
      )}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">הוסף סוג קריאה</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
          <Input
            value={createForm.name}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder={serviceNamePlaceholder(trade)}
          />
          <Input
            type="number"
            min={1}
            step={1}
            value={createForm.durationMinutes}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                durationMinutes: event.target.value,
              }))
            }
            placeholder="דקות"
            aria-label="משך בדקות"
          />
          <Input
            type="number"
            min={0}
            step={1}
            value={createForm.price}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, price: event.target.value }))
            }
            placeholder="מחיר"
            aria-label="מחיר בשקלים"
          />
          <Button disabled={creating} onClick={() => createService()}>
            {creating ? "מוסיף..." : "הוסף"}
          </Button>
        </div>
        {unusedSuggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">הצעות להוספה:</p>
            <div className="flex flex-wrap gap-2">
              {unusedSuggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={creating}
                  onClick={() => createService(suggestion)}
                >
                  + {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      {!loading && services.length === 0 && !displayError && (
        <EmptyState
          title="עדיין אין סוגי קריאות"
          description="הוסיפו סוג למעלה או בחרו מההצעות."
        />
      )}

      <ul className="space-y-3">
        {services.map((service) => {
          const isEditing = editingId === service.id;
          const busy = busyId === service.id;
          return (
            <li
              key={service.id}
              className={`rounded-2xl border border-border bg-background/70 p-4 ${
                service.isActive ? "" : "opacity-70"
              }`}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{service.name}</p>
                    <Badge variant={service.isActive ? "secondary" : "outline"}>
                      {service.isActive ? "פעיל" : "מושבת"}
                    </Badge>
                  </div>
                  {!isEditing && (
                    <p className="mt-0.5 text-base text-muted-foreground">
                      {service.durationMinutes} דק׳ · ₪{service.price}
                    </p>
                  )}
                </div>
                <RowActions
                  items={[
                    {
                      label: "ערוך",
                      onSelect: () => startEdit(service),
                      disabled: busy,
                    },
                    {
                      label: service.isActive ? "השבת" : "הפעל",
                      onSelect: () => setActive(service.id, !service.isActive),
                      disabled: busy,
                    },
                    {
                      label: "מחק",
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => setPendingDelete(service),
                      disabled: busy,
                    },
                  ]}
                />
              </div>

              {isEditing && editDraft && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_6rem]">
                  <Input
                    value={editDraft.name}
                    onChange={(event) =>
                      setEditDraft((prev) =>
                        prev ? { ...prev, name: event.target.value } : prev,
                      )
                    }
                  />
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={editDraft.durationMinutes}
                    onChange={(event) =>
                      setEditDraft((prev) =>
                        prev
                          ? { ...prev, durationMinutes: event.target.value }
                          : prev,
                      )
                    }
                    aria-label="משך בדקות"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={editDraft.price}
                    onChange={(event) =>
                      setEditDraft((prev) =>
                        prev ? { ...prev, price: event.target.value } : prev,
                      )
                    }
                    aria-label="מחיר בשקלים"
                  />
                  <div className="flex gap-2 sm:col-span-3">
                    <Button
                      className="flex-1"
                      disabled={busy}
                      onClick={() => saveEdit(service.id)}
                    >
                      {busy ? "שומר..." : "שמור"}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={busy}
                      onClick={cancelEdit}
                    >
                      ביטול
                    </Button>
                  </div>
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
        title="מחיקת סוג קריאה"
        description={
          pendingDelete
            ? `למחוק את "${pendingDelete.name}"?\nפעולה זו אינה ניתנת לביטול.`
            : ""
        }
        confirmLabel="מחק"
        destructive
        busy={Boolean(pendingDelete && busyId === pendingDelete.id)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await removeService(pendingDelete.id);
        }}
      />
    </div>
  );
}

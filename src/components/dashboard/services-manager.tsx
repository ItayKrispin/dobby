"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";

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
  onError?: (message: string | null) => void;
};

export function ServicesManager({ onError }: ServicesManagerProps) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  function reportError(message: string | null) {
    setLocalError(message);
    onError?.(message);
  }

  async function refresh() {
    try {
      const response = await apiFetch("/api/services");
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to load services");
      }
      setServices((json.services ?? []) as ServiceItem[]);
      reportError(null);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "שגיאה בטעינת שירותים");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createService() {
    const name = createForm.name.trim();
    const durationMinutes = Number(createForm.durationMinutes);
    const price = Number(createForm.price);

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

  async function removeService(id: string, name: string) {
    const confirmed = window.confirm(
      `למחוק את השירות "${name}"?\nפעולה זו אינה ניתנת לביטול.`,
    );
    if (!confirmed) return;

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
        <p className="text-sm text-muted-foreground">טוען שירותים...</p>
      )}
      {localError && !onError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {localError}
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[0_1px_0_oklch(0.84_0.015_75)]">
        <h3 className="text-sm font-semibold">הוסף שירות</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
          <input
            value={createForm.name}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="שם (למשל תספורת גבר)"
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
          />
          <input
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
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
          />
          <input
            type="number"
            min={0}
            step={1}
            value={createForm.price}
            onChange={(event) =>
              setCreateForm((prev) => ({ ...prev, price: event.target.value }))
            }
            placeholder="מחיר"
            aria-label="מחיר בשקלים"
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
          />
          <Button
            className="min-h-11 px-5 active:scale-[0.98]"
            disabled={creating}
            onClick={createService}
          >
            {creating ? "מוסיף..." : "הוסף"}
          </Button>
        </div>
      </section>

      {!loading && services.length === 0 && !localError && (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center text-muted-foreground">
          עדיין אין סוגי קריאות. הוסף סוג למעלה.
        </p>
      )}

      <ul className="space-y-3">
        {services.map((service) => {
          const isEditing = editingId === service.id;
          const busy = busyId === service.id;
          return (
            <li
              key={service.id}
              className={`rounded-xl border border-border bg-card p-4 shadow-[0_1px_0_oklch(0.84_0.015_75)] ${
                service.isActive ? "" : "opacity-70"
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{service.name}</p>
                    <Badge variant={service.isActive ? "secondary" : "outline"}>
                      {service.isActive ? "פעיל" : "מושבת"}
                    </Badge>
                  </div>
                  {!isEditing && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {service.durationMinutes} דק׳ · ₪{service.price}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isEditing && (
                    <Button
                      variant="outline"
                      className="min-h-11 px-4 active:scale-[0.98]"
                      disabled={busy}
                      onClick={() => startEdit(service)}
                    >
                      ערוך
                    </Button>
                  )}
                  {service.isActive ? (
                    <Button
                      variant="outline"
                      className="min-h-11 px-4 active:scale-[0.98]"
                      disabled={busy}
                      onClick={() => setActive(service.id, false)}
                    >
                      {busy ? "..." : "השבת"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="min-h-11 px-4 active:scale-[0.98]"
                      disabled={busy}
                      onClick={() => setActive(service.id, true)}
                    >
                      {busy ? "..." : "הפעל"}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    className="min-h-11 px-4 active:scale-[0.98]"
                    disabled={busy}
                    onClick={() => removeService(service.id, service.name)}
                  >
                    {busy ? "..." : "מחק"}
                  </Button>
                </div>
              </div>

              {isEditing && editDraft && (
                <div className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem]">
                  <input
                    value={editDraft.name}
                    onChange={(event) =>
                      setEditDraft((prev) =>
                        prev ? { ...prev, name: event.target.value } : prev,
                      )
                    }
                    className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
                  />
                  <input
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
                    className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
                  />
                  <input
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
                    className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
                  />
                  <div className="flex gap-2 sm:col-span-3">
                    <Button
                      className="min-h-11 flex-1 active:scale-[0.98]"
                      disabled={busy}
                      onClick={() => saveEdit(service.id)}
                    >
                      {busy ? "שומר..." : "שמור"}
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11 flex-1 active:scale-[0.98]"
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
    </div>
  );
}

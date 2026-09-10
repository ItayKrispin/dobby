"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FieldInfo } from "@/components/dashboard/field-info";
import { ServicesManager } from "@/components/dashboard/services-manager";
import { apiFetch } from "@/lib/api-fetch";
import {
  formatIntervalsSummary,
  HEBREW_WEEKDAYS,
  TRADE_OPTIONS,
  type HoursInterval,
  type PhotoPolicy,
  type WeekdayHours,
} from "@/lib/business-shared";

type ProfileState = {
  name: string;
  trade: string;
  persona: string;
  serviceArea: string;
  ownerNotifyPhone: string;
  photoPolicy: PhotoPolicy;
  emergencyPolicy: string;
  hours: WeekdayHours[];
};

type SectionKey = "details" | "hours" | "services";

function parseHm(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function formatHm(totalMinutes: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 45, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function suggestNextInterval(intervals: HoursInterval[]): HoursInterval {
  if (intervals.length === 0) {
    return { open: "09:00", close: "13:00" };
  }
  const last = intervals[intervals.length - 1];
  const open = formatHm(parseHm(last.close) + 60);
  const close = formatHm(Math.min(parseHm(open) + 4 * 60, 20 * 60));
  if (parseHm(open) >= parseHm(close)) {
    return { open: last.close, close: formatHm(parseHm(last.close) + 60) };
  }
  return { open, close };
}

export default function BusinessPage() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("plumber");
  const [persona, setPersona] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [ownerNotifyPhone, setOwnerNotifyPhone] = useState("");
  const [photoPolicy, setPhotoPolicy] = useState<PhotoPolicy>("if_helpful");
  const [emergencyPolicy, setEmergencyPolicy] = useState("");
  const [hours, setHours] = useState<WeekdayHours[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    details: false,
    hours: false,
    services: false,
  });

  function setSectionOpen(key: SectionKey, open: boolean) {
    setOpenSections((prev) => ({ ...prev, [key]: open }));
  }

  async function refresh() {
    try {
      const response = await apiFetch("/api/business");
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to load business profile");
      }
      const next = json.profile as ProfileState;
      setProfile(next);
      setName(next.name);
      setTrade(next.trade);
      setPersona(next.persona);
      setServiceArea(next.serviceArea);
      setOwnerNotifyPhone(next.ownerNotifyPhone);
      setPhotoPolicy(next.photoPolicy);
      setEmergencyPolicy(next.emergencyPolicy);
      setHours(next.hours);
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

  const hoursSummary = useMemo(() => {
    const openDays = hours.filter((day) => day.isOpen);
    if (openDays.length === 0) return "כל הימים סגורים";
    return `${openDays.length} ימים פתוחים · לחץ לעריכה`;
  }, [hours]);

  const detailsSummary = useMemo(() => {
    if (!name) return "לחץ לעריכה";
    const tradeLabel =
      TRADE_OPTIONS.find((option) => option.value === trade)?.label ?? trade;
    return `${name} · ${tradeLabel}`;
  }, [name, trade]);

  async function saveDetails() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("יש להזין שם עסק");
      return;
    }

    setSavingDetails(true);
    try {
      const response = await apiFetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          trade,
          persona,
          serviceArea,
          ownerNotifyPhone,
          photoPolicy,
          emergencyPolicy,
        }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to save");
      }
      const next = json.profile as ProfileState;
      setProfile(next);
      setName(next.name);
      setTrade(next.trade);
      setPersona(next.persona);
      setServiceArea(next.serviceArea);
      setOwnerNotifyPhone(next.ownerNotifyPhone);
      setPhotoPolicy(next.photoPolicy);
      setEmergencyPolicy(next.emergencyPolicy);
      setHours(next.hours);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveHours() {
    setSavingHours(true);
    try {
      const response = await apiFetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to save hours");
      }
      const next = json.profile as ProfileState;
      setProfile(next);
      setHours(next.hours);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת שעות");
    } finally {
      setSavingHours(false);
    }
  }

  function setDayOpen(dayOfWeek: number, isOpen: boolean) {
    setHours((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day;
        const intervals =
          isOpen && day.intervals.length === 0
            ? [{ open: "09:00", close: "20:00" }]
            : day.intervals;
        return { ...day, isOpen, intervals };
      }),
    );
  }

  function updateInterval(
    dayOfWeek: number,
    index: number,
    patch: Partial<HoursInterval>,
  ) {
    setHours((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day;
        return {
          ...day,
          intervals: day.intervals.map((interval, i) =>
            i === index ? { ...interval, ...patch } : interval,
          ),
        };
      }),
    );
  }

  function addInterval(dayOfWeek: number) {
    setHours((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day;
        return {
          ...day,
          isOpen: true,
          intervals: [...day.intervals, suggestNextInterval(day.intervals)],
        };
      }),
    );
  }

  function removeInterval(dayOfWeek: number, index: number) {
    setHours((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day;
        const intervals = day.intervals.filter((_, i) => i !== index);
        return {
          ...day,
          intervals:
            intervals.length > 0 ? intervals : [{ open: "09:00", close: "20:00" }],
          isOpen: intervals.length > 0 ? day.isOpen : false,
        };
      }),
    );
  }

  return (
    <DashboardShell
      title="העסק"
      subtitle="פרופיל, שעות, מדיניות קריאות וסוגי עבודות"
      actions={
        <Button
          variant="outline"
          className="min-h-11 shrink-0 px-4 active:scale-[0.98]"
          onClick={() => {
            setLoading(true);
            refresh();
          }}
        >
          רענון
        </Button>
      }
    >
      {loading && (
        <p className="text-sm text-muted-foreground">טוען פרופיל עסק...</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && profile && (
        <div className="space-y-3">
          <CollapsibleSection
            title="פרטי העסק"
            summary={detailsSummary}
            infoTitle="פרטי העסק"
            infoText="שם העסק והמקצוע מופיעים בשיחות של דובי עם הלקוחות. מספר הוואטסאפ להתראות הוא המספר שלך לקבלת חבילות קריאה."
            open={openSections.details}
            onOpenChange={(open) => setSectionOpen("details", open)}
          >
            <label className="block space-y-1.5">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                שם העסק
                <FieldInfo title="שם העסק">
                  השם שדובי מציג ללקוחות (למשל ״האינסטלטור של דני״).
                </FieldInfo>
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">מקצוע</span>
              <select
                value={trade}
                onChange={(event) => setTrade(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
              >
                {TRADE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">אזור שירות</span>
              <input
                value={serviceArea}
                onChange={(event) => setServiceArea(event.target.value)}
                placeholder="למשל תל אביב והסביבה"
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">
                WhatsApp להתראות (בעל העסק)
              </span>
              <input
                value={ownerNotifyPhone}
                onChange={(event) => setOwnerNotifyPhone(event.target.value)}
                placeholder="9725..."
                dir="ltr"
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">מדיניות תמונות</span>
              <select
                value={photoPolicy}
                onChange={(event) =>
                  setPhotoPolicy(event.target.value as PhotoPolicy)
                }
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
              >
                <option value="if_helpful">לבקש אם זה עוזר</option>
                <option value="always">תמיד לבקש</option>
                <option value="never">לעולם לא לבקש</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">מדיניות חירום</span>
              <textarea
                value={emergencyPolicy}
                onChange={(event) => setEmergencyPolicy(event.target.value)}
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">אופי העוזר (אנגלית)</span>
              <input
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40 sm:text-sm"
              />
            </label>

            <Button
              className="min-h-11 w-full active:scale-[0.98] sm:w-auto sm:px-6"
              disabled={savingDetails}
              onClick={saveDetails}
            >
              {savingDetails ? "שומר..." : "שמור פרטים"}
            </Button>
          </CollapsibleSection>

          <CollapsibleSection
            title="שעות פעילות"
            summary={hoursSummary}
            infoTitle="שעות פעילות"
            infoText="משמשות את דובי להסביר מתי בעל העסק פעיל. מחוץ לשעות — עדיין אוסף קריאות, במיוחד חירום."
            open={openSections.hours}
            onOpenChange={(open) => setSectionOpen("hours", open)}
            headerActions={
              <Button
                className="min-h-9 px-4 text-sm active:scale-[0.98]"
                disabled={savingHours}
                onClick={saveHours}
              >
                {savingHours ? "שומר..." : "שמור"}
              </Button>
            }
          >
            <ul className="space-y-2">
              {hours.map((day) => (
                <li
                  key={day.dayOfWeek}
                  className="rounded-xl border border-border bg-background/70 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex min-w-[5.5rem] items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={day.isOpen}
                        onChange={(event) =>
                          setDayOpen(day.dayOfWeek, event.target.checked)
                        }
                        className="size-4 rounded border-input"
                      />
                      {HEBREW_WEEKDAYS[day.dayOfWeek]}
                    </label>
                    {day.isOpen && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-9 px-3 text-xs active:scale-[0.98]"
                        onClick={() => addInterval(day.dayOfWeek)}
                      >
                        + מרווח
                      </Button>
                    )}
                  </div>

                  {day.isOpen ? (
                    <div className="space-y-2">
                      {day.intervals.map((interval, index) => (
                        <div
                          key={`${day.dayOfWeek}-${index}`}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            type="time"
                            value={interval.open}
                            onChange={(event) =>
                              updateInterval(day.dayOfWeek, index, {
                                open: event.target.value.slice(0, 5),
                              })
                            }
                            className="min-h-10 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                          />
                          <span className="text-muted-foreground">–</span>
                          <input
                            type="time"
                            value={interval.close}
                            onChange={(event) =>
                              updateInterval(day.dayOfWeek, index, {
                                close: event.target.value.slice(0, 5),
                              })
                            }
                            className="min-h-10 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                          />
                          {day.intervals.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="min-h-9 px-2 text-xs text-muted-foreground active:scale-[0.98]"
                              onClick={() =>
                                removeInterval(day.dayOfWeek, index)
                              }
                            >
                              הסר
                            </Button>
                          )}
                        </div>
                      ))}
                      {day.intervals.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formatIntervalsSummary(day.intervals)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">סגור</span>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection
            title="סוגי קריאות"
            summary="קטלוג אופציונלי לדובי · לחץ לעריכה"
            infoTitle="סוגי קריאות"
            infoText="סוגים שדובי יכול למפות אליהם (נזילה, סתימה וכו'). תמיד נשמר גם תיאור חופשי של הבעיה."
            open={openSections.services}
            onOpenChange={(open) => setSectionOpen("services", open)}
          >
            <ServicesManager onError={setError} />
          </CollapsibleSection>
        </div>
      )}
    </DashboardShell>
  );
}

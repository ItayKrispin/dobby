"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink } from "@/components/dashboard/back-link";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FieldInfo } from "@/components/dashboard/field-info";
import { ServicesManager } from "@/components/dashboard/services-manager";
import { apiFetch } from "@/lib/api-fetch";
import {
  DEFAULT_HOURS_INTERVAL,
  formatIntervalsSummary,
  HEBREW_WEEKDAYS,
  TRADE_OPTIONS,
  type HoursInterval,
  type HoursPolicy,
  type PhotoPolicy,
  type WeekdayHours,
} from "@/lib/business-shared";
import {
  fetchBusiness,
  fetchGoogleStatus,
  queryKeys,
} from "@/lib/dashboard-query";

type ProfileState = {
  name: string;
  trade: string;
  persona: string;
  serviceArea: string;
  ownerNotifyPhone: string;
  photoPolicy: PhotoPolicy;
  assistantIntro: string;
  hoursPolicy: HoursPolicy;
  hours: WeekdayHours[];
};

type SectionKey = "details" | "hours" | "services" | "calendar";

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
    return { ...DEFAULT_HOURS_INTERVAL };
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
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("plumber");
  const [persona, setPersona] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [ownerNotifyPhone, setOwnerNotifyPhone] = useState("");
  const [photoPolicy, setPhotoPolicy] = useState<PhotoPolicy>("always");
  const [assistantIntro, setAssistantIntro] = useState("");
  const [hoursPolicy, setHoursPolicy] = useState<HoursPolicy>("flexible");
  const [hours, setHours] = useState<WeekdayHours[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [gcalMessage, setGcalMessage] = useState<string | null>(null);
  const [gcalHandled, setGcalHandled] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    details: false,
    hours: false,
    services: false,
    calendar: false,
  });

  function setSectionOpen(key: SectionKey, open: boolean) {
    setOpenSections((prev) => ({ ...prev, [key]: open }));
  }

  function applyProfile(next: ProfileState) {
    setProfile(next);
    setName(next.name);
    setTrade(next.trade);
    setPersona(next.persona);
    setServiceArea(next.serviceArea);
    setOwnerNotifyPhone(next.ownerNotifyPhone);
    setPhotoPolicy(next.photoPolicy);
    setAssistantIntro(next.assistantIntro ?? "");
    setHoursPolicy(next.hoursPolicy ?? "flexible");
    setHours(next.hours);
  }

  const {
    data: businessProfile,
    error: businessError,
    isLoading: businessLoading,
    refetch: refetchBusiness,
  } = useQuery({
    queryKey: queryKeys.business,
    queryFn: async () => (await fetchBusiness()) as ProfileState,
  });

  const { data: gcalConnected = false, refetch: refetchGcal } = useQuery({
    queryKey: queryKeys.googleStatus,
    queryFn: fetchGoogleStatus,
    staleTime: 60_000,
  });

  const [hydrated, setHydrated] = useState(false);
  if (businessProfile && !hydrated) {
    setHydrated(true);
    applyProfile(businessProfile);
  }

  const loadError = businessError
    ? businessError instanceof Error
      ? businessError.message
      : "שגיאה בטעינה"
    : null;
  const displayError = error ?? loadError;

  const loading = businessLoading && !profile;

  async function refresh() {
    const [businessResult] = await Promise.all([
      refetchBusiness(),
      refetchGcal(),
    ]);
    if (businessResult.data) {
      applyProfile(businessResult.data);
    }
    setError(null);
  }

  if (!gcalHandled && typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (gcal) {
      setGcalHandled(true);
      if (gcal === "connected") {
        setGcalMessage("Google Calendar חובר בהצלחה.");
        setOpenSections((prev) => ({ ...prev, calendar: true }));
        void refetchGcal();
      } else if (gcal === "error") {
        setGcalMessage(
          `חיבור Google Calendar נכשל (${params.get("reason") || "error"}).`,
        );
        setOpenSections((prev) => ({ ...prev, calendar: true }));
      }
    }
  }

  const hoursSummary = useMemo(() => {
    const openDays = hours.filter((day) => day.isOpen);
    const modeLabel = hoursPolicy === "hard" ? "קשיח" : "גמיש";
    if (openDays.length === 0) return `כל הימים סגורים · ${modeLabel}`;
    return `${openDays.length} ימים פתוחים · ${modeLabel}`;
  }, [hours, hoursPolicy]);

  const detailsSummary = useMemo(() => {
    const tradeLabel =
      TRADE_OPTIONS.find((option) => option.value === trade)?.label ?? trade;
    if (!name.trim()) return `${tradeLabel} · לחץ לעריכה`;
    return `${name} · ${tradeLabel}`;
  }, [name, trade]);

  async function saveDetails() {
    setSavingDetails(true);
    try {
      const response = await apiFetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade,
          persona,
          serviceArea,
          ownerNotifyPhone,
          photoPolicy,
          assistantIntro,
        }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to save");
      }
      const next = json.profile as ProfileState;
      applyProfile(next);
      queryClient.setQueryData(queryKeys.business, next);
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
        body: JSON.stringify({ hours, hoursPolicy }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to save hours");
      }
      const next = json.profile as ProfileState;
      applyProfile(next);
      queryClient.setQueryData(queryKeys.business, next);
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
            ? [{ ...DEFAULT_HOURS_INTERVAL }]
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
            intervals.length > 0
              ? intervals
              : [{ ...DEFAULT_HOURS_INTERVAL }],
          isOpen: intervals.length > 0 ? day.isOpen : false,
        };
      }),
    );
  }

  return (
    <DashboardShell
      title="העסק"
      subtitle="פרופיל, שעות, מדיניות קריאות וסוגי עבודות"
      leading={<BackLink href="/dashboard/more" />}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void refresh();
          }}
        >
          רענון
        </Button>
      }
    >
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      )}
      {displayError && (
        <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {displayError}
        </p>
      )}

      {!loading && profile && (
        <div className="space-y-3">
          <CollapsibleSection
            title="פרטי העסק"
            summary={detailsSummary}
            infoTitle="פרטי העסק"
            infoText="שם בעל העסק והמקצוע משמשים את העוזר בשיחות עם הלקוחות. מספר הוואטסאפ להתראות הוא המספר שלך לקבלת חבילות קריאה."
            open={openSections.details}
            onOpenChange={(open) => setSectionOpen("details", open)}
          >
            <label className="block space-y-1.5">
              <span className="flex items-center gap-1 text-base text-muted-foreground">
                שם בעל העסק
                <FieldInfo title="שם בעל העסק">
                  מופיע בהצגה העצמית של העוזר (למשל ״אני העוזר של יוסי״). אם ריק או ברירת מחדל — ״בעל המקצוע״.
                </FieldInfo>
              </span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="למשל יוסי"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base text-muted-foreground">מקצוע</span>
              <select
                value={trade}
                onChange={(event) => setTrade(event.target.value)}
                className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50"
              >
                {TRADE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-base text-muted-foreground">אזור שירות</span>
              <Input
                value={serviceArea}
                onChange={(event) => setServiceArea(event.target.value)}
                placeholder="למשל תל אביב והסביבה"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base text-muted-foreground">
                WhatsApp להתראות (בעל העסק)
              </span>
              <Input
                value={ownerNotifyPhone}
                onChange={(event) => setOwnerNotifyPhone(event.target.value)}
                placeholder="9725..."
                dir="ltr"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base text-muted-foreground">מדיניות תמונות</span>
              <select
                value={photoPolicy}
                onChange={(event) =>
                  setPhotoPolicy(event.target.value as PhotoPolicy)
                }
                className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50"
              >
                <option value="always">תמיד לבקש</option>
                <option value="if_helpful">לבקש אם זה עוזר</option>
                <option value="never">לעולם לא לבקש</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="flex items-center gap-1 text-base text-muted-foreground">
                איך העוזר מציג את עצמו ללקוחות
                <FieldInfo title="הצגה עצמית">
                  {`השאר ריק לברירת מחדל: ״אני העוזר של {name}״. אפשר לכתוב נוסח חופשי; {name} יוחלף בשם בעל העסק.`}
                </FieldInfo>
              </span>
              <Textarea
                value={assistantIntro}
                onChange={(event) => setAssistantIntro(event.target.value)}
                rows={2}
                placeholder="אני העוזר של {name}"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base text-muted-foreground">
                אופי העוזר
              </span>
              <Input
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
                placeholder="למשל: מקצועי, רגוע וברור"
              />
            </label>

            <Button
              className="w-full"
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
            infoText="מסגרת שעות לבעל העסק. אפשר לבחור האם היא קשיחה או גמישה לפי סוג הקריאה."
            open={openSections.hours}
            onOpenChange={(open) => setSectionOpen("hours", open)}
            headerActions={
              <Button
                size="sm"
                disabled={savingHours}
                onClick={saveHours}
              >
                {savingHours ? "שומר..." : "שמור"}
              </Button>
            }
          >
            <label className="mb-3 block space-y-1.5">
              <span className="flex items-center gap-1 text-base text-muted-foreground">
                מדיניות שעות
                <FieldInfo title="מדיניות שעות">
                  קשיח — רק בתוך השעות שהגדרת. גמיש — השעות הן מסגרת, והעוזר יכול לרמוז על גמישות במקרים דחופים.
                </FieldInfo>
              </span>
              <select
                value={hoursPolicy}
                onChange={(event) =>
                  setHoursPolicy(event.target.value as HoursPolicy)
                }
                className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50"
              >
                <option value="flexible">גמיש (מסגרת עם מקום לגמישות)</option>
                <option value="hard">קשיח (רק בתוך השעות)</option>
              </select>
            </label>

            <ul className="space-y-2">
              {hours.map((day) => (
                <li
                  key={day.dayOfWeek}
                  className="rounded-2xl border border-border bg-background/70 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex min-w-[5.5rem] items-center gap-2 text-base font-medium">
                      <input
                        type="checkbox"
                        checked={day.isOpen}
                        onChange={(event) =>
                          setDayOpen(day.dayOfWeek, event.target.checked)
                        }
                        className="size-5 rounded border-input"
                      />
                      {HEBREW_WEEKDAYS[day.dayOfWeek]}
                    </label>
                    {day.isOpen && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                          <Input
                            type="time"
                            value={interval.open}
                            onChange={(event) =>
                              updateInterval(day.dayOfWeek, index, {
                                open: event.target.value.slice(0, 5),
                              })
                            }
                            className="w-auto"
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={interval.close}
                            onChange={(event) =>
                              updateInterval(day.dayOfWeek, index, {
                                close: event.target.value.slice(0, 5),
                              })
                            }
                            className="w-auto"
                          />
                          {day.intervals.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
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
                        <p className="text-sm text-muted-foreground">
                          {formatIntervalsSummary(day.intervals)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-base text-muted-foreground">סגור</span>
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
            <ServicesManager trade={trade} onError={setError} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Google Calendar"
            summary={
              gcalConnected ? "מחובר · לחץ לניהול" : "לא מחובר · לחץ לחיבור"
            }
            infoTitle="Google Calendar"
            infoText="חיבור חד־פעמי. מיומן העבודה אפשר להוסיף ידנית אירוע ליומן Google לכל עבודה עם שעה."
            open={openSections.calendar}
            onOpenChange={(open) => setSectionOpen("calendar", open)}
          >
            <div className="space-y-3">
              {gcalMessage && (
                <p className="rounded-2xl border border-border bg-muted/40 p-3 text-base">
                  {gcalMessage}
                </p>
              )}
              <p className="text-base text-muted-foreground">
                {gcalConnected
                  ? "היומן מחובר. ביומן העבודה לחצו ״הוסף ליומן Google״ על עבודה מתוזמנת."
                  : "חברו את חשבון Google כדי להוסיף ידנית עבודות מהיומן ללוח השנה."}
              </p>
              <a href="/api/google/auth">
                <Button type="button" className="w-full sm:w-auto">
                  {gcalConnected ? "חבר מחדש" : "חבר Google Calendar"}
                </Button>
              </a>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </DashboardShell>
  );
}

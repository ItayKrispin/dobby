"use client";

import { useEffect, useMemo, useState } from "react";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Job } from "@/lib/jobs";
import { REMINDER_OFFSETS, offsetLabel } from "@/lib/reminders";
import { hmInIsrael, israelDayStart, ymdInIsrael } from "@/lib/utils/date";
import type { ReminderOffsetMinutes } from "@/types/database";

export function formatJobSchedule(
  job: Pick<Job, "scheduledStart" | "scheduledEnd">,
) {
  if (!job.scheduledStart) {
    return "ללא שעה";
  }
  try {
    const start = new Date(job.scheduledStart);
    const datePart = new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(start);
    if (!job.scheduledEnd) {
      return `${datePart} · ${hmInIsrael(start)}`;
    }
    const end = new Date(job.scheduledEnd);
    return `${datePart} · ${hmInIsrael(start)}–${hmInIsrael(end)}`;
  } catch {
    return job.scheduledStart;
  }
}

/** Value for datetime fields in Asia/Jerusalem wall time (YYYY-MM-DDTHH:mm). */
export function toDatetimeLocalValue(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${ymdInIsrael(date)}T${hmInIsrael(date)}`;
}

/** Parse datetime-local style value as Asia/Jerusalem instant (ISO string). */
export function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  for (const offset of ["+03:00", "+02:00"] as const) {
    const candidate = new Date(`${trimmed}${offset}`);
    if (Number.isNaN(candidate.getTime())) continue;
    if (`${ymdInIsrael(candidate)}T${hmInIsrael(candidate)}` === trimmed) {
      return candidate.toISOString();
    }
  }

  const fallback = new Date(`${trimmed}+03:00`);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

const HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const MINUTES = ["00", "15", "30", "45"];

function parseSeed(iso?: string | null) {
  const local = toDatetimeLocalValue(iso);
  if (!local) {
    const now = new Date();
    return {
      date: israelDayStart(ymdInIsrael(now)),
      hour: hmInIsrael(now).slice(0, 2),
      minute: "00",
    };
  }
  const [ymd, hm] = local.split("T");
  const [hour, minute] = (hm ?? "09:00").split(":");
  const rounded =
    MINUTES.includes(minute)
      ? minute
      : MINUTES.reduce((best, candidate) =>
          Math.abs(Number(candidate) - Number(minute)) <
          Math.abs(Number(best) - Number(minute))
            ? candidate
            : best,
        );
  return {
    date: israelDayStart(ymd),
    hour: hour || "09",
    minute: rounded,
  };
}

type ScheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  title?: string;
  description?: string;
  requireTime?: boolean;
  initialStart?: string | null;
  busy?: boolean;
  onSubmit: (payload: {
    start: string | null;
    durationMinutes: number | null;
    reminderOffsets: ReminderOffsetMinutes[];
  }) => void | Promise<void>;
};

export function DiaryScheduleDialog({
  open,
  onOpenChange,
  job,
  title = "הוספה ליומן עבודה",
  description = "אפשר לקבוע שעת התחלה עכשיו (משך אופציונלי) או להשאיר ללא שעה.",
  requireTime = false,
  initialStart = null,
  busy = false,
  onSubmit,
}: ScheduleDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [hour, setHour] = useState("09");
  const [minute, setMinute] = useState("00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [skipTime, setSkipTime] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [reminderOffsets, setReminderOffsets] = useState<ReminderOffsetMinutes[]>(
    [],
  );

  const jobId = job?.id ?? null;
  const seedIso = job?.scheduledStart ?? initialStart ?? null;

  useEffect(() => {
    if (!open) return;
    const seed = parseSeed(seedIso);
    setSelectedDate(seed.date);
    setHour(seed.hour);
    setMinute(seed.minute);
    if (job?.scheduledStart && job?.scheduledEnd) {
      const ms =
        new Date(job.scheduledEnd).getTime() -
        new Date(job.scheduledStart).getTime();
      const mins = Math.round(ms / 60_000);
      setDurationMinutes(mins > 0 ? String(mins) : "");
    } else {
      setDurationMinutes("");
    }
    setSkipTime(!requireTime && !seedIso);
    setReminderOffsets(job?.reminderOffsets ?? []);
    setLocalError(null);
  }, [
    open,
    jobId,
    seedIso,
    requireTime,
    job?.reminderOffsets,
    job?.scheduledStart,
    job?.scheduledEnd,
  ]);

  const startLocal = useMemo(() => {
    if (!selectedDate) return "";
    return `${ymdInIsrael(selectedDate)}T${hour}:${minute}`;
  }, [selectedDate, hour, minute]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3">
          {job && (
            <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {job.customerName?.trim() || job.phone}
              </p>
              <p className="text-muted-foreground">{job.problem || "—"}</p>
              {job.addressText && (
                <p>
                  <span className="text-muted-foreground">כתובת: </span>
                  {job.addressText}
                </p>
              )}
              {job.customerAvailability && (
                <p>
                  <span className="text-muted-foreground">זמינות: </span>
                  {job.customerAvailability}
                </p>
              )}
            </div>
          )}

          {!requireTime && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={skipTime}
                onChange={(event) => {
                  setSkipTime(event.target.checked);
                  setLocalError(null);
                }}
                className="size-4 rounded border-border"
              />
              ללא שעה כרגע — אקבע מאוחר יותר
            </label>
          )}

          {!skipTime && (
            <>
              <div className="space-y-1.5">
                <Label>תאריך</Label>
                <div className="flex justify-center rounded-xl border border-border bg-card p-1">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    locale={he}
                    className="w-fit"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="diary-hour">שעה</Label>
                  <select
                    id="diary-hour"
                    value={hour}
                    onChange={(event) => setHour(event.target.value)}
                    className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                    dir="ltr"
                  >
                    {HOURS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="diary-minute">דקה</Label>
                  <select
                    id="diary-minute"
                    value={minute}
                    onChange={(event) => setMinute(event.target.value)}
                    className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                    dir="ltr"
                  >
                    {MINUTES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="diary-duration">משך (דקות, אופציונלי)</Label>
                <Input
                  id="diary-duration"
                  type="number"
                  min={15}
                  step={15}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  placeholder="רק שעת התחלה"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  אפשר להשאיר ריק אם משך העבודה עדיין לא ידוע.
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium">תזכורות לפני העבודה</p>
                <ReminderOffsetCheckboxes
                  value={reminderOffsets}
                  onChange={setReminderOffsets}
                />
              </div>
            </>
          )}

          {localError && (
            <p className="text-sm text-destructive">{localError}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            disabled={busy || !job}
            onClick={async () => {
              if (!job) return;
              if (skipTime && !requireTime) {
                await onSubmit({
                  start: null,
                  durationMinutes: null,
                  reminderOffsets: [],
                });
                return;
              }
              if (!selectedDate || !startLocal.trim()) {
                setLocalError("נא לבחור תאריך ושעה");
                return;
              }
              const startIso = fromDatetimeLocalValue(startLocal);
              if (!startIso) {
                setLocalError("תאריך/שעה לא תקינים");
                return;
              }
              const trimmedDuration = durationMinutes.trim();
              let duration: number | null = null;
              if (trimmedDuration) {
                duration = Number(trimmedDuration);
                if (!Number.isInteger(duration) || duration <= 0) {
                  setLocalError("משך חייב להיות מספר חיובי");
                  return;
                }
              }
              setLocalError(null);
              await onSubmit({
                start: startIso,
                durationMinutes: duration,
                reminderOffsets,
              });
            }}
          >
            {busy ? "שומר..." : "שמירה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RemindersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  busy?: boolean;
  onSubmit: (payload: {
    reminderOffsets: ReminderOffsetMinutes[];
  }) => void | Promise<void>;
};

export function DiaryRemindersDialog({
  open,
  onOpenChange,
  job,
  busy = false,
  onSubmit,
}: RemindersDialogProps) {
  const [reminderOffsets, setReminderOffsets] = useState<ReminderOffsetMinutes[]>(
    [],
  );

  useEffect(() => {
    if (!open) return;
    setReminderOffsets(job?.reminderOffsets ?? []);
  }, [open, job?.id, job?.reminderOffsets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>תזכורות</DialogTitle>
          <DialogDescription>
            בחרו מתי לקבל תזכורת לפני העבודה
            {job?.scheduledStart
              ? ` (${formatJobSchedule(job)})`
              : ""}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <ReminderOffsetCheckboxes
            value={reminderOffsets}
            onChange={setReminderOffsets}
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            disabled={busy || !job?.scheduledStart}
            onClick={async () => {
              if (!job?.scheduledStart) return;
              await onSubmit({ reminderOffsets });
            }}
          >
            {busy ? "שומר..." : "שמירה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderOffsetCheckboxes({
  value,
  onChange,
}: {
  value: ReminderOffsetMinutes[];
  onChange: (next: ReminderOffsetMinutes[]) => void;
}) {
  return (
    <div className="space-y-2">
      {REMINDER_OFFSETS.map((offset) => {
        const checked = value.includes(offset);
        return (
          <label key={offset} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? [...value, offset]
                    : value.filter((item) => item !== offset),
                );
              }}
              className="size-4 rounded border-border"
            />
            {offsetLabel(offset)}
          </label>
        );
      })}
    </div>
  );
}

type ConflictDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: Job[];
  busy?: boolean;
  onForce: () => void | Promise<void>;
  onReplace: (conflictJobId: string) => void | Promise<void>;
};

export function DiaryConflictDialog({
  open,
  onOpenChange,
  conflicts,
  busy = false,
  onForce,
  onReplace,
}: ConflictDialogProps) {
  const primary = conflicts[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>התנגשות ביומן</DialogTitle>
          <DialogDescription>
            כבר יש עבודה מתוזמנת באותו חלון זמן. אפשר לקבל בכל זאת או להחליף את
            הקודמת (הקודמת תיסגר ותוסר מהיומן).
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {conflicts.map((job) => (
            <li
              key={job.id}
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
            >
              <p className="font-medium">
                {job.customerName?.trim() || job.phone}
              </p>
              <p>{formatJobSchedule(job)}</p>
              {job.addressText && (
                <p className="text-muted-foreground">{job.addressText}</p>
              )}
              <p className="text-muted-foreground">{job.problem || "—"}</p>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button disabled={busy} onClick={() => onForce()}>
            קבל בכל זאת
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !primary}
            onClick={() => primary && onReplace(primary.id)}
          >
            החלף את הקודמת
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

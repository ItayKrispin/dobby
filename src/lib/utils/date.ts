import {
  format,
  addMinutes,
  startOfDay,
  setHours,
  setMinutes,
  isSameDay,
  isToday,
  isTomorrow,
  addDays,
} from "date-fns";
import { he } from "date-fns/locale";

const HEBREW_DAY_NAMES = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
] as const;

export const ISRAEL_TIMEZONE = "Asia/Jerusalem";

/** Format an instant as YYYY-MM-DD in Asia/Jerusalem. */
export function ymdInIsrael(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Format an instant as HH:mm in Asia/Jerusalem. */
export function hmInIsrael(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Local Israel fields for AI tools (avoids UTC misreads like 07:00 instead of 10:00). */
export function israelLocalFromIso(iso: string) {
  const date = new Date(iso);
  const ymd = ymdInIsrael(date);
  const hm = hmInIsrael(date);
  return {
    date: ymd,
    time: hm,
    local: `${ymd} ${hm}`,
  };
}

export function getHebrewDayName(date: Date): string {
  return HEBREW_DAY_NAMES[date.getDay()];
}

export function formatHebrewDate(date: Date): string {
  return format(date, "d בMMMM yyyy", { locale: he });
}

export function formatTime(date: Date): string {
  return format(date, "HH:mm");
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(end)} - ${formatTime(start)}`;
}

export function getDayLabel(date: Date): string {
  if (isToday(date)) return "היום";
  if (isTomorrow(date)) return "מחר";
  return `יום ${getHebrewDayName(date)}`;
}

export function generateTimeSlots(
  openingTime: string,
  closingTime: string,
  slotDuration: number
): Date[] {
  const [openH, openM] = openingTime.split(":").map(Number);
  const [closeH, closeM] = closingTime.split(":").map(Number);

  const baseDate = startOfDay(new Date());
  const start = setMinutes(setHours(baseDate, openH), openM);
  const end = setMinutes(setHours(baseDate, closeH), closeM);

  const slots: Date[] = [];
  let current = start;
  while (current < end) {
    slots.push(current);
    current = addMinutes(current, slotDuration);
  }
  return slots;
}

export function getUpcomingDays(count: number): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < count; i++) {
    days.push(addDays(startOfDay(new Date()), i));
  }
  return days;
}

export { isSameDay, isToday, isTomorrow, addDays, addMinutes, format };

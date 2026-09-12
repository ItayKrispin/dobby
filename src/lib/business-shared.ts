export const HEBREW_WEEKDAYS = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
] as const;

export type HoursInterval = {
  open: string;
  close: string;
};

export type WeekdayHours = {
  dayOfWeek: number;
  isOpen: boolean;
  intervals: HoursInterval[];
};

export type PhotoPolicy = "always" | "if_helpful" | "never";

export type HoursPolicy = "hard" | "flexible";

export type BusinessProfile = {
  name: string;
  trade: string;
  persona: string;
  serviceArea: string;
  ownerNotifyPhone: string;
  photoPolicy: PhotoPolicy;
  emergencyPolicy: string;
  assistantIntro: string;
  hoursPolicy: HoursPolicy;
  hours: WeekdayHours[];
  hoursSummary: string;
};

export type DayHours = {
  isOpen: boolean;
  intervals: HoursInterval[];
};

export function formatIntervalsSummary(intervals: HoursInterval[]) {
  return intervals.map((i) => `${i.open}–${i.close}`).join(", ");
}

export const TRADE_OPTIONS = [
  { value: "plumber", label: "אינסטלטור" },
  { value: "electrician", label: "חשמלאי" },
  { value: "locksmith", label: "מנעולן" },
  { value: "technician", label: "טכנאי" },
  { value: "custom", label: "אחר" },
] as const;

/** Suggested job-type names shown under “הוסף שירות”, by trade. */
export const SERVICE_SUGGESTIONS_BY_TRADE: Record<string, string[]> = {
  plumber: ["נזילה", "סתימה", "התקנת ברז"],
  electrician: ["קצר חשמלי", "תקלה בלוח חשמל", "התקנת נקודה"],
  locksmith: ["פריצת דלת", "החלפת מנעול", "מפתח שבור"],
  technician: ["תקלה במכשיר", "התקנה", "תחזוקה"],
  custom: ["תיקון", "התקנה", "שירות"],
};

export const DEFAULT_HOURS_INTERVAL: HoursInterval = {
  open: "08:00",
  close: "17:00",
};

export function serviceNamePlaceholder(trade: string) {
  const suggestion =
    SERVICE_SUGGESTIONS_BY_TRADE[trade]?.[0] ??
    SERVICE_SUGGESTIONS_BY_TRADE.custom[0];
  return `שם (למשל ${suggestion})`;
}

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

export type BusinessProfile = {
  name: string;
  trade: string;
  persona: string;
  serviceArea: string;
  ownerNotifyPhone: string;
  photoPolicy: PhotoPolicy;
  emergencyPolicy: string;
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

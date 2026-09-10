import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatIntervalsSummary,
  HEBREW_WEEKDAYS,
  type BusinessProfile,
  type DayHours,
  type HoursInterval,
  type PhotoPolicy,
  type WeekdayHours,
} from "@/lib/business-shared";

export {
  HEBREW_WEEKDAYS,
  TRADE_OPTIONS,
  formatIntervalsSummary,
  type BusinessProfile,
  type DayHours,
  type HoursInterval,
  type PhotoPolicy,
  type WeekdayHours,
} from "@/lib/business-shared";

const HM_RE = /^\d{2}:\d{2}$/;
const PHOTO_POLICIES = new Set<PhotoPolicy>(["always", "if_helpful", "never"]);

const DEFAULT_INTERVAL: HoursInterval = { open: "09:00", close: "20:00" };

const DEFAULT_HOURS: WeekdayHours[] = [
  { dayOfWeek: 0, isOpen: true, intervals: [{ ...DEFAULT_INTERVAL }] },
  { dayOfWeek: 1, isOpen: true, intervals: [{ ...DEFAULT_INTERVAL }] },
  { dayOfWeek: 2, isOpen: true, intervals: [{ ...DEFAULT_INTERVAL }] },
  { dayOfWeek: 3, isOpen: true, intervals: [{ ...DEFAULT_INTERVAL }] },
  { dayOfWeek: 4, isOpen: true, intervals: [{ ...DEFAULT_INTERVAL }] },
  { dayOfWeek: 5, isOpen: true, intervals: [{ ...DEFAULT_INTERVAL }] },
  { dayOfWeek: 6, isOpen: false, intervals: [{ ...DEFAULT_INTERVAL }] },
];

const DEFAULT_PERSONA =
  "friendly and professional field-service receptionist named Dobby";

function parseHm(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function normalizeHm(value: string) {
  return value.trim().slice(0, 5);
}

function validateHm(value: string, label: string) {
  const hm = normalizeHm(value);
  if (!HM_RE.test(hm)) {
    throw new Error(`${label} must be HH:mm`);
  }
  const [h, m] = hm.split(":").map(Number);
  if (h > 23 || m > 59) {
    throw new Error(`${label} must be a valid time`);
  }
  return hm;
}

function sortIntervals(intervals: HoursInterval[]) {
  return [...intervals].sort((a, b) => parseHm(a.open) - parseHm(b.open));
}

function formatHoursSummary(hours: WeekdayHours[]) {
  return hours
    .map((day) => {
      const label = HEBREW_WEEKDAYS[day.dayOfWeek] ?? String(day.dayOfWeek);
      if (!day.isOpen || day.intervals.length === 0) return `${label} סגור`;
      return `${label} ${formatIntervalsSummary(day.intervals)}`;
    })
    .join(", ");
}

function parseIntervalsJson(value: unknown): HoursInterval[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ ...DEFAULT_INTERVAL }];
  }

  const intervals: HoursInterval[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const open = typeof row.open === "string" ? normalizeHm(row.open) : null;
    const close = typeof row.close === "string" ? normalizeHm(row.close) : null;
    if (open && close && HM_RE.test(open) && HM_RE.test(close)) {
      intervals.push({ open, close });
    }
  }

  return intervals.length > 0 ? sortIntervals(intervals) : [{ ...DEFAULT_INTERVAL }];
}

function normalizeHours(rows: WeekdayHours[]): WeekdayHours[] {
  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));
  return DEFAULT_HOURS.map((fallback) => {
    const row = byDay.get(fallback.dayOfWeek);
    if (!row) return fallback;
    return {
      dayOfWeek: row.dayOfWeek,
      isOpen: row.isOpen,
      intervals:
        row.intervals.length > 0
          ? sortIntervals(row.intervals)
          : [{ ...DEFAULT_INTERVAL }],
    };
  });
}

function mapHoursRow(row: {
  day_of_week: number;
  is_open: boolean;
  intervals: unknown;
}): WeekdayHours {
  return {
    dayOfWeek: row.day_of_week,
    isOpen: row.is_open,
    intervals: parseIntervalsJson(row.intervals),
  };
}

function validateIntervals(dayLabel: string, intervals: HoursInterval[]) {
  if (intervals.length === 0) {
    throw new Error(`${dayLabel}: at least one time range is required`);
  }

  const normalized: HoursInterval[] = [];
  for (let i = 0; i < intervals.length; i += 1) {
    const open = validateHm(intervals[i].open, `${dayLabel} open[${i}]`);
    const close = validateHm(intervals[i].close, `${dayLabel} close[${i}]`);
    if (parseHm(open) >= parseHm(close)) {
      throw new Error(`${dayLabel}: open time must be before close time`);
    }
    normalized.push({ open, close });
  }

  const sorted = sortIntervals(normalized);
  for (let i = 1; i < sorted.length; i += 1) {
    if (parseHm(sorted[i].open) < parseHm(sorted[i - 1].close)) {
      throw new Error(
        `${dayLabel}: time ranges must not overlap (use a break between them)`,
      );
    }
  }

  return sorted;
}

function normalizePhotoPolicy(value: unknown): PhotoPolicy {
  if (typeof value === "string" && PHOTO_POLICIES.has(value as PhotoPolicy)) {
    return value as PhotoPolicy;
  }
  return "if_helpful";
}

/** Day-of-week for a civil YYYY-MM-DD date (0=Sunday … 6=Saturday). */
export function dayOfWeekFromYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export async function getBusinessProfile(): Promise<BusinessProfile> {
  const supabase = createAdminClient();

  const [{ data: profile, error: profileError }, { data: hoursRows, error: hoursError }] =
    await Promise.all([
      supabase.from("business_profile").select("*").eq("id", true).maybeSingle(),
      supabase.from("business_hours").select("*").order("day_of_week", { ascending: true }),
    ]);

  if (profileError) {
    throw new Error(`Failed to load business profile: ${profileError.message}`);
  }
  if (hoursError) {
    throw new Error(`Failed to load business hours: ${hoursError.message}`);
  }

  const hours = normalizeHours((hoursRows ?? []).map(mapHoursRow));
  const envNotify = process.env.OWNER_NOTIFY_PHONE?.trim() || "";

  return {
    name: profile?.name?.trim() || "Dobby",
    trade: profile?.trade?.trim() || "plumber",
    persona: profile?.persona?.trim() || DEFAULT_PERSONA,
    serviceArea: profile?.service_area?.trim() || "",
    ownerNotifyPhone: profile?.owner_notify_phone?.trim() || envNotify,
    photoPolicy: normalizePhotoPolicy(profile?.photo_policy),
    emergencyPolicy:
      profile?.emergency_policy?.trim() ||
      "נזילה חזקה, הצפה, או סכנה מיידית = חירום",
    hours,
    hoursSummary: formatHoursSummary(hours),
  };
}

export async function getHoursForDate(ymd: string): Promise<DayHours> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return { isOpen: false, intervals: [] };
  }

  const profile = await getBusinessProfile();
  const dayOfWeek = dayOfWeekFromYmd(ymd);
  const day = profile.hours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!day || !day.isOpen || day.intervals.length === 0) {
    return { isOpen: false, intervals: [] };
  }

  return { isOpen: true, intervals: day.intervals };
}

export async function updateBusinessProfile(input: {
  name?: string;
  trade?: string;
  persona?: string;
  serviceArea?: string;
  ownerNotifyPhone?: string;
  photoPolicy?: PhotoPolicy;
  emergencyPolicy?: string;
  hours?: WeekdayHours[];
}): Promise<BusinessProfile> {
  const supabase = createAdminClient();

  const hasProfilePatch =
    input.name !== undefined ||
    input.trade !== undefined ||
    input.persona !== undefined ||
    input.serviceArea !== undefined ||
    input.ownerNotifyPhone !== undefined ||
    input.photoPolicy !== undefined ||
    input.emergencyPolicy !== undefined;

  if (hasProfilePatch) {
    const patch: Record<string, string | PhotoPolicy> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("name is required");
      patch.name = name;
    }
    if (input.trade !== undefined) {
      const trade = input.trade.trim();
      if (!trade) throw new Error("trade is required");
      patch.trade = trade;
    }
    if (input.persona !== undefined) {
      patch.persona = input.persona.trim() || DEFAULT_PERSONA;
    }
    if (input.serviceArea !== undefined) {
      patch.service_area = input.serviceArea.trim();
    }
    if (input.ownerNotifyPhone !== undefined) {
      patch.owner_notify_phone = input.ownerNotifyPhone.trim();
    }
    if (input.photoPolicy !== undefined) {
      if (!PHOTO_POLICIES.has(input.photoPolicy)) {
        throw new Error("photoPolicy must be always, if_helpful, or never");
      }
      patch.photo_policy = input.photoPolicy;
    }
    if (input.emergencyPolicy !== undefined) {
      patch.emergency_policy = input.emergencyPolicy.trim();
    }

    const { error } = await supabase
      .from("business_profile")
      .upsert({ id: true, ...patch });

    if (error) {
      throw new Error(`Failed to update business profile: ${error.message}`);
    }
  }

  if (input.hours !== undefined) {
    if (input.hours.length !== 7) {
      throw new Error("hours must include all 7 weekdays");
    }

    const seen = new Set<number>();
    const rows: {
      day_of_week: number;
      is_open: boolean;
      intervals: HoursInterval[];
    }[] = [];

    for (const day of input.hours) {
      if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6) {
        throw new Error("dayOfWeek must be 0–6");
      }
      if (seen.has(day.dayOfWeek)) {
        throw new Error("duplicate dayOfWeek");
      }
      seen.add(day.dayOfWeek);

      const label = HEBREW_WEEKDAYS[day.dayOfWeek] ?? String(day.dayOfWeek);
      const intervals = day.isOpen
        ? validateIntervals(label, day.intervals)
        : day.intervals.length > 0
          ? validateIntervals(label, day.intervals)
          : [{ ...DEFAULT_INTERVAL }];

      rows.push({
        day_of_week: day.dayOfWeek,
        is_open: day.isOpen,
        intervals,
      });
    }

    if (seen.size !== 7) {
      throw new Error("hours must include all 7 weekdays");
    }

    const { error } = await supabase.from("business_hours").upsert(rows);
    if (error) {
      throw new Error(`Failed to update business hours: ${error.message}`);
    }
  }

  return getBusinessProfile();
}

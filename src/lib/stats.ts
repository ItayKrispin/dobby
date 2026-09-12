import { createAdminClient } from "@/lib/supabase/admin";
import {
  addDays,
  israelDayStart,
  startOfTodayIsrael,
  ymdInIsrael,
} from "@/lib/utils/date";

export type StatsRangePreset = "today" | "week" | "month" | "custom";

export type OwnerStats = {
  from: string;
  to: string;
  completedCount: number;
  cancelledCount: number;
  revenueTotal: number;
  paidJobCount: number;
  unpaidCompletedCount: number;
  averagePayment: number | null;
};

function startOfWeekIsrael(now = new Date()): Date {
  // Israel week starts Sunday
  const todayYmd = ymdInIsrael(now);
  const today = israelDayStart(todayYmd);
  const day = today.getDay(); // 0 = Sunday
  return addDays(today, -day);
}

function startOfMonthIsrael(now = new Date()): Date {
  const ymd = ymdInIsrael(now);
  const [year, month] = ymd.split("-").map(Number);
  return israelDayStart(
    `${year}-${String(month).padStart(2, "0")}-01`,
  );
}

export function resolveStatsRange(input: {
  preset?: StatsRangePreset | string | null;
  from?: string | null;
  to?: string | null;
}): { from: Date; to: Date; preset: StatsRangePreset } {
  const preset = (input.preset as StatsRangePreset) || "month";
  const now = new Date();

  if (preset === "custom" && input.from && input.to) {
    const from = israelDayStart(input.from);
    const toExclusive = addDays(israelDayStart(input.to), 1);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(toExclusive.getTime()) ||
      toExclusive <= from
    ) {
      throw new Error("Invalid custom date range");
    }
    return { from, to: toExclusive, preset };
  }

  if (preset === "today") {
    const from = startOfTodayIsrael();
    return { from, to: addDays(from, 1), preset: "today" };
  }

  if (preset === "week") {
    const from = startOfWeekIsrael(now);
    return { from, to: addDays(startOfTodayIsrael(), 1), preset: "week" };
  }

  // month default
  const from = startOfMonthIsrael(now);
  return { from, to: addDays(startOfTodayIsrael(), 1), preset: "month" };
}

export async function getOwnerStats(range: {
  from: Date;
  to: Date;
}): Promise<OwnerStats> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("status, payment_amount, outcome_at")
    .in("status", ["completed", "cancelled"])
    .gte("outcome_at", range.from.toISOString())
    .lt("outcome_at", range.to.toISOString());

  if (error) {
    throw new Error(`Failed to load stats: ${error.message}`);
  }

  let completedCount = 0;
  let cancelledCount = 0;
  let revenueTotal = 0;
  let paidJobCount = 0;
  let unpaidCompletedCount = 0;

  for (const row of data ?? []) {
    if (row.status === "cancelled") {
      cancelledCount += 1;
      continue;
    }
    if (row.status !== "completed") continue;
    completedCount += 1;
    const amount =
      row.payment_amount == null ? null : Number(row.payment_amount);
    if (amount == null || !Number.isFinite(amount)) {
      unpaidCompletedCount += 1;
    } else {
      revenueTotal += amount;
      paidJobCount += 1;
    }
  }

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    completedCount,
    cancelledCount,
    revenueTotal,
    paidJobCount,
    unpaidCompletedCount,
    averagePayment: paidJobCount > 0 ? revenueTotal / paidJobCount : null,
  };
}

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import { parseApiJson, queryKeys } from "@/lib/dashboard-query";
import type { OwnerStats, StatsRangePreset } from "@/lib/stats";
import { ymdInIsrael } from "@/lib/utils/date";

function formatMoney(amount: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(amount);
}

async function fetchStats(params: {
  preset: StatsRangePreset;
  from?: string;
  to?: string;
}): Promise<{ preset: StatsRangePreset; stats: OwnerStats }> {
  const search = new URLSearchParams({ preset: params.preset });
  if (params.preset === "custom" && params.from && params.to) {
    search.set("from", params.from);
    search.set("to", params.to);
  }
  const json = await parseApiJson<{
    ok: true;
    preset: StatsRangePreset;
    stats: OwnerStats;
  }>(await apiFetch(`/api/stats?${search.toString()}`));
  return { preset: json.preset, stats: json.stats };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? (
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function StatsPage() {
  const today = ymdInIsrael(new Date());
  const [preset, setPreset] = useState<StatsRangePreset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [appliedCustom, setAppliedCustom] = useState<{
    from: string;
    to: string;
  } | null>(null);

  const queryPreset = preset;
  const queryFrom =
    preset === "custom" ? (appliedCustom?.from ?? customFrom) : undefined;
  const queryTo =
    preset === "custom" ? (appliedCustom?.to ?? customTo) : undefined;

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      ...queryKeys.stats(queryPreset),
      queryFrom ?? "",
      queryTo ?? "",
    ],
    queryFn: () =>
      fetchStats({
        preset: queryPreset,
        from: queryFrom,
        to: queryTo,
      }),
    enabled: preset !== "custom" || Boolean(appliedCustom),
  });

  const stats = data?.stats;
  const loadError =
    error instanceof Error ? error.message : error ? "שגיאה בטעינה" : null;

  const rangeLabel = useMemo(() => {
    if (!stats) return null;
    try {
      const from = new Intl.DateTimeFormat("he-IL", {
        dateStyle: "medium",
        timeZone: "Asia/Jerusalem",
      }).format(new Date(stats.from));
      const toDate = new Date(stats.to);
      toDate.setMilliseconds(toDate.getMilliseconds() - 1);
      const to = new Intl.DateTimeFormat("he-IL", {
        dateStyle: "medium",
        timeZone: "Asia/Jerusalem",
      }).format(toDate);
      return from === to ? from : `${from} – ${to}`;
    } catch {
      return null;
    }
  }, [stats]);

  return (
    <DashboardShell
      title="נתונים"
      subtitle="כמה עבודה נעשתה וכמה כסף נכנס בטווח שבחרתם"
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          רענון
        </Button>
      }
    >
      <SegmentedControl
        className="mb-4"
        aria-label="טווח זמן"
        value={preset}
        onChange={(next) => {
          setPreset(next);
          if (next !== "custom") {
            setAppliedCustom(null);
          }
        }}
        options={[
          { value: "today", label: "היום" },
          { value: "week", label: "השבוע" },
          { value: "month", label: "החודש" },
          { value: "custom", label: "מותאם" },
        ]}
      />

      {preset === "custom" && (
        <div className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stats-from">מתאריך</Label>
              <Input
                id="stats-from"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stats-to">עד תאריך</Label>
              <Input
                id="stats-to"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={() =>
              setAppliedCustom({ from: customFrom, to: customTo })
            }
          >
            הצג נתונים
          </Button>
        </div>
      )}

      {rangeLabel && (
        <p className="mb-4 text-sm text-muted-foreground">{rangeLabel}</p>
      )}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      )}

      {loadError && (
        <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && !stats && preset === "custom" && !appliedCustom && (
        <EmptyState
          title="בחרו טווח תאריכים"
          description="בחרו תאריכי התחלה וסיום ולחצו על הצג נתונים."
        />
      )}

      {stats && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="עבודות שבוצעו"
            value={String(stats.completedCount)}
            hint={
              stats.unpaidCompletedCount > 0
                ? `${stats.unpaidCompletedCount} בלי סכום תשלום`
                : undefined
            }
          />
          <StatCard
            label="עבודות שבוטלו"
            value={String(stats.cancelledCount)}
          />
          <StatCard
            label="סה״כ הכנסות"
            value={formatMoney(stats.revenueTotal)}
            hint={
              stats.paidJobCount > 0
                ? `מתוך ${stats.paidJobCount} עבודות עם תשלום`
                : "אין תשלומים שנרשמו בטווח"
            }
          />
          <StatCard
            label="ממוצע לתשלום"
            value={
              stats.averagePayment != null
                ? formatMoney(stats.averagePayment)
                : "—"
            }
          />
        </div>
      )}
    </DashboardShell>
  );
}

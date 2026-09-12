"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DiaryConflictDialog,
  DiaryRemindersDialog,
  DiaryScheduleDialog,
} from "@/components/dashboard/diary-dialogs";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  JobCard,
  type CompleteJobPayload,
} from "@/components/dashboard/job-card";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { apiFetch } from "@/lib/api-fetch";
import {
  fetchDiary,
  fetchGoogleStatus,
  invalidateOwnerLists,
  pollMs,
  queryKeys,
} from "@/lib/dashboard-query";
import type { Job } from "@/lib/jobs";
import { ymdInIsrael } from "@/lib/utils/date";
import { toast } from "sonner";

type PendingSchedule = {
  jobId: string;
  start: string;
  durationMinutes: number | null;
  reminderOffsets?: number[];
};

function formatDayHeading(iso: string) {
  const date = new Date(iso);
  const today = ymdInIsrael(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = ymdInIsrael(tomorrowDate);
  const key = ymdInIsrael(date);

  if (key === today) return "היום";
  if (key === tomorrow) return "מחר";

  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export default function DiaryPage() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleJob, setScheduleJob] = useState<Job | null>(null);
  const [remindersJob, setRemindersJob] = useState<Job | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflicts, setConflicts] = useState<Job[]>([]);
  const [pending, setPending] = useState<PendingSchedule | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: jobs = [],
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.diary(scope),
    queryFn: () => fetchDiary(scope),
    refetchInterval: pollMs.diary,
  });

  const {
    data: gcalConnected = false,
  } = useQuery({
    queryKey: queryKeys.googleStatus,
    queryFn: fetchGoogleStatus,
    staleTime: 60_000,
  });

  const showSkeleton = isLoading && jobs.length === 0;
  const loadError =
    actionError ??
    (error instanceof Error ? error.message : error ? "שגיאה בטעינה" : null);

  const { untimed, timedGroups } = useMemo(() => {
    const untimedJobs = jobs.filter((job) => !job.scheduledStart);
    const timed = jobs.filter((job) => job.scheduledStart);
    const groups = new Map<string, Job[]>();
    for (const job of timed) {
      const key = ymdInIsrael(new Date(job.scheduledStart!));
      const list = groups.get(key) ?? [];
      list.push(job);
      groups.set(key, list);
    }
    return {
      untimed: untimedJobs,
      timedGroups: [...groups.entries()],
    };
  }, [jobs]);

  async function submitSchedule(
    action: PendingSchedule & { force?: boolean; replaceJobId?: string },
  ) {
    setBusyId(action.jobId);
    setActionError(null);
    try {
      const response = await apiFetch(`/api/diary/${action.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: action.start,
          durationMinutes: action.durationMinutes,
          force: Boolean(action.force),
          replaceJobId: action.replaceJobId ?? null,
          reminderOffsets: action.reminderOffsets ?? [],
        }),
      });
      const json = await response.json();
      if (response.status === 409 && json.conflict) {
        setPending(action);
        setConflicts((json.conflicts as Job[]) ?? []);
        setScheduleJob(null);
        setRemindersJob(null);
        setConflictOpen(true);
        return;
      }
      if (!json.ok) {
        throw new Error(json.error || "Failed to schedule");
      }
      setScheduleJob(null);
      setRemindersJob(null);
      setConflictOpen(false);
      setPending(null);
      setConflicts([]);
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בקביעת שעה");
    } finally {
      setBusyId(null);
    }
  }

  async function addToGoogle(jobId: string) {
    setBusyId(jobId);
    setActionError(null);
    try {
      const response = await apiFetch(`/api/diary/${jobId}/calendar`, {
        method: "POST",
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to add to Google Calendar");
      }
      await queryClient.invalidateQueries({ queryKey: ["diary"] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה ביומן Google");
    } finally {
      setBusyId(null);
    }
  }

  async function completeJob(jobId: string, payload: CompleteJobPayload) {
    setBusyId(jobId);
    try {
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: jobId,
          action: "complete",
          paymentAmount: payload.paymentAmount,
          paymentIncludesVat: payload.paymentIncludesVat,
        }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to complete job");
      }
      toast.success("הבקשה סומנה כבוצע");
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelJob(jobId: string) {
    setBusyId(jobId);
    try {
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, action: "cancel" }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to cancel job");
      }
      toast.success("הבקשה סומנה כבוטל");
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בביטול");
    } finally {
      setBusyId(null);
    }
  }

  function renderJob(job: Job) {
    return (
      <JobCard
        key={job.id}
        job={job}
        busy={busyId === job.id}
        compactSchedule
        gcalConnected={gcalConnected}
        onSchedule={setScheduleJob}
        onReminders={setRemindersJob}
        onAddToGoogle={(next) => addToGoogle(next.id)}
        onComplete={completeJob}
        onCancel={cancelJob}
      />
    );
  }

  return (
    <DashboardShell
      title="יומן עבודה"
      subtitle="עבודות לפי תאריך וכתובת"
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
        aria-label="טווח יומן"
        value={scope}
        onChange={setScope}
        options={[
          { value: "upcoming", label: "קרובות" },
          { value: "past", label: "עבודות קודמות" },
        ]}
      />

      {!gcalConnected && (
        <div className="mb-4 rounded-2xl border border-attention/50 bg-attention/25 p-4">
          <p className="text-base font-medium text-attention-foreground">
            Google Calendar לא מחובר
          </p>
          <p className="mt-1 text-base text-muted-foreground">
            חברו את היומן כדי להוסיף ביקורים בלחיצה.
          </p>
          <Link
            href="/dashboard/business"
            className="mt-3 inline-flex h-12 items-center rounded-xl bg-primary px-4 text-base font-medium text-primary-foreground"
          >
            חיבור בהגדרות העסק
          </Link>
        </div>
      )}

      {showSkeleton && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      )}
      {loadError && (
        <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {loadError}
        </p>
      )}

      {!showSkeleton && jobs.length === 0 && !loadError && (
        <EmptyState
          title={
            scope === "past" ? "אין עבודות קודמות" : "אין עבודות ביומן"
          }
          description={
            scope === "past"
              ? "עבודות שכבר עברו יופיעו כאן."
              : "הוסיפו בקשה ממסך בקשות עבודה."
          }
        />
      )}

      {scope === "upcoming" && untimed.length > 0 && (
        <section className="mb-6 space-y-3">
          <h2 className="sticky top-[4.5rem] z-[5] -mx-1 bg-background/95 px-1 py-2 text-base font-semibold backdrop-blur">
            ללא שעה
          </h2>
          {untimed.map(renderJob)}
        </section>
      )}

      {scope === "upcoming" && (
        <div className="space-y-6">
          {timedGroups.map(([ymd, group]) => (
            <section key={ymd} className="space-y-3">
              <h2 className="sticky top-[4.5rem] z-[5] -mx-1 bg-background/95 px-1 py-2 text-base font-semibold backdrop-blur">
                {formatDayHeading(group[0].scheduledStart!)}
              </h2>
              {group.map(renderJob)}
            </section>
          ))}
        </div>
      )}

      {scope === "past" && (
        <div className="space-y-3">{jobs.map(renderJob)}</div>
      )}

      <DiaryScheduleDialog
        open={Boolean(scheduleJob)}
        onOpenChange={(open) => {
          if (!open) setScheduleJob(null);
        }}
        job={scheduleJob}
        title="קביעת שעה ביומן"
        description="בחרו תאריך ושעה לביקור."
        requireTime
        initialStart={scheduleJob?.scheduledStart}
        busy={Boolean(scheduleJob && busyId === scheduleJob.id)}
        onSubmit={async ({ start, durationMinutes, reminderOffsets }) => {
          if (!scheduleJob || !start) return;
          await submitSchedule({
            jobId: scheduleJob.id,
            start,
            durationMinutes,
            reminderOffsets,
          });
        }}
      />

      <DiaryRemindersDialog
        open={Boolean(remindersJob)}
        onOpenChange={(open) => {
          if (!open) setRemindersJob(null);
        }}
        job={remindersJob}
        busy={Boolean(remindersJob && busyId === remindersJob.id)}
        onSubmit={async ({ reminderOffsets }) => {
          if (!remindersJob?.scheduledStart) return;
          const start = remindersJob.scheduledStart;
          const end = remindersJob.scheduledEnd
            ? new Date(remindersJob.scheduledEnd).getTime()
            : null;
          const durationMinutes =
            end != null
              ? Math.max(
                  15,
                  Math.round((end - new Date(start).getTime()) / 60_000),
                )
              : null;
          await submitSchedule({
            jobId: remindersJob.id,
            start,
            durationMinutes,
            reminderOffsets,
          });
        }}
      />

      <DiaryConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        conflicts={conflicts}
        busy={Boolean(pending && busyId === pending.jobId)}
        onForce={async () => {
          if (!pending) return;
          await submitSchedule({ ...pending, force: true });
        }}
        onReplace={async (replaceJobId) => {
          if (!pending) return;
          await submitSchedule({ ...pending, replaceJobId });
        }}
      />
    </DashboardShell>
  );
}

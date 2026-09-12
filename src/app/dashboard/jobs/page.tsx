"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DiaryConflictDialog,
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
  fetchJobs,
  invalidateOwnerLists,
  pollMs,
  queryKeys,
  type JobsTab,
} from "@/lib/dashboard-query";
import type { Job } from "@/lib/jobs";
import { toast } from "sonner";

const JOBS_TAB_KEY = "dobby.jobsTab";

function isJobsTab(value: string | null): value is JobsTab {
  return value === "open" || value === "in_progress" || value === "archive";
}

function migrateStoredTab(value: string | null): JobsTab {
  if (value === "closed") return "archive";
  return isJobsTab(value) ? value : "open";
}

function readStoredJobsTab(): JobsTab {
  if (typeof window === "undefined") return "open";
  try {
    return migrateStoredTab(window.localStorage.getItem(JOBS_TAB_KEY));
  } catch {
    return "open";
  }
}

function writeStoredJobsTab(tab: JobsTab) {
  try {
    window.localStorage.setItem(JOBS_TAB_KEY, tab);
  } catch {
    // ignore quota / private mode
  }
}

type PendingDiaryAction = {
  mode: "add";
  jobId: string;
  start: string | null;
  durationMinutes: number | null;
  reminderOffsets?: number[];
};

function emptyCopy(tab: JobsTab) {
  if (tab === "open") {
    return {
      title: "אין בקשות פתוחות",
      description: "כשהעוזר אוסף בקשת עבודה חדשה, היא תופיע כאן.",
    };
  }
  if (tab === "in_progress") {
    return {
      title: "אין בקשות בטיפולך",
      description: "בקשות שאישרתם או הוספתם ליומן יופיעו כאן.",
    };
  }
  return {
    title: "אין בקשות בארכיון",
    description: "בקשות שבוצעו או בוטלו יופיעו כאן לשחזור.",
  };
}

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<JobsTab>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflicts, setConflicts] = useState<Job[]>([]);
  const [pending, setPending] = useState<PendingDiaryAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredJobsTab();
    if (stored !== "open") setTab(stored);
  }, []);

  const {
    data: jobs = [],
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.jobs(tab),
    queryFn: () => fetchJobs(tab),
    refetchInterval: pollMs.jobs,
  });

  const selected =
    selectedId == null
      ? null
      : (jobs.find((job) => job.id === selectedId) ?? null);

  function changeTab(next: JobsTab) {
    setTab(next);
    writeStoredJobsTab(next);
    setSelectedId(null);
  }

  const showSkeleton = isLoading && jobs.length === 0;
  const loadError =
    actionError ??
    (error instanceof Error ? error.message : error ? "שגיאה בטעינה" : null);

  async function completeJob(id: string, payload: CompleteJobPayload) {
    const previous = queryClient.getQueryData<Job[]>(queryKeys.jobs(tab));
    setBusyId(id);
    if (tab !== "archive") {
      queryClient.setQueryData<Job[]>(queryKeys.jobs(tab), (prev) =>
        (prev ?? []).filter((job) => job.id !== id),
      );
    }
    try {
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
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
      if (previous) {
        queryClient.setQueryData(queryKeys.jobs(tab), previous);
      }
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelJob(id: string) {
    const previous = queryClient.getQueryData<Job[]>(queryKeys.jobs(tab));
    setBusyId(id);
    if (tab !== "archive") {
      queryClient.setQueryData<Job[]>(queryKeys.jobs(tab), (prev) =>
        (prev ?? []).filter((job) => job.id !== id),
      );
    }
    try {
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to cancel job");
      }
      toast.success("הבקשה סומנה כבוטל");
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(queryKeys.jobs(tab), previous);
      }
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setBusyId(null);
    }
  }

  async function restoreJob(id: string) {
    const previous = queryClient.getQueryData<Job[]>(queryKeys.jobs(tab));
    setBusyId(id);
    if (tab === "archive") {
      queryClient.setQueryData<Job[]>(queryKeys.jobs(tab), (prev) =>
        (prev ?? []).filter((job) => job.id !== id),
      );
    }
    try {
      const response = await apiFetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "restore" }),
      });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to restore job");
      }
      toast.success("הבקשה שוחזרה");
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(queryKeys.jobs(tab), previous);
      }
      toast.error(err instanceof Error ? err.message : "שגיאה בשחזור");
    } finally {
      setBusyId(null);
    }
  }

  async function submitDiary(
    action: PendingDiaryAction & {
      force?: boolean;
      replaceJobId?: string;
    },
  ) {
    setBusyId(action.jobId);
    setActionError(null);
    try {
      const response = await apiFetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: action.jobId,
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
        setScheduleOpen(false);
        setConflictOpen(true);
        return;
      }

      if (!json.ok) {
        throw new Error(json.error || "Failed to add to diary");
      }

      setScheduleOpen(false);
      setConflictOpen(false);
      setPending(null);
      setConflicts([]);
      await invalidateOwnerLists(queryClient);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בהוספה ליומן");
    } finally {
      setBusyId(null);
    }
  }

  const empty = emptyCopy(tab);
  const canAct = tab === "open" || tab === "in_progress";

  return (
    <DashboardShell
      title="בקשות עבודה"
      subtitle="לחצו על בקשה לפרטים מלאים, או עבור לשיחה ישירות מהכרטיס"
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
        aria-label="סינון בקשות עבודה"
        value={tab}
        onChange={changeTab}
        options={[
          { value: "open", label: "פתוחות" },
          { value: "in_progress", label: "בטיפולך" },
          { value: "archive", label: "ארכיון" },
        ]}
      />

      {showSkeleton && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      )}
      {loadError && (
        <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {loadError}
        </p>
      )}

      {!showSkeleton && jobs.length === 0 && !loadError && (
        <EmptyState title={empty.title} description={empty.description} />
      )}

      <ul className="space-y-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobCard
              job={job}
              busy={busyId === job.id}
              selected={selected?.id === job.id}
              onSelect={(next) => setSelectedId(next.id)}
              onComplete={canAct ? completeJob : undefined}
              onCancel={canAct ? cancelJob : undefined}
              onRestore={tab === "archive" ? restoreJob : undefined}
              onSchedule={
                canAct
                  ? (next) => {
                      setSelectedId(next.id);
                      setScheduleOpen(true);
                    }
                  : undefined
              }
            />
          </li>
        ))}
      </ul>

      <DiaryScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        job={selected}
        busy={Boolean(selected && busyId === selected.id)}
        onSubmit={async ({ start, durationMinutes, reminderOffsets }) => {
          if (!selected) return;
          await submitDiary({
            mode: "add",
            jobId: selected.id,
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
          await submitDiary({ ...pending, force: true });
        }}
        onReplace={async (replaceJobId) => {
          if (!pending) return;
          await submitDiary({ ...pending, replaceJobId });
        }}
      />
    </DashboardShell>
  );
}

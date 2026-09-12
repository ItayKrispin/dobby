"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink } from "@/components/dashboard/back-link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useNotifications } from "@/components/dashboard/notifications";
import type { OwnerNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function typeLabel(type: OwnerNotification["type"]) {
  switch (type) {
    case "owner_handoff":
      return "בקשת שיחה";
    case "new_job":
      return "בקשת עבודה חדשה";
    case "job_reminder":
      return "תזכורת";
    default:
      return type;
  }
}

function hrefForNotification(item: OwnerNotification) {
  if (item.type === "job_reminder") return "/dashboard/diary";
  if (item.type === "new_job") {
    return item.phone
      ? `/dashboard/${encodeURIComponent(item.phone)}`
      : "/dashboard/jobs";
  }
  if (item.phone) return `/dashboard/${encodeURIComponent(item.phone)}`;
  return "/dashboard/updates";
}

export default function UpdatesPage() {
  const router = useRouter();
  const {
    notifications: items,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    refresh,
  } = useNotifications();

  return (
    <DashboardShell
      title="עדכונים"
      subtitle="בקשות שיחה, בקשות עבודה ותזכורות"
      leading={<BackLink href="/dashboard/more" />}
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={unreadCount === 0}
          onClick={async () => {
            await markAllRead();
            await refresh();
          }}
        >
          סמן הכל
        </Button>
      }
    >
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState
          title="אין עדכונים"
          description="כשלקוח יבקש לדבר איתך או שתגיע בקשת עבודה חדשה — זה יופיע כאן."
        />
      )}

      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={cn(
                "w-full rounded-2xl border p-4 text-right shadow-sm transition-colors",
                item.readAt
                  ? "border-border bg-card hover:bg-muted/40"
                  : "border-primary/30 bg-accent/30 hover:bg-accent/50",
              )}
              onClick={async () => {
                if (!item.readAt) await markRead(item.id);
                router.push(hrefForNotification(item));
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {typeLabel(item.type)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(item.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-base font-semibold">{item.title}</p>
              {item.body ? (
                <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
              ) : null}
              {item.phone ? (
                <p className="mt-2 text-sm text-primary underline-offset-2">
                  <Link
                    href={hrefForNotification(item)}
                    onClick={(event) => event.stopPropagation()}
                    className="hover:underline"
                  >
                    פתח
                  </Link>
                </p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </DashboardShell>
  );
}

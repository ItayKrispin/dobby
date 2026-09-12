"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api-fetch";
import {
  fetchNotifications,
  pollMs,
  queryKeys,
  type NotificationsPayload,
} from "@/lib/dashboard-query";
import type { OwnerNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

type NotificationsContextValue = {
  unreadCount: number;
  notifications: OwnerNotification[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  openSheet: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

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
    case "paused_message":
      return "הודעה בזמן השהיה";
    default:
      return type;
  }
}

function hrefForNotification(item: OwnerNotification) {
  if (item.type === "job_reminder") {
    return "/dashboard/diary";
  }
  if (item.type === "new_job") {
    return item.phone
      ? `/dashboard/${encodeURIComponent(item.phone)}`
      : "/dashboard/jobs";
  }
  if (item.phone) {
    return `/dashboard/${encodeURIComponent(item.phone)}`;
  }
  return "/dashboard/updates";
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const router = useRouter();

  const { data, refetch, isLoading } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => fetchNotifications(100),
    refetchInterval: pollMs.notifications,
  });

  const notifications = useMemo(
    () => data?.notifications ?? [],
    [data?.notifications],
  );
  const unreadCount = data?.unreadCount ?? 0;
  const sheetItems = useMemo(
    () => notifications.slice(0, 20),
    [notifications],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const markRead = useCallback(
    async (id: string) => {
      const previous = queryClient.getQueryData<NotificationsPayload>(
        queryKeys.notifications,
      );
      queryClient.setQueryData<NotificationsPayload>(
        queryKeys.notifications,
        (prev) => {
          if (!prev) return prev;
          const nextNotifications = prev.notifications.map((item) =>
            item.id === id
              ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
              : item,
          );
          const wasUnread = prev.notifications.some(
            (item) => item.id === id && !item.readAt,
          );
          return {
            notifications: nextNotifications,
            unreadCount: wasUnread
              ? Math.max(0, prev.unreadCount - 1)
              : prev.unreadCount,
          };
        },
      );
      try {
        const response = await apiFetch(`/api/notifications/${id}`, {
          method: "PATCH",
        });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error || "Failed");
      } catch {
        if (previous) {
          queryClient.setQueryData(queryKeys.notifications, previous);
        }
        toast.error("לא הצלחתי לסמן כנקרא");
        await refetch();
      }
    },
    [queryClient, refetch],
  );

  const markAllRead = useCallback(async () => {
    const previous = queryClient.getQueryData<NotificationsPayload>(
      queryKeys.notifications,
    );
    queryClient.setQueryData<NotificationsPayload>(
      queryKeys.notifications,
      (prev) => {
        if (!prev) return prev;
        return {
          notifications: prev.notifications.map((item) => ({
            ...item,
            readAt: item.readAt ?? new Date().toISOString(),
          })),
          unreadCount: 0,
        };
      },
    );
    try {
      const response = await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || "Failed");
    } catch {
      if (previous) {
        queryClient.setQueryData(queryKeys.notifications, previous);
      }
      toast.error("לא הצלחתי לסמן הכל כנקרא");
    }
  }, [queryClient]);

  const openSheet = useCallback(() => setSheetOpen(true), []);

  const value = useMemo(
    () => ({
      unreadCount,
      notifications,
      isLoading: isLoading && !data,
      refresh,
      openSheet,
      markRead,
      markAllRead,
    }),
    [
      unreadCount,
      notifications,
      isLoading,
      data,
      refresh,
      openSheet,
      markRead,
      markAllRead,
    ],
  );

  async function openItem(item: OwnerNotification) {
    if (!item.readAt) {
      await markRead(item.id);
    }
    setSheetOpen(false);
    router.push(hrefForNotification(item));
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-full max-w-md sm:max-w-md" dir="rtl">
          <SheetHeader>
            <SheetTitle>עדכונים</SheetTitle>
            <SheetDescription>
              התראות על בקשות שיחה, בקשות עבודה חדשות ותזכורות
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex items-center justify-between gap-2 px-1">
            <Button
              variant="outline"
              size="sm"
              disabled={unreadCount === 0}
              onClick={() => markAllRead()}
            >
              סמן הכל כנקרא
            </Button>
            <Link
              href="/dashboard/updates"
              onClick={() => setSheetOpen(false)}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              כל העדכונים
            </Link>
          </div>

          <ul className="mt-4 space-y-2 overflow-y-auto pb-8">
            {sheetItems.length === 0 && (
              <li className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                אין עדכונים עדיין
              </li>
            )}
            {sheetItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={cn(
                    "w-full rounded-2xl border p-3 text-right transition-colors",
                    item.readAt
                      ? "border-border bg-card hover:bg-muted/50"
                      : "border-primary/30 bg-accent/40 hover:bg-accent/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {typeLabel(item.type)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(item.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 font-semibold leading-snug">{item.title}</p>
                  {item.body ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.body}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}

export function NotificationsBell({ className }: { className?: string }) {
  const { unreadCount, openSheet } = useNotifications();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("relative", className)}
      aria-label={
        unreadCount > 0 ? `עדכונים, ${unreadCount} שלא נקראו` : "עדכונים"
      }
      onClick={openSheet}
    >
      <Bell className="size-5" />
      {unreadCount > 0 ? (
        <span className="absolute -top-1 -start-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Button>
  );
}

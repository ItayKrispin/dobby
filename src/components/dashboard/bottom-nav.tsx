"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const THREAD_EXCLUDED = [
  "jobs",
  "diary",
  "stats",
  "contacts",
  "business",
  "more",
  "services",
  "updates",
  "conversations",
] as const;

const NAV_ITEMS = [
  {
    href: "/dashboard/jobs",
    label: "בקשות",
    icon: Briefcase,
    match: (path: string) => path.startsWith("/dashboard/jobs"),
  },
  {
    href: "/dashboard/conversations",
    label: "שיחות",
    icon: MessageCircle,
    match: (path: string) =>
      path.startsWith("/dashboard/conversations") ||
      (/^\/dashboard\/[^/]+$/.test(path) &&
        !THREAD_EXCLUDED.includes(
          (path.split("/")[2] ?? "") as (typeof THREAD_EXCLUDED)[number],
        )),
  },
  {
    href: "/dashboard/diary",
    label: "יומן",
    icon: CalendarDays,
    match: (path: string) => path.startsWith("/dashboard/diary"),
  },
  {
    href: "/dashboard/stats",
    label: "נתונים",
    icon: BarChart3,
    match: (path: string) => path.startsWith("/dashboard/stats"),
  },
  {
    href: "/dashboard/more",
    label: "עוד",
    icon: MoreHorizontal,
    match: (path: string) =>
      path.startsWith("/dashboard/more") ||
      path.startsWith("/dashboard/contacts") ||
      path.startsWith("/dashboard/business") ||
      path.startsWith("/dashboard/services") ||
      path.startsWith("/dashboard/updates"),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  // Hide on customer thread (WhatsApp pattern)
  const isCustomerThread =
    /^\/dashboard\/[^/]+$/.test(pathname) &&
    !THREAD_EXCLUDED.includes(
      (pathname.split("/")[2] ?? "") as (typeof THREAD_EXCLUDED)[number],
    );

  if (isCustomerThread) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="ניווט ראשי"
    >
      <div className="mx-auto flex max-w-2xl items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn("size-6", active && "fill-primary/15")}
                strokeWidth={active ? 2.25 : 1.75}
                aria-hidden
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "תיבת שיחות", match: (path: string) => path === "/dashboard" },
  {
    href: "/dashboard/assistant",
    label: "העוזר",
    match: (path: string) => path.startsWith("/dashboard/assistant"),
  },
  {
    href: "/dashboard/contacts",
    label: "אנשי קשר",
    match: (path: string) => path.startsWith("/dashboard/contacts"),
  },
  {
    href: "/dashboard/business",
    label: "העסק",
    match: (path: string) =>
      path.startsWith("/dashboard/business") ||
      path.startsWith("/dashboard/services"),
  },
] as const;

type DashboardShellProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** When true, use full viewport height (thread chat). */
  fullHeight?: boolean;
  leading?: ReactNode;
};

export function DashboardShell({
  title,
  subtitle,
  actions,
  children,
  fullHeight = false,
  leading,
}: DashboardShellProps) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "mx-auto flex max-w-3xl flex-col px-4",
        fullHeight
          ? "h-dvh pt-[max(0.5rem,env(safe-area-inset-top))]"
          : "min-h-dvh pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]",
      )}
    >
      <header className="sticky top-0 z-10 -mx-4 shrink-0 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "min-h-9 px-2.5 font-semibold tracking-tight active:scale-[0.98]",
            )}
          >
            Dobby
          </Link>
          {actions}
        </div>

        {leading}

        <nav
          className="mb-3 flex gap-2 rounded-xl border border-border bg-card p-1"
          aria-label="ניווט לוח בקרה"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-center text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1">
          <div className="text-xl font-semibold tracking-tight">{title}</div>
          {subtitle ? (
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
      </header>

      <div className={cn("flex-1", fullHeight ? "min-h-0" : "pt-4")}>{children}</div>
    </div>
  );
}

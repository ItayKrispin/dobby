"use client";

import type { ReactNode } from "react";
import { NotificationsBell } from "@/components/dashboard/notifications";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** When true, use full viewport height (thread chat). */
  fullHeight?: boolean;
  leading?: ReactNode;
  showBell?: boolean;
};

export function DashboardShell({
  title,
  subtitle,
  actions,
  children,
  fullHeight = false,
  leading,
  showBell = true,
}: DashboardShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-2xl flex-col px-4",
        fullHeight
          ? "h-dvh pt-[max(0.5rem,env(safe-area-inset-top))]"
          : "min-h-dvh pt-[max(0.75rem,env(safe-area-inset-top))]",
      )}
    >
      <header className="sticky top-0 z-10 -mx-4 shrink-0 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold tracking-tight text-primary">
            Dobby
          </p>
          <div className="flex items-center gap-2">
            {showBell ? <NotificationsBell /> : null}
            {actions}
          </div>
        </div>

        {leading}

        <div className="space-y-0.5">
          <div className="text-[1.375rem] font-semibold leading-tight tracking-tight">
            {title}
          </div>
          {subtitle ? (
            <div className="text-base text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
      </header>

      <div className={cn("flex-1", fullHeight ? "min-h-0" : "pt-4")}>
        {children}
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { NotificationsBell } from "@/components/dashboard/notifications";
import { cn } from "@/lib/utils";

type ChatShellProps = {
  /** Start side of the slim header (typically back button). */
  leading?: ReactNode;
  /** Center title area (name / phone). */
  title: ReactNode;
  /** End side actions (pause, overflow menu). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Visual variant — assistant stays on the same cream canvas. */
  variant?: "conversation" | "assistant";
  showBell?: boolean;
};

export function ChatShell({
  leading,
  title,
  actions,
  children,
  className,
  variant = "conversation",
  showBell = true,
}: ChatShellProps) {
  const isAssistant = variant === "assistant";

  return (
    <div
      className={cn(
        "mx-auto flex max-w-2xl flex-col bg-background",
        "pt-[max(0.25rem,env(safe-area-inset-top))]",
        isAssistant
          ? "h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom,0px))]"
          : "h-dvh",
        className,
      )}
    >
      <header className="shrink-0 border-b border-border bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex min-h-12 items-center gap-1">
          <div className="flex shrink-0 items-center">{leading}</div>
          <div className="min-w-0 flex-1 px-1">{title}</div>
          <div className="flex shrink-0 items-center gap-1">
            {showBell ? <NotificationsBell className="size-10" /> : null}
            {actions}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

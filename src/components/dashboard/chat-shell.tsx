"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChatShellProps = {
  /** Left side of the slim header (typically back button). */
  leading?: ReactNode;
  /** Center title area (name / phone). */
  title: ReactNode;
  /** Right side actions (pause, overflow menu). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ChatShell({
  leading,
  title,
  actions,
  children,
  className,
}: ChatShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex h-dvh max-w-3xl flex-col bg-background",
        "pt-[max(0.25rem,env(safe-area-inset-top))]",
        className,
      )}
    >
      <header className="shrink-0 border-b border-border bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex min-h-12 items-center gap-1">
          <div className="flex shrink-0 items-center">{leading}</div>
          <div className="min-w-0 flex-1 px-1">{title}</div>
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

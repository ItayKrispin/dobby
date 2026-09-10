"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { FieldInfo } from "@/components/dashboard/field-info";
import { cn } from "@/lib/utils";

type CollapsibleSectionProps = {
  title: string;
  summary?: string;
  infoTitle?: string;
  infoText?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerActions?: ReactNode;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  summary,
  infoTitle,
  infoText,
  open,
  onOpenChange,
  headerActions,
  children,
}: CollapsibleSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_0_oklch(0.84_0.015_75)]">
      <div className="flex items-center gap-1 border-b border-border/70 px-3 py-2">
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-right active:scale-[0.99]"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{title}</span>
            {!open && summary ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {summary}
              </span>
            ) : null}
          </span>
        </button>
        {infoTitle && infoText ? (
          <FieldInfo title={infoTitle}>{infoText}</FieldInfo>
        ) : null}
        {open && headerActions ? (
          <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
            {headerActions}
          </div>
        ) : null}
      </div>
      {open ? <div className="space-y-3 p-4">{children}</div> : null}
    </section>
  );
}

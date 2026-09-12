import Link from "next/link";
import type { ReactNode } from "react";
import { AvatarInitials } from "@/components/dashboard/avatar-initials";
import { RowActionsSlot } from "@/components/dashboard/row-actions";
import { cn } from "@/lib/utils";

type ListRowProps = {
  href: string;
  title: string;
  subtitle?: ReactNode;
  preview?: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  className?: string;
};

export function ListRow({
  href,
  title,
  subtitle,
  preview,
  meta,
  badges,
  actions,
  leading,
  className,
}: ListRowProps) {
  return (
    <div
      className={cn(
        "flex items-stretch gap-1 rounded-2xl border border-border bg-card shadow-sm transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <Link
        href={href}
        className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 px-3 py-3"
      >
        <div className="relative">
          <AvatarInitials name={title} />
          {leading ? (
            <span className="absolute -bottom-1 -start-1 rounded-full bg-card p-0.5 shadow-sm">
              {leading}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-base font-semibold">{title}</p>
            {meta ? (
              <span className="shrink-0 text-sm text-muted-foreground">
                {meta}
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <div className="mb-0.5 text-sm text-muted-foreground">{subtitle}</div>
          ) : null}
          <div className="flex items-start justify-between gap-2">
            {preview ? (
              <p className="line-clamp-2 text-base text-muted-foreground">
                {preview}
              </p>
            ) : (
              <span />
            )}
            {badges ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {badges}
              </div>
            ) : null}
          </div>
        </div>
      </Link>
      {actions ? <RowActionsSlot>{actions}</RowActionsSlot> : null}
    </div>
  );
}

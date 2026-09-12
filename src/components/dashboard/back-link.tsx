"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type BackLinkProps = {
  href: string;
  label?: string;
  className?: string;
};

export function BackLink({
  href,
  label = "חזור",
  className,
}: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "mb-2 inline-flex min-h-10 items-center gap-1 rounded-xl px-1 text-base font-medium text-primary transition-colors hover:bg-accent/60",
        className,
      )}
    >
      <ChevronRight className="size-5" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

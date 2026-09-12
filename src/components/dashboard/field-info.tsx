"use client";

import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FieldInfoProps = {
  title: string;
  children: string;
  className?: string;
};

export function FieldInfo({ title, children, className }: FieldInfoProps) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          className,
        )}
        aria-label={`מידע: ${title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <Info className="size-5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-72 border border-border bg-card p-3 text-right text-card-foreground shadow-lg ring-1 ring-black/10"
      >
        <PopoverHeader>
          <PopoverTitle className="text-card-foreground">{title}</PopoverTitle>
          <PopoverDescription className="leading-relaxed text-muted-foreground">
            {children}
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

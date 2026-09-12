"use client";

import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowActionItem = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

type RowActionsProps = {
  items: RowActionItem[];
  label?: string;
  className?: string;
};

export function RowActions({
  items,
  label = "פעולות נוספות",
  className,
}: RowActionsProps) {
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label={label}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        }
      >
        <MoreVertical className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
        {items.map((item) => (
          <div key={item.label}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={item.destructive ? "destructive" : "default"}
              disabled={item.disabled}
              onClick={(event) => {
                event.stopPropagation();
                item.onSelect();
              }}
            >
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type RowActionsSlotProps = {
  children?: ReactNode;
};

/** Stops row navigation when interacting with the actions slot. */
export function RowActionsSlot({ children }: RowActionsSlotProps) {
  return (
    <div
      className="shrink-0"
      onClick={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

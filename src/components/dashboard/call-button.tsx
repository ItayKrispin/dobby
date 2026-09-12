"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function toTelHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:+${digits}`;
}

type CallButtonProps = {
  phone: string;
  className?: string;
  size?: "sm" | "icon" | "icon-sm";
};

export function CallButton({
  phone,
  className,
  size = "icon-sm",
}: CallButtonProps) {
  const href = toTelHref(phone);
  if (!href) return null;

  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: "outline", size }),
        "shrink-0",
        className,
      )}
      aria-label="התקשר ללקוח"
      title="התקשר"
      onClick={(event) => event.stopPropagation()}
    >
      <Phone className="size-4" aria-hidden />
    </Link>
  );
}

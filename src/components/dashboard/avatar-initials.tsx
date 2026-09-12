import { cn } from "@/lib/utils";

type AvatarInitialsProps = {
  name: string;
  className?: string;
};

export function AvatarInitials({ name, className }: AvatarInitialsProps) {
  const trimmed = name.trim();
  const initial = trimmed
    ? trimmed.charAt(0).toLocaleUpperCase("he-IL")
    : "?";

  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-accent-foreground",
        className,
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}

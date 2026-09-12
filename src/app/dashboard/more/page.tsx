"use client";

import Link from "next/link";
import { Bell, Building2, ChevronLeft, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const MORE_ITEMS = [
  {
    href: "/dashboard/updates",
    label: "עדכונים",
    description: "בקשות שיחה, בקשות עבודה חדשות ותזכורות",
    icon: Bell,
  },
  {
    href: "/dashboard/contacts",
    label: "אנשי קשר",
    description: "שמות לקוחות לפי מספר טלפון",
    icon: Users,
  },
  {
    href: "/dashboard/business",
    label: "העסק",
    description: "פרטים, שעות, סוגי קריאות ויומן Google",
    icon: Building2,
  },
] as const;

export default function MorePage() {
  return (
    <DashboardShell title="עוד" subtitle="הגדרות וניהול">
      <ul className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {MORE_ITEMS.map((item, index) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 ${
                  index > 0 ? "border-t border-border" : ""
                }`}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.label}</span>
                  <span className="block text-sm text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ChevronLeft
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-center text-sm text-muted-foreground">Dobby</p>
    </DashboardShell>
  );
}

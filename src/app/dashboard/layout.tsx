"use client";

import type { ReactNode } from "react";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { DashboardProviders } from "@/components/dashboard/dashboard-providers";
import { usePathname } from "next/navigation";

const RESERVED = [
  "jobs",
  "diary",
  "stats",
  "contacts",
  "business",
  "more",
  "services",
  "updates",
  "conversations",
];

function isCustomerThread(pathname: string) {
  return (
    /^\/dashboard\/[^/]+$/.test(pathname) &&
    !RESERVED.includes(pathname.split("/")[2] ?? "")
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = isCustomerThread(pathname);

  return (
    <DashboardProviders>
      <div className="min-h-dvh bg-background">
        <div
          className={
            fullBleed
              ? undefined
              : "pb-[calc(3.75rem+env(safe-area-inset-bottom))]"
          }
        >
          {children}
        </div>
        <BottomNav />
      </div>
    </DashboardProviders>
  );
}

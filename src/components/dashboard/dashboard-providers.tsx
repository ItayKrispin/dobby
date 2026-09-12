"use client";

import { useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { NotificationsProvider } from "@/components/dashboard/notifications";
import {
  fetchJobs,
  listGcTime,
  listStaleTime,
  queryKeys,
} from "@/lib/dashboard-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: listStaleTime,
        gcTime: listGcTime,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

/** Warm the default בקשות tab so the first nav tap is often instant. */
function PrefetchOwnerData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.jobs("open"),
      queryFn: () => fetchJobs("open"),
    });
  }, [queryClient]);

  return null;
}

export function DashboardProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>
        <PrefetchOwnerData />
        {children}
      </NotificationsProvider>
    </QueryClientProvider>
  );
}

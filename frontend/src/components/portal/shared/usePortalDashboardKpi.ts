"use client";

import type { PortalKey } from "@/constants/portalNav";
import { useSkipDashboardKpi } from "@/lib/useSkipDashboardKpi";
import {
  useGetDashboardAdminQuery,
  useGetDashboardDispatchQuery,
  useGetDashboardFinanceQuery,
  useGetDashboardSalesQuery,
} from "@/store/api";

type DashboardSnapshot = ReturnType<typeof useGetDashboardAdminQuery>;

export function usePortalDashboardKpi(portal: PortalKey): {
  snapshot: DashboardSnapshot;
  endpoint: string;
  toneClass: string;
  skipKpi: boolean;
} {
  const skipKpi = useSkipDashboardKpi(portal);

  const admin = useGetDashboardAdminQuery(undefined, {
    skip: skipKpi || portal !== "admin",
  });
  const sales = useGetDashboardSalesQuery(undefined, {
    skip: skipKpi || portal !== "sales",
  });
  const finance = useGetDashboardFinanceQuery(undefined, {
    skip: skipKpi || portal !== "finance",
  });
  const dispatchDash = useGetDashboardDispatchQuery(undefined, {
    skip: skipKpi || portal !== "dispatch",
  });

  const active: {
    snapshot: DashboardSnapshot;
    endpoint: string;
    toneClass: string;
  } =
    portal === "admin"
      ? {
          snapshot: admin,
          endpoint: "GET /api/dashboard/admin",
          toneClass: "text-emerald-100",
        }
      : portal === "sales"
        ? {
            snapshot: sales,
            endpoint: "GET /api/dashboard/sales",
            toneClass: "text-blue-100",
          }
        : portal === "finance"
          ? {
              snapshot: finance,
              endpoint: "GET /api/dashboard/finance",
              toneClass: "text-violet-100",
            }
          : {
              snapshot: dispatchDash,
              endpoint: "GET /api/dashboard/dispatch",
              toneClass: "text-amber-100",
            };

  return { ...active, skipKpi };
}

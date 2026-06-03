"use client";

import { useAppSelector } from "@/store";

/** Skip KPI fetches until a bearer token exists (avoids pointless 401s). */
export function useSkipDashboardKpi(_department: string): boolean {
  const token = useAppSelector((s) => s.auth.token);
  return !token;
}

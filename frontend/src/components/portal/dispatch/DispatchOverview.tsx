"use client";

import { useMemo, useState } from "react";
import { useDispatchTabAlertOverride } from "./DispatchTabAlert";
import DispatchOverviewWidgets from "./components/DispatchOverviewWidgets";
import {
  buildPendingReturnOrderIds,
  computeDispatchOrderStats,
} from "./dispatchOrderUtils";
import {
  useGetDashboardDispatchQuery,
  useListOrdersQuery,
  useListOrderReturnsQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { pickList } from "@/components/portal/sales/partyDisplay";
import {
  RefreshCw,
} from "lucide-react";

export default function DispatchOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Dispatch Specialist";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardDispatchQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: returnsData, refetch: refetchReturns } = useListOrderReturnsQuery({});

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const orders = useMemo(() => pickOrders(ordersData) as Record<string, unknown>[], [ordersData]);

  const orderStats = useMemo(
    () => computeDispatchOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );
  useDispatchTabAlertOverride(orderStats.transport_return_pending.count);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchKpi().unwrap(),
        refetchOrders().unwrap(),
        refetchReturns().unwrap(),
      ]);
    } catch {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isRefreshing;

  return (
    <div className="space-y-8 pb-10 font-sans">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-sans">
            Dispatch Overview
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 font-sans">
            Welcome,{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {userName}
            </span>{" "}
            (Dispatch). Supervise outbound warehouse dispatches, driver assignments, and vehicle routes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OverviewFlagsWidget currentDepartment="dispatch" variant="headerButton" />

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isAnyLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${isAnyLoading ? "animate-spin" : ""}`}
            />
            Refresh Console
          </button>
        </div>
      </div>

      <DispatchOverviewWidgets
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />
    </div>
  );
}

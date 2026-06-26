"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import OrderVolumeChart from "./OrderVolumeChart";
import SalesOverviewWidgets from "./SalesOverviewWidgets";
import RecentOrdersWidget from "./RecentOrdersWidget";
import {
  useGetDashboardSalesQuery,
  useListOrdersQuery,
  useListPartiesQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { computeSalesOrderStats } from "@/components/portal/sales/orderUtils";
import {
  buildPartyNameById,
  buildPartySraById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import {
  FilePlus,
  RefreshCw,
  ArrowRight,
  Info,
} from "lucide-react";

// Format status label to readable text
function formatStatusLabel(status?: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function SalesOverview() {
  // 1. Redux State & Hooks
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Sales Representative";

  const {
    data: kpiData,
    isFetching: isKpiFetching,
    isError: isKpiError,
    refetch: refetchKpi,
  } = useGetDashboardSalesQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    isError: isOrdersError,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: partiesData } = useListPartiesQuery({});

  const [isRefreshing, setIsRefreshing] = useState(false);

  // 2. Data processing
  const orders = useMemo(() => pickOrders(ordersData) as any[], [ordersData]);

  const orderStats = useMemo(() => computeSalesOrderStats(orders), [orders]);

  const totalOrdersCount = orders.length;

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesData),
    [partiesData]
  );

  const partySraById = useMemo(
    () => buildPartySraById(partiesData),
    [partiesData]
  );

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime; // descending (newest first)
      })
      .slice(0, 3);
  }, [orders]);

  // Combined refresh triggers rotation animation
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchKpi().unwrap(),
        refetchOrders().unwrap(),
      ]);
    } catch (e) {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isRefreshing;

  // Compute stats for visualization (e.g. order mix)
  const draftPercent = totalOrdersCount > 0 ? (orderStats.draft.count / totalOrdersCount) * 100 : 0;
  const openPercent = totalOrdersCount > 0 ? (orderStats.open.count / totalOrdersCount) * 100 : 0;
  const closedPercent = totalOrdersCount > 0 ? (orderStats.closed.count / totalOrdersCount) * 100 : 0;
  const onHoldPercent = totalOrdersCount > 0 ? (orderStats.on_hold.count / totalOrdersCount) * 100 : 0;
  const rejectedPercent = totalOrdersCount > 0 ? (orderStats.rejected.count / totalOrdersCount) * 100 : 0;
  const cancelledPercent = totalOrdersCount > 0 ? (orderStats.cancelled.count / totalOrdersCount) * 100 : 0;

  return (
    <div className="space-y-8 pb-10">
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            Sales Hub
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Welcome back, <span className="font-semibold text-blue-600 dark:text-blue-400">{userName}</span>. Here is your portfolio status for today.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isAnyLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${isAnyLoading ? "animate-spin" : ""
                }`}
            />
            Refresh Hub
          </button>

          <Link
            href="/sales/create-order"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/10 transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <FilePlus className="h-4 w-4" />
            New Order Draft
          </Link>
        </div>
      </div>

      {/* KPI METRICS CARDS */}
      <SalesOverviewWidgets orders={orders} isOrdersFetching={isOrdersFetching} />

      {/* ANALYTICS CHART SECTION */}
      <OrderVolumeChart orders={orders} isOrdersFetching={isOrdersFetching} />

      {/* TWO COLUMN GRID: RECENT ORDERS & STATS / FLAGS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RECENT ORDERS TABLE */}
        <RecentOrdersWidget
          recentOrders={recentOrders}
          isOrdersFetching={isOrdersFetching}
          isOrdersError={isOrdersError}
          partyNameById={partyNameById}
          partySraById={partySraById}
        />

        {/* SIDE COLUMN: STATS & REPRESENTATIVE FLAGS */}
        <div className="space-y-6">
          {/* STATS VISUALIZATION PANEL */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              Portfolio Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Breakdown of order statuses in your queue
            </p>

            <div className="mt-4">
              {isOrdersFetching ? (
                <div className="h-6 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ) : totalOrdersCount > 0 ? (
                <div className="space-y-4">
                  {/* Stacked Segmented Progress Bar */}
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      style={{ width: `${draftPercent}%` }}
                      title={`Drafts: ${orderStats.draft.count}`}
                    />
                    <div
                      className="bg-blue-500 transition-all duration-500"
                      style={{ width: `${openPercent}%` }}
                      title={`Open: ${orderStats.open.count}`}
                    />
                    <div
                      className="bg-emerald-500 transition-all duration-500"
                      style={{ width: `${closedPercent}%` }}
                      title={`Closed: ${orderStats.closed.count}`}
                    />
                    <div
                      className="bg-amber-450 transition-all duration-500"
                      style={{ width: `${onHoldPercent}%` }}
                      title={`On Hold: ${orderStats.on_hold.count}`}
                    />
                    <div
                      className="bg-red-500 transition-all duration-500"
                      style={{ width: `${rejectedPercent}%` }}
                      title={`Rejected: ${orderStats.rejected.count}`}
                    />
                    <div
                      className="bg-rose-500 transition-all duration-500"
                      style={{ width: `${cancelledPercent}%` }}
                      title={`Cancelled: ${orderStats.cancelled.count}`}
                    />
                  </div>

                  {/* Legend Grid */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] font-medium pt-1">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                      <span>Drafts:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {orderStats.draft.count} ({draftPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <span>Open:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {orderStats.open.count} ({openPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Closed:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {orderStats.closed.count} ({closedPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                      <span>On Hold:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {orderStats.on_hold.count} ({onHoldPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                      <span>Rejected:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {orderStats.rejected.count} ({rejectedPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                      <span>Cancelled:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {orderStats.cancelled.count} ({cancelledPercent.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-955/20 dark:text-slate-400">
                  <Info className="h-4 w-4 text-slate-400 shrink-0" />
                  No order data to visualize distribution. Start by drafting a new order.
                </div>
              )}
            </div>
          </div>
          <OverviewFlagsWidget currentDepartment="sales" />
        </div>
      </div>
    </div>
  );
}

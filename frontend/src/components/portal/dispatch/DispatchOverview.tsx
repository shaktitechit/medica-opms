"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDispatchTabAlertOverride } from "./DispatchTabAlert";
import DispatchOrderVolumeChart from "./components/DispatchOrderVolumeChart";
import DispatchOverviewWidgets from "./components/DispatchOverviewWidgets";
import DispatchRecentOrdersWidget from "./components/DispatchRecentOrdersWidget";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  DISPATCH_ORDER_TABS,
  DISPATCH_STATUS_COLORS,
  buildPendingReturnOrderIds,
  computeDispatchOrderStats,
  type DispatchOrderTabCategory,
} from "./dispatchOrderUtils";
import {
  useGetDashboardDispatchQuery,
  useListOrdersQuery,
  useListOrderReturnsQuery,
  useListPartiesQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { buildPartyNameById, buildPartySraById, pickList } from "@/components/portal/sales/partyDisplay";
import {
  ClipboardCheck,
  Users,
  Package,
  RefreshCw,
  ArrowRight,
  Info,
  Truck,
} from "lucide-react";

const PIPELINE_SEGMENT_COLORS: Record<DispatchOrderTabCategory, string> = {
  pending_approvals: "bg-violet-500",
  pending_transport: "bg-amber-500",
  pending_delivery: "bg-blue-500",
  returns_pending: "bg-rose-500",
  closed: "bg-emerald-500",
  on_hold: "bg-orange-500",
  cancelled: "bg-slate-500",
};



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
    isError: isOrdersError,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: returnsData, refetch: refetchReturns } = useListOrderReturnsQuery({});

  const { data: partiesData } = useListPartiesQuery({});



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
  useDispatchTabAlertOverride(
    orderStats.pending_transport.count + orderStats.pending_delivery.count,
  );

  const totalOrdersCount = useMemo(() => {
    return orders.filter((o) => deriveOrderWorkflowStatus(o) !== "draft").length;
  }, [orders]);

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesData),
    [partiesData],
  );

  const partySraById = useMemo(
    () => buildPartySraById(partiesData),
    [partiesData],
  );



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

  const pipelinePercents = useMemo(() => {
    if (totalOrdersCount === 0) {
      return Object.fromEntries(
        DISPATCH_ORDER_TABS.map(({ id }) => [id, 0]),
      ) as Record<(typeof DISPATCH_ORDER_TABS)[number]["id"], number>;
    }
    return Object.fromEntries(
      DISPATCH_ORDER_TABS.map(({ id }) => [
        id,
        (orderStats[id].count / totalOrdersCount) * 100,
      ]),
    ) as Record<(typeof DISPATCH_ORDER_TABS)[number]["id"], number>;
  }, [orderStats, totalOrdersCount]);

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

        <div className="flex items-center gap-3">
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

      <DispatchOrderVolumeChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-sans">
          Logistics Management Controls
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Link
            href="/dispatch/orders"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-amber-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                Dispatch Queue
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                Review approved orders and trigger full or partial shipments.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-semibold text-amber-655 dark:text-amber-400">
              Operations
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/dispatch/drivers"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-orange-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-orange-50 p-2 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-155">
                Driver Registry
              </h4>
              <p className="mt-1 text-xs text-slate-505 dark:text-slate-400 leading-relaxed font-sans">
                Inspect deliverers, assignments, contact details, and license verification.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-semibold text-orange-655 dark:text-orange-400 font-sans">
              Driver list
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/dispatch/vehicles"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-955/30 dark:text-blue-400">
                <Truck className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-155">
                Vehicle Fleet
              </h4>
              <p className="mt-1 text-xs text-slate-505 dark:text-slate-400 leading-relaxed font-sans">
                Manage carrier details, payload weights, capacities, and active states.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-semibold text-blue-655 dark:text-blue-400 font-sans">
              Registry
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/dispatch/transporters"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-purple-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-purple-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-purple-50 p-2 text-purple-600 dark:bg-purple-955/30 dark:text-purple-400">
                <Package className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-155">
                Partners Directory
              </h4>
              <p className="mt-1 text-xs text-slate-505 dark:text-slate-400 leading-relaxed font-sans">
                Coordinate with transport agencies, logistics contractors, and consignment profiles.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-semibold text-purple-655 dark:text-purple-400 font-sans">
              Partners
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <DispatchRecentOrdersWidget
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          isOrdersError={isOrdersError}
          partyNameById={partyNameById}
          partySraById={partySraById}
          categoryOptions={categoryOptions}
        />

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
              Fleet Cargo Pipeline
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
              Distribution of order packages currently in the logistics workflow
            </p>

            <div className="mt-4 font-sans">
              {isOrdersFetching ? (
                <div className="h-6 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ) : totalOrdersCount > 0 ? (
                <div className="space-y-4">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    {DISPATCH_ORDER_TABS.map(({ id }) => (
                      <div
                        key={id}
                        className={`${PIPELINE_SEGMENT_COLORS[id]} transition-all duration-500`}
                        style={{ width: `${pipelinePercents[id]}%` }}
                        title={`${DISPATCH_STATUS_COLORS[id].label}: ${orderStats[id].count}`}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-y-2 text-[11px] font-medium pt-1 font-sans">
                    {DISPATCH_ORDER_TABS.map(({ id }) => (
                      <div
                        key={id}
                        className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400"
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${DISPATCH_STATUS_COLORS[id].dot}`} />
                        <span>{DISPATCH_STATUS_COLORS[id].label}:</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 ml-auto font-mono">
                          {orderStats[id].count} ({pipelinePercents[id].toFixed(0)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-505 dark:bg-slate-955/20 dark:text-slate-400">
                  <Info className="h-4 w-4 text-slate-400 shrink-0" />
                  No order data under dispatch management.
                </div>
              )}
            </div>
          </div>
          <OverviewFlagsWidget currentDepartment="dispatch" />
        </div>
      </div>
    </div>
  );
}

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
  useListFlagsQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { buildPartyNameById, pickList } from "@/components/portal/sales/partyDisplay";
import {
  ClipboardCheck,
  Users,
  Package,
  RefreshCw,
  ArrowRight,
  Info,
  Flag,
  ExternalLink,
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

function getSeverityBadgeClass(severity?: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "critical") {
    return "bg-red-100 text-red-800 ring-1 ring-red-650/20 dark:bg-red-955/40 dark:text-red-455";
  }
  if (s === "high") {
    return "bg-rose-100 text-rose-855 ring-1 ring-rose-655/15 dark:bg-rose-955/35 dark:text-rose-455";
  }
  if (s === "medium") {
    return "bg-amber-100 text-amber-855 ring-1 ring-amber-600/15 dark:bg-amber-955/30 dark:text-amber-455";
  }
  return "bg-blue-100 text-blue-855 ring-1 ring-blue-600/15 dark:bg-blue-955/30 dark:text-blue-455";
}

function formatStatusLabel(status?: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractFlags(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.flags)) return o.flags;
  }
  return [];
}

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

  const {
    data: flagsData,
    isFetching: isFlagsFetching,
    isError: isFlagsError,
    refetch: refetchFlags,
  } = useListFlagsQuery({});

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

  const orderNoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      const id =
        o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
      const ref = String(o.order_no ?? o.order_number ?? "");
      if (id && ref) map.set(id, ref);
    }
    return map;
  }, [orders]);

  const relevantFlags = useMemo(() => {
    const allFlags = extractFlags(flagsData);
    return allFlags.filter((f) => {
      if (!f || typeof f !== "object") return false;
      const flag = f as Record<string, unknown>;
      if (flag.status !== "open" && flag.status !== "in_progress") return false;
      return flag.department === "dispatch" || orderNoById.has(String(flag.order || ""));
    });
  }, [flagsData, orderNoById]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchKpi().unwrap(),
        refetchOrders().unwrap(),
        refetchReturns().unwrap(),
        refetchFlags().unwrap(),
      ]);
    } catch {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isFlagsFetching || isRefreshing;

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

          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-rose-500" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
                  Active Dispatch Alerts
                </h3>
              </div>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-955/30 dark:text-rose-400">
                {relevantFlags.length}
              </span>
            </div>

            <div className="mt-4 max-h-[min(380px,50vh)] overflow-auto">
              {isFlagsFetching ? (
                <p className="text-xs text-slate-550 dark:text-slate-400 py-2">
                  Loading dispatch alerts…
                </p>
              ) : null}

              {isFlagsError ? (
                <p className="text-xs text-rose-655 dark:text-rose-400 py-2">
                  Could not load dispatch flag registry.
                </p>
              ) : null}

              {!isFlagsFetching &&
                !isFlagsError &&
                relevantFlags.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-xs text-slate-550 dark:text-slate-400">
                    No active blockages reported in dispatch.
                  </p>
                </div>
              ) : null}

              {!isFlagsFetching && !isFlagsError && relevantFlags.length > 0 ? (
                <ul className="space-y-3.5">
                  {relevantFlags.map((flag, index) => {
                    const row = flag as Record<string, unknown>;
                    const flagId = row._id ?? row.id ?? String(index);
                    const orderId = String(row.order || "");
                    const orderNo =
                      orderNoById.get(orderId) || `ID: ${orderId.slice(0, 8)}`;
                    const urlPath = `/dispatch/order/${orderId}`;

                    return (
                      <li
                        key={String(flagId)}
                        className="rounded-lg border border-slate-150 bg-slate-50/50 p-3 transition hover:bg-slate-50 dark:border-white/5 dark:bg-slate-950/50 dark:hover:bg-slate-950"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider capitalize ${getSeverityBadgeClass(
                              String(row.severity ?? ""),
                            )}`}
                          >
                            {String(row.severity || "medium")}
                          </span>
                          <span className="font-mono text-[9px] text-slate-400 dark:text-slate-505">
                            {formatStatusLabel(String(row.flag_type ?? ""))}
                          </span>
                        </div>

                        <h4 className="mt-2 text-xs font-bold text-slate-900 dark:text-slate-100 font-sans">
                          {String(row.title ?? "")}
                        </h4>

                        {row.description ? (
                          <p className="mt-1 text-[11px] text-slate-555 dark:text-slate-400 leading-relaxed font-sans">
                            {String(row.description)}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-150/60 pt-2.5 text-[10px] dark:border-white/5 font-sans">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-455">Order Ref:</span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {orderNo}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-slate-455">Location:</span>
                            <Link
                              href={urlPath}
                              className="group inline-flex items-center gap-1 font-medium text-amber-600 hover:underline dark:text-amber-400"
                            >
                              <span className="font-mono text-[9px]">{urlPath}</span>
                              <ExternalLink className="h-2.5 w-2.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </Link>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

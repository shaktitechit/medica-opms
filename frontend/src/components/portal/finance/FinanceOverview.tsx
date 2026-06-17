"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFinanceTabAlertOverride } from "./FinanceTabAlert";
import FinanceOrderVolumeChart from "./components/FinanceOrderVolumeChart";
import FinanceOverviewWidgets from "./components/FinanceOverviewWidgets";
import FinanceRecentOrdersWidget from "./components/FinanceRecentOrdersWidget";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { computeFinanceOrderStats } from "./financeOrderUtils";
import {
  useGetDashboardFinanceQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListFlagsQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { buildPartyNameById } from "@/components/portal/sales/partyDisplay";
import {
  ClipboardCheck,
  Users,
  Package,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Info,
  Flag,
  ExternalLink,
} from "lucide-react";

// Helper for flag severity styling
function getSeverityBadgeClass(severity?: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "critical") {
    return "bg-red-100 text-red-800 ring-1 ring-red-650/20 dark:bg-red-955/40 dark:text-red-455";
  }
  if (s === "high") {
    return "bg-rose-100 text-rose-855 ring-1 ring-rose-600/15 dark:bg-rose-955/35 dark:text-rose-455";
  }
  if (s === "medium") {
    return "bg-amber-100 text-amber-855 ring-1 ring-amber-600/15 dark:bg-amber-955/30 dark:text-amber-455";
  }
  return "bg-blue-100 text-blue-855 ring-1 ring-blue-600/15 dark:bg-blue-955/30 dark:text-blue-455";
}

// Format status label to readable text
function formatStatusLabel(status?: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Extract flags helper
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

export default function FinanceOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Finance Specialist";

  const {
    data: kpiData,
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardFinanceQuery();

  const financeKpi = kpiData as { queue_size?: number; awaiting_finance?: number } | undefined;

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    isError: isOrdersError,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: partiesData } = useListPartiesQuery({});

  const {
    data: flagsData,
    isFetching: isFlagsFetching,
    isError: isFlagsError,
    refetch: refetchFlags,
  } = useListFlagsQuery({});

  const orders = useMemo(() => pickOrders(ordersData) as any[], [ordersData]);

  const orderStats = useMemo(() => computeFinanceOrderStats(orders), [orders]);

  useFinanceTabAlertOverride(orderStats.pending_finance_approval.count);

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
      const ref = o.order_no || o.order_number || "";
      if (id && ref) map.set(id, ref);
    }
    return map;
  }, [orders]);

  // Retrieve the 3 most recent orders that require finance review (or generally in pipeline)
  const recentOrders = useMemo(() => {
    return [...orders]
      .filter((o) => deriveOrderWorkflowStatus(o) !== "draft")
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 3);
  }, [orders]);

  const relevantFlags = useMemo(() => {
    const allFlags = extractFlags(flagsData);
    return allFlags.filter((f: any) => {
      if (!f || typeof f !== "object") return false;
      return f.status === "open" || f.status === "in_progress";
    });
  }, [flagsData]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchKpi().unwrap(),
        refetchOrders().unwrap(),
        refetchFlags().unwrap(),
      ]);
    } catch (e) {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isFlagsFetching || isRefreshing;

  const pendingFinanceApprovalPercent =
    totalOrdersCount > 0 ? (orderStats.pending_finance_approval.count / totalOrdersCount) * 100 : 0;
  const pendingApprovalsPercent =
    totalOrdersCount > 0 ? (orderStats.pending_approvals.count / totalOrdersCount) * 100 : 0;
  const openPercent = totalOrdersCount > 0 ? (orderStats.open.count / totalOrdersCount) * 100 : 0;
  const closedPercent = totalOrdersCount > 0 ? (orderStats.closed.count / totalOrdersCount) * 100 : 0;
  const onHoldPercent = totalOrdersCount > 0 ? (orderStats.on_hold.count / totalOrdersCount) * 100 : 0;
  const rejectedPercent = totalOrdersCount > 0 ? (orderStats.rejected.count / totalOrdersCount) * 100 : 0;
  const cancelledPercent = totalOrdersCount > 0 ? (orderStats.cancelled.count / totalOrdersCount) * 100 : 0;

  return (
    <div className="space-y-8 pb-10 font-sans">
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-sans">
            Finance Overview
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 font-sans">
            Welcome,{" "}
            <span className="font-semibold text-emerald-600 dark:text-emerald-405">
              {userName}
            </span>{" "}
            (Finance). Review cashflow audits and department clearance flags.
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

      {/* KPI METRICS WIDGETS */}
      <FinanceOverviewWidgets orders={orders} isOrdersFetching={isOrdersFetching} />

      {/* ANALYTICS CHART SECTION */}
      <FinanceOrderVolumeChart orders={orders} isOrdersFetching={isOrdersFetching} />

      {/* QUICK ACTIONS GRID */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-sans">
          Finance Management Controls
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/finance/orders"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-emerald-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                Orders Review
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                Approve, hold, or reject incoming orders awaiting billing clearance.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-semibold text-emerald-650 dark:text-emerald-400">
              Audit queue
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/finance/parties"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-teal-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-teal-50 p-2 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-155">
                Client directory
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                Verify credit terms, check outstandings, and audit party balance profiles.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-semibold text-teal-650 dark:text-teal-400 font-sans">
              Manage counterparties
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/finance/products"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-amber-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/30 dark:text-amber-450">
                <Package className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-155">
                Product Pricing
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                Browse catalog catalog pricing rates, tax parameters, and item descriptions.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-semibold text-amber-650 dark:text-amber-450 font-sans">
              Browse inventory
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* TWO COLUMN GRID: RECENT ORDERS & STATS / FLAGS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RECENT ORDERS FEED */}
        <FinanceRecentOrdersWidget
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          isOrdersError={isOrdersError}
          partyNameById={partyNameById}
        />

        {/* SIDE COLUMN: STATS & SYSTEM FLAGS */}
        <div className="space-y-6">
          {/* STATS VISUALIZATION PANEL */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
              Order Pipeline Share
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
              Breakdown of system-wide statuses from finance perspective
            </p>

            <div className="mt-4 font-sans">
              {isOrdersFetching ? (
                <div className="h-6 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ) : totalOrdersCount > 0 ? (
                <div className="space-y-4">
                  {/* Stacked Segmented Progress Bar */}
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="bg-purple-500 transition-all duration-500"
                      style={{ width: `${pendingFinanceApprovalPercent}%` }}
                      title={`Pending Finance Approval: ${orderStats.pending_finance_approval.count}`}
                    />
                    <div
                      className="bg-violet-500 transition-all duration-500"
                      style={{ width: `${pendingApprovalsPercent}%` }}
                      title={`Pending Approvals (all depts): ${orderStats.pending_approvals.count}`}
                    />
                    <div
                      className="bg-teal-500 transition-all duration-500"
                      style={{ width: `${openPercent}%` }}
                      title={`Open: ${orderStats.open.count}`}
                    />
                    <div
                      className="bg-emerald-500 transition-all duration-500"
                      style={{ width: `${closedPercent}%` }}
                      title={`Closed: ${orderStats.closed.count}`}
                    />
                    <div
                      className="bg-amber-500 transition-all duration-500"
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
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] font-medium pt-1 font-sans">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                      <span>Pending Finance:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 ml-auto font-mono">
                        {orderStats.pending_finance_approval.count} ({pendingFinanceApprovalPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
                      <span>Pending Approvals:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 ml-auto font-mono">
                        {orderStats.pending_approvals.count} ({pendingApprovalsPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                      <span>Open:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 ml-auto font-mono">
                        {orderStats.open.count} ({openPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Closed:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 ml-auto font-mono">
                        {orderStats.closed.count} ({closedPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                      <span>On Hold:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 ml-auto font-mono">
                        {orderStats.on_hold.count} ({onHoldPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                      <span>Rejected:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 ml-auto font-mono">
                        {orderStats.rejected.count} ({rejectedPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                      <span>Cancelled:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 ml-auto font-mono">
                        {orderStats.cancelled.count} ({cancelledPercent.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950/20 dark:text-slate-400">
                  <Info className="h-4 w-4 text-slate-400 shrink-0" />
                  No order data to visualize.
                </div>
              )}
            </div>
          </div>

          {/* ACTIVE SYSTEM FLAGS CARD */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-rose-500" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
                  Clearance Flags & Alerts
                </h3>
              </div>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-955/30 dark:text-rose-400">
                {relevantFlags.length}
              </span>
            </div>

            <div className="mt-4 max-h-[min(380px,50vh)] overflow-auto">
              {isFlagsFetching ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  Loading system flags…
                </p>
              ) : null}

              {isFlagsError ? (
                <p className="text-xs text-rose-605 dark:text-rose-400 py-2">
                  Could not load flag registry.
                </p>
              ) : null}

              {!isFlagsFetching &&
                !isFlagsError &&
                relevantFlags.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No active blockages reported in the system.
                  </p>
                </div>
              ) : null}

              {!isFlagsFetching && !isFlagsError && relevantFlags.length > 0 ? (
                <ul className="space-y-3.5">
                  {relevantFlags.map((flag: any, index: number) => {
                    const flagId = flag._id || flag.id || String(index);
                    const orderId = String(flag.order || "");
                    const orderNo =
                      orderNoById.get(orderId) || `ID: ${orderId.slice(0, 8)}`;
                    const urlPath = `/finance/order/${orderId}`;

                    return (
                      <li
                        key={flagId}
                        className="rounded-lg border border-slate-150 bg-slate-50/50 p-3 transition hover:bg-slate-50 dark:border-white/5 dark:bg-slate-950/50 dark:hover:bg-slate-950"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider capitalize ${getSeverityBadgeClass(
                              flag.severity,
                            )}`}
                          >
                            {flag.severity || "medium"}
                          </span>
                          <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500">
                            {formatStatusLabel(flag.flag_type)}
                          </span>
                        </div>

                        <h4 className="mt-2 text-xs font-bold text-slate-900 dark:text-slate-100 font-sans">
                          {flag.title}
                        </h4>

                        {flag.description ? (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                            {flag.description}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-150/60 pt-2.5 text-[10px] dark:border-white/5 font-sans">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500">Order Ref:</span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {orderNo}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 dark:text-slate-500">Location:</span>
                            <Link
                              href={urlPath}
                              className="group inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                              <span className="font-mono text-[9px]">
                                {urlPath}
                              </span>
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

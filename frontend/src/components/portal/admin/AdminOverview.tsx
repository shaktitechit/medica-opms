"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetDashboardAdminQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListFlagsQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import {
  FileText,
  Clock,
  TrendingUp,
  FilePlus,
  ClipboardList,
  Users,
  Package,
  RefreshCw,
  ArrowRight,
  ChevronRight,
  AlertTriangle,
  Info,
  Flag,
  ExternalLink,
  Shield,
  CreditCard,
} from "lucide-react";

// Helper for status badge styling
function getStatusBadgeClass(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s === "draft") {
    return "bg-slate-100 text-slate-800 ring-1 ring-slate-600/10 dark:bg-slate-900/40 dark:text-slate-400 dark:ring-white/10";
  }
  if (s === "submitted" || s === "sales_approved" || s === "on_hold") {
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-600/10 dark:bg-amber-950/20 dark:text-amber-400 dark:ring-amber-500/20";
  }
  if (s === "finance_review" || s === "finance_rejected") {
    return "bg-rose-50 text-rose-800 ring-1 ring-rose-600/10 dark:bg-rose-950/20 dark:text-rose-450 dark:ring-rose-500/20";
  }
  if (
    s.includes("dispatch") ||
    s.includes("transport") ||
    s.includes("transit")
  ) {
    return "bg-blue-50 text-blue-800 ring-1 ring-blue-600/10 dark:bg-blue-950/20 dark:text-blue-400 dark:ring-blue-500/20";
  }
  if (s === "delivered" || s.includes("paid") || s === "closed") {
    return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/10 dark:bg-emerald-950/20 dark:text-emerald-400 dark:ring-emerald-500/20";
  }
  return "bg-slate-50 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900/20 dark:text-slate-400 dark:ring-white/5";
}

// Helper for flag severity styling
function getSeverityBadgeClass(severity?: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "critical") {
    return "bg-red-100 text-red-800 ring-1 ring-red-650/20 dark:bg-red-950/40 dark:text-red-400";
  }
  if (s === "high") {
    return "bg-rose-100 text-rose-855 ring-1 ring-rose-600/15 dark:bg-rose-950/30 dark:text-rose-400";
  }
  if (s === "medium") {
    return "bg-amber-100 text-amber-855 ring-1 ring-amber-600/15 dark:bg-amber-950/30 dark:text-amber-400";
  }
  return "bg-blue-100 text-blue-855 ring-1 ring-blue-600/15 dark:bg-blue-950/30 dark:text-blue-400";
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

export default function AdminOverview() {
  // 1. Redux State & Hooks
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "System Administrator";

  const {
    data: kpiData,
    isFetching: isKpiFetching,
    isError: isKpiError,
    refetch: refetchKpi,
  } = useGetDashboardAdminQuery();

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

  // 2. Data processing
  const adminKpi = kpiData as
    | {
        orders_total?: number;
        orders_by_status?: Record<string, number>;
        open_flags?: number;
      }
    | undefined;

  const totalCount = adminKpi?.orders_total ?? 0;
  const flagCount = adminKpi?.open_flags ?? 0;

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesData),
    [partiesData],
  );

  const orderNoById = useMemo(() => {
    const list = pickOrders(ordersData) as any[];
    const map = new Map<string, string>();
    for (const o of list) {
      const id =
        o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
      const ref = o.order_no || o.order_number || "";
      if (id && ref) map.set(id, ref);
    }
    return map;
  }, [ordersData]);

  const recentOrders = useMemo(() => {
    const list = pickOrders(ordersData) as any[];
    return [...list]
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime; // descending (newest first)
      })
      .slice(0, 5);
  }, [ordersData]);

  // Extract all open flags
  const relevantFlags = useMemo(() => {
    const allFlags = extractFlags(flagsData);
    return allFlags.filter((f: any) => {
      if (!f || typeof f !== "object") return false;
      return f.status === "open" || f.status === "in_progress";
    });
  }, [flagsData]);

  // Combined refresh triggers rotation animation
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

  // Compute stats for visualization (e.g. order mix)
  const ordersByStatus = adminKpi?.orders_by_status || {};
  const draftCount = ordersByStatus.draft || 0;

  const awaitingCount =
    (ordersByStatus.submitted || 0) +
    (ordersByStatus.sales_approved || 0) +
    (ordersByStatus.finance_review || 0) +
    (ordersByStatus.dispatch_pending || 0) +
    (ordersByStatus.transport_pending || 0);

  const completedCount =
    (ordersByStatus.delivered || 0) +
    (ordersByStatus.paid || 0) +
    (ordersByStatus.closed || 0);

  const otherCount = Math.max(
    0,
    totalCount - draftCount - awaitingCount - completedCount,
  );

  const draftPercent = totalCount > 0 ? (draftCount / totalCount) * 100 : 0;
  const awaitingPercent =
    totalCount > 0 ? (awaitingCount / totalCount) * 100 : 0;
  const completedPercent =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const otherPercent = totalCount > 0 ? (otherCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-8 pb-10">
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            Admin Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Welcome,{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {userName}
            </span>{" "}
            (Admin).
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
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${
                isAnyLoading ? "animate-spin" : ""
              }`}
            />
            Refresh Console
          </button>

          <Link
            href="/admin/create-order"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/10 transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <FilePlus className="h-4 w-4" />
            New Order Draft
          </Link>
        </div>
      </div>      {/* KPI METRICS CARDS */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* CARD 1: SYSTEM ORDERS */}
        <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-blue-450 to-indigo-550" />
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-blue-50 p-2.5 dark:bg-blue-950/20">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[10px] font-semibold text-blue-500 dark:text-blue-400">
              TOTAL ORDERS
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {isKpiFetching ? (
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                totalCount
              )}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              System-wide orders logged
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/5">
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300"
            >
              Manage Orders
              <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* CARD 2: SYSTEM ACTIVE FLAGS */}
        <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-red-450 to-rose-500" />
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-red-50 p-2.5 dark:bg-red-950/20">
              <AlertTriangle className="h-5 w-5 text-red-650 dark:text-red-400" />
            </div>
            <span className="text-[10px] font-semibold text-red-500 dark:text-red-400">
              ACTIVE FLAGS
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {isKpiFetching ? (
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                flagCount
              )}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Total unresolved system-wide blockages
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/5">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-455 animate-pulse">
              Requires Review
            </span>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS GRID */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Management Controls
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/create-order"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
                <FilePlus className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                Create Order Draft
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Start order draft with specific salesmen and party records.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-blue-600 dark:text-blue-400">
              Create Order
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/admin/orders"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-violet-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400">
                <ClipboardList className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                System Orders
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Access order index, details, history, delete items, or force
                updates.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-violet-600 dark:text-violet-400">
              View pipeline
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/admin/parties"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-teal-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-teal-50 p-2 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                Party directory
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Add counterparty profiles, billing contacts, and account
                settings.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-teal-600 dark:text-teal-400">
              Manage profiles
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/admin/products"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-amber-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                <Package className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                Product Inventory
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Browse catalogue item rates, product descriptions, packaging,
                and details.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-amber-650 dark:text-amber-450">
              Browse inventory
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* TWO COLUMN GRID: RECENT ORDERS & STATS / FLAGS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* SYSTEM RECENT ORDERS TABLE */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                Recent System Orders
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Overview of the latest 5 order entries across all portals
              </p>
            </div>
            <Link
              href="/admin/orders"
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              See all
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            {isOrdersFetching && (
              <div className="space-y-3 py-6">
                {[...Array(3)].map((_, idx) => (
                  <div
                    key={idx}
                    className="h-10 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            )}

            {isOrdersError && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-xs text-rose-800 dark:bg-rose-950/20 dark:text-rose-455 my-4">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Could not fetch recent orders. Please check your credentials or
                network.
              </div>
            )}

            {!isOrdersFetching &&
              !isOrdersError &&
              recentOrders.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No orders created yet in the database.
                  </p>
                  <Link
                    href="/admin/create-order"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    Create first system order
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}

            {!isOrdersFetching && !isOrdersError && recentOrders.length > 0 && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 dark:border-white/5 dark:text-slate-450">
                    <th className="pb-2 font-semibold">Ref</th>
                    <th className="pb-2 font-semibold">Party</th>
                    <th className="pb-2 font-semibold text-right">Amount</th>
                    <th className="pb-2 font-semibold text-center">Priority</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150/40 dark:divide-white/5">
                  {recentOrders.map((o) => {
                    const id =
                      o._id != null
                        ? String(o._id)
                        : o.id != null
                          ? String(o.id)
                          : "";
                    const ref = o.order_no || o.order_number || id || "—";
                    const total = Number(o.grand_total ?? o.total ?? 0);
                    const pri = o.priority || "normal";
                    const status = o.status || "draft";
                    const cust = resolveOrderCounterparty(
                      o as Record<string, unknown>,
                      partyNameById,
                    );

                    return (
                      <tr key={id} className="hover:bg-slate-50/20">
                        <td className="py-2.5 font-mono text-[11px] text-slate-900 dark:text-slate-100">
                          {ref.slice(0, 12)}
                        </td>
                        <td
                          className="max-w-[140px] truncate py-2.5 pr-2 text-slate-800 dark:text-slate-200"
                          title={cust}
                        >
                          {cust}
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                          {Number.isFinite(total) ? total.toFixed(2) : "0.00"}
                        </td>
                        <td className="py-2.5 text-center capitalize">
                          <span
                            className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              pri === "high" || pri === "urgent"
                                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-455"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {pri}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium tracking-wide ${getStatusBadgeClass(
                              status,
                            )}`}
                          >
                            {formatStatusLabel(status)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <Link
                            href={`/admin/order/${id}`}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* SIDE COLUMN: STATS & SYSTEM FLAGS */}
        <div className="space-y-6">
          {/* STATS VISUALIZATION PANEL */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              System Order Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Breakdown of system-wide statuses in pipeline
            </p>

            <div className="mt-4">
              {isKpiFetching ? (
                <div className="h-6 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ) : totalCount > 0 ? (
                <div className="space-y-4">
                  {/* Stacked Segmented Progress Bar */}
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="bg-slate-400 transition-all duration-500"
                      style={{ width: `${draftPercent}%` }}
                      title={`Drafts: ${draftCount}`}
                    />
                    <div
                      className="bg-blue-500 transition-all duration-500"
                      style={{ width: `${awaitingPercent}%` }}
                      title={`Awaiting Action: ${awaitingCount}`}
                    />
                    <div
                      className="bg-emerald-500 transition-all duration-500"
                      style={{ width: `${completedPercent}%` }}
                      title={`Completed: ${completedCount}`}
                    />
                    <div
                      className="bg-rose-500 transition-all duration-500"
                      style={{ width: `${otherPercent}%` }}
                      title={`Issues / Hold: ${otherCount}`}
                    />
                  </div>

                  {/* Legend Grid */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] font-medium pt-1">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-455">
                      <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                      <span>Drafts:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {draftCount} ({draftPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-455">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <span>Awaiting:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {awaitingCount} ({awaitingPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-455">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Completed:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {completedCount} ({completedPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-455">
                      <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                      <span>Other/Hold:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {otherCount} ({otherPercent.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950/20 dark:text-slate-400">
                  <Info className="h-4 w-4 text-slate-400 shrink-0" />
                  No order data to visualize. Start by logging an order in the
                  console.
                </div>
              )}
            </div>
          </div>

          {/* ACTIVE SYSTEM FLAGS CARD */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-rose-500" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  System Alerts & Flags
                </h3>
              </div>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
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
                <p className="text-xs text-rose-600 dark:text-rose-455 py-2">
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
                    const urlPath = `/admin/order/${orderId}`;

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

                        <h4 className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {flag.title}
                        </h4>

                        {flag.description ? (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            {flag.description}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-150/60 pt-2.5 text-[10px] dark:border-white/5">
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
                              className="group inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
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

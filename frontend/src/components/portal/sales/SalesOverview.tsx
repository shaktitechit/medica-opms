"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetDashboardSalesQuery,
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
  Calendar,
  Flag,
  ExternalLink,
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
    return "bg-rose-50 text-rose-800 ring-1 ring-rose-600/10 dark:bg-rose-950/20 dark:text-rose-400 dark:ring-rose-500/20";
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
    return "bg-rose-100 text-rose-850 ring-1 ring-rose-600/15 dark:bg-rose-950/30 dark:text-rose-400";
  }
  if (s === "medium") {
    return "bg-amber-100 text-amber-850 ring-1 ring-amber-600/15 dark:bg-amber-950/30 dark:text-amber-400";
  }
  return "bg-blue-100 text-blue-850 ring-1 ring-blue-600/15 dark:bg-blue-950/30 dark:text-blue-400";
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

  const {
    data: flagsData,
    isFetching: isFlagsFetching,
    isError: isFlagsError,
    refetch: refetchFlags,
  } = useListFlagsQuery({});

  // 2. Data processing
  const salesKpi = kpiData as
    | { my_orders?: number; draft?: number; pending_submit?: number }
    | undefined;

  const draftCount = salesKpi?.draft ?? 0;
  const submittedCount = Math.max(
    0,
    (salesKpi?.pending_submit ?? 0) - draftCount
  );
  const totalCount = salesKpi?.my_orders ?? 0;

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesData),
    [partiesData]
  );

  const orderNoById = useMemo(() => {
    const list = pickOrders(ordersData) as any[];
    const map = new Map<string, string>();
    for (const o of list) {
      const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
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

  // Extract and filter flags
  const relevantFlags = useMemo(() => {
    const allFlags = extractFlags(flagsData);
    return allFlags.filter((f: any) => {
      if (!f || typeof f !== "object") return false;
      // Only show open or in_progress flags
      if (f.status !== "open" && f.status !== "in_progress") return false;

      const orderId = String(f.order || "");
      const isSalesDept = f.department === "sales";
      return orderNoById.has(orderId) || isSalesDept;
    });
  }, [flagsData, orderNoById]);

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
  const draftPercent = totalCount > 0 ? (draftCount / totalCount) * 100 : 0;
  const submittedPercent =
    totalCount > 0 ? (submittedCount / totalCount) * 100 : 0;
  const otherPercent =
    totalCount > 0
      ? ((totalCount - draftCount - submittedCount) / totalCount) * 100
      : 0;

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
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${
                isAnyLoading ? "animate-spin" : ""
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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* CARD 1: DRAFT ORDERS */}
        <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-slate-400 to-slate-500" />
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-slate-100 p-2.5 dark:bg-slate-800">
              <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              DRAFTS
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {isKpiFetching ? (
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                draftCount
              )}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Orders currently in preparation
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/5">
            <Link
              href="/sales/draft-order"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300"
            >
              Resume Drafts
              <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* CARD 2: PENDING SUBMISSION */}
        <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-amber-400 to-amber-500" />
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-amber-50 p-2.5 dark:bg-amber-950/20">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-450" />
            </div>
            <span className="text-[10px] font-semibold text-amber-500 dark:text-amber-600">
              AWAITING APPROVAL
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {isKpiFetching ? (
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              ) : (
                submittedCount
              )}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting verification and sign-off
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/5">
            <Link
              href="/sales/submitted-orders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 transition group-hover:text-amber-700 dark:text-amber-400 dark:group-hover:text-amber-300"
            >
              Track Submissions
              <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* CARD 3: TOTAL PORTFOLIO */}
        <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
          <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-emerald-450 to-teal-500" />
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-950/20">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400">
              MY PORTFOLIO
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
              Total orders assigned to your portal
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/5">
            <Link
              href="/sales/my-orders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 transition group-hover:text-emerald-700 dark:text-emerald-450 dark:group-hover:text-emerald-350"
            >
              View Order Pipeline
              <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS GRID */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/sales/create-order"
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
                Add medical products, party context, and delivery requirements.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-blue-600 dark:text-blue-400">
              Start draft
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/sales/my-orders"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-violet-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400">
                <ClipboardList className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                Order Pipeline
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                View status distribution, approvals, dispatch status, and collections.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-violet-600 dark:text-violet-400">
              View pipeline
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/sales/parties"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-teal-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-teal-50 p-2 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                Parties
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Browse counterparty listings, contacts, billing, and account notes.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-teal-600 dark:text-teal-400">
              Manage accounts
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/sales/products"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-amber-500/40 dark:hover:bg-slate-800/40"
          >
            <div>
              <div className="inline-flex rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                <Package className="h-5 w-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-150">
                Product Catalog
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                View medical stock availability, unit packaging formats, and list rates.
              </p>
            </div>
            <div className="mt-4 flex items-center text-xs font-medium text-amber-600 dark:text-amber-400">
              Browse inventory
              <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* TWO COLUMN GRID: RECENT ORDERS & STATS / FLAGS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RECENT ORDERS TABLE */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                Recent Orders
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Overview of your 5 latest order entries
              </p>
            </div>
            <Link
              href="/sales/my-orders"
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
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-xs text-rose-800 dark:bg-rose-950/20 dark:text-rose-450 my-4">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Could not fetch recent orders. Please check your credentials or network.
              </div>
            )}

            {!isOrdersFetching && !isOrdersError && recentOrders.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No orders created yet in your portfolio.
                </p>
                <Link
                  href="/sales/create-order"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  Create your first order draft
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
                      partyNameById
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
                                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-450"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {pri}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium tracking-wide ${getStatusBadgeClass(
                              status
                            )}`}
                          >
                            {formatStatusLabel(status)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <Link
                            href={`/sales/order/${id}`}
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
                      className="bg-amber-400 transition-all duration-500"
                      style={{ width: `${submittedPercent}%` }}
                      title={`Awaiting Approval: ${submittedCount}`}
                    />
                    <div
                      className="bg-blue-500 transition-all duration-500"
                      style={{ width: `${otherPercent}%` }}
                      title={`Processed: ${
                        totalCount - draftCount - submittedCount
                      }`}
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
                      <span className="h-2 w-2 rounded-full bg-amber-450 shrink-0" />
                      <span>Awaiting:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {submittedCount} ({submittedPercent.toFixed(0)}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-455 col-span-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <span>Processed:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">
                        {totalCount - draftCount - submittedCount} (
                        {otherPercent.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950/20 dark:text-slate-400">
                  <Info className="h-4 w-4 text-slate-400 shrink-0" />
                  No order data to visualize distribution. Start by drafting a new order.
                </div>
              )}
            </div>
          </div>

          {/* CUSTOM REPRESENTATIVE ORDER FLAGS CARD */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-rose-500" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  Active Alerts & Flags
                </h3>
              </div>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                {relevantFlags.length}
              </span>
            </div>

            <div className="mt-4 max-h-[min(380px,50vh)] overflow-auto">
              {isFlagsFetching ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  Loading flags…
                </p>
              ) : null}

              {isFlagsError ? (
                <p className="text-xs text-rose-600 dark:text-rose-455 py-2">
                  Could not load flag registry.
                </p>
              ) : null}

              {!isFlagsFetching && !isFlagsError && relevantFlags.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    All clear. No outstanding flags on your portfolio.
                  </p>
                </div>
              ) : null}

              {!isFlagsFetching && !isFlagsError && relevantFlags.length > 0 ? (
                <ul className="space-y-3.5">
                  {relevantFlags.map((flag: any, index: number) => {
                    const flagId = flag._id || flag.id || String(index);
                    const orderId = String(flag.order || "");
                    const orderNo = orderNoById.get(orderId) || `ID: ${orderId.slice(0, 8)}`;
                    const urlPath = `/sales/order/${orderId}`;

                    return (
                      <li
                        key={flagId}
                        className="rounded-lg border border-slate-150 bg-slate-50/50 p-3 transition hover:bg-slate-50 dark:border-white/5 dark:bg-slate-950/50 dark:hover:bg-slate-950"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider capitalize ${getSeverityBadgeClass(
                              flag.severity
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

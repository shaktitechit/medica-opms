"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  ADMIN_ORDER_STATUSES,
  PRIORITY_OPTIONS,
} from "@/components/portal/shared/orderStatusOptions";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  computeOrderStatusDimensions,
  dimensionToneClass,
  type OrderStatusDimension,
} from "@/components/portal/shared/orderStatusDimensions";
import { useListPartiesQuery, useListOrdersQuery, useListUsersQuery } from "@/store/api";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  LayoutDashboard,
} from "lucide-react";

type OrderRow = {
  _id?: string;
  id?: string;
  order_no?: string;
  order_number?: string;
  grand_total?: unknown;
  total?: unknown;
  priority?: string;
  status?: string;
  party?: unknown;
  customer?: unknown;
};

function orderKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

function renderPriorityBadge(priority: string) {
  const p = String(priority).toLowerCase();
  if (p === "urgent") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-950/30 dark:text-rose-455/90 dark:ring-rose-500/25">
        Urgent
      </span>
    );
  }
  if (p === "high") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-950/30 dark:text-amber-455/90 dark:ring-amber-500/20">
        High
      </span>
    );
  }
  if (p === "normal") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-950/30 dark:text-blue-455/90 dark:ring-blue-500/20">
        Normal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
      Low
    </span>
  );
}

function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function renderStatusDimensionBadge(
  dimension: OrderStatusDimension | null | undefined,
) {
  if (!dimension) return null;
  const title = dimension.detail
    ? `${dimension.label} — ${dimension.detail}`
    : dimension.label;
  return (
    <div className="flex min-w-[70px] flex-col items-start">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${dimensionToneClass(dimension.tone)} break-words whitespace-normal`}
        title={title}
      >
        {dimension.label}
      </span>
      {dimension.detail && (
        <span
          className="mt-0.5 break-words whitespace-normal text-[9px] font-medium text-slate-500 dark:text-slate-400"
          title={dimension.detail}
        >
          {dimension.detail}
        </span>
      )}
    </div>
  );
}

export default function ListSuperAdminOrdersPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const { data, isFetching, isError, refetch } = useListOrdersQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const partiesQ = useListPartiesQuery({});
  useListUsersQuery({});

  const orders = useMemo(() => pickOrders(data) as OrderRow[], [data]);
  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setCurrentPage(1);
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);
  const handleStatusFilterChange = useCallback((val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  }, []);
  const handlePriorityFilterChange = useCallback((val: string) => {
    setPriorityFilter(val);
    setCurrentPage(1);
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const id = orderKey(o);
        const ref = (
          typeof o.order_no === "string"
            ? o.order_no
            : typeof o.order_number === "string"
              ? o.order_number
              : id || ""
        ).toLowerCase();
        const partyLabel = resolveOrderCounterparty(
          o as Record<string, unknown>,
          partyNameById,
        ).toLowerCase();
        if (!ref.includes(query) && !partyLabel.includes(query)) {
          return false;
        }
      }

      if (priorityFilter !== "all") {
        if ((o.priority || "").toLowerCase() !== priorityFilter.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  }, [orders, searchQuery, priorityFilter, partyNameById]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startEntry =
    filteredOrders.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filteredOrders.length);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/10 bg-gradient-to-r from-violet-600/5 to-indigo-600/10 p-6 shadow-sm dark:from-violet-500/5 dark:to-indigo-500/5">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Super Admin Orders Control
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-600 dark:text-slate-400">
              View and monitor all orders across departments with complete workflow visibility.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/super_admin"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm md:grid-cols-4 dark:border-white/10 dark:bg-slate-900">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
            Search Orders
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-450">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by order # or party..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-655"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
            Order Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
          >
            <option value="all">All Statuses</option>
            {ADMIN_ORDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
            Priority
          </label>
          <div className="flex gap-2">
            <select
              value={priorityFilter}
              onChange={(e) => handlePriorityFilterChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
            >
              <option value="all">All Priorities</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {(searchQuery || statusFilter !== "all" || priorityFilter !== "all") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="self-center whitespace-nowrap pl-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isFetching && (
          <div className="flex flex-col items-center justify-center space-y-2 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Loading orders...
            </p>
          </div>
        )}
        {isError && (
          <div className="px-4 py-16 text-center">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load orders
            </h3>
          </div>
        )}
        {!isFetching && !isError && filteredOrders.length === 0 && (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-xl text-slate-400 dark:border-white/5 dark:bg-slate-955">
              📋
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              No orders found
            </h3>
          </div>
        )}
        {!isFetching && !isError && filteredOrders.length > 0 && (
          <>
            <div className="bg-slate-50/10 p-4 dark:bg-slate-955/10">
              <div className="flex flex-col gap-3.5">
                {paginatedOrders.map((o) => {
                  const id = orderKey(o);
                  const ref =
                    typeof o.order_no === "string"
                      ? o.order_no
                      : typeof o.order_number === "string"
                        ? o.order_number
                        : id || "—";
                  const total = Number(o.grand_total ?? o.total ?? 0);
                  const pri = typeof o.priority === "string" ? o.priority : "normal";
                  const statusDims = computeOrderStatusDimensions(
                    o as Record<string, unknown>,
                  );
                  const partyLabel = resolveOrderCounterparty(
                    o as Record<string, unknown>,
                    partyNameById,
                  );
                  const statusRaw = deriveOrderWorkflowStatus(o) || "draft";
                  const orderDateStr = formatDateShort(
                    (o as any).order_date ?? (o as any).created_at ?? (o as any).createdAt,
                  );
                  let stripeColor = "bg-slate-350 dark:bg-slate-700";
                  if (pri === "urgent") stripeColor = "bg-rose-500";
                  else if (pri === "high") stripeColor = "bg-amber-500";
                  else if (pri === "normal") stripeColor = "bg-blue-500";

                  return (
                    <div
                      key={id || ref}
                      onClick={() => id && router.push(`/super_admin/order/${id}`)}
                      className="relative cursor-pointer overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 pl-5 transition-all duration-300 hover:border-violet-500/20 hover:shadow-md dark:border-white/10 dark:bg-slate-900"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${stripeColor}`} />
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
                        <div className="flex min-w-0 items-center gap-2 lg:col-span-2">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-50">
                            {ref}
                          </span>
                          {renderPriorityBadge(pri)}
                        </div>
                        <span
                          className="min-w-0 break-words whitespace-normal text-xs font-semibold text-slate-800 dark:text-slate-200 lg:col-span-3"
                          title={partyLabel}
                        >
                          {partyLabel}
                        </span>
                        <div className="grid min-w-0 grid-cols-2 gap-3 text-[11px] text-slate-500 lg:col-span-2">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Grand Total
                            </span>
                            <span className="mt-0.5 text-xs font-bold tabular-nums text-slate-900 dark:text-slate-50">
                              ${Number.isFinite(total) ? total.toFixed(2) : "0.00"}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Created
                            </span>
                            <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-355">
                              {orderDateStr}
                            </span>
                          </div>
                        </div>
                        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:col-span-4">
                          <div className="flex flex-col">
                            <span className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Department
                            </span>
                            {renderStatusDimensionBadge(statusDims?.departmental)}
                          </div>
                          <div className="flex flex-col">
                            <span className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Fulfillment
                            </span>
                            {renderStatusDimensionBadge(statusDims?.fulfillment)}
                          </div>
                          <div className="flex flex-col">
                            <span className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Last Action
                            </span>
                            {renderStatusDimensionBadge(statusDims?.action)}
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 lg:col-span-1 lg:text-right">
                          {statusRaw.replaceAll("_", " ")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-4 border-t border-slate-200/60 bg-slate-50/50 px-4 py-3 text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:border-white/5 dark:bg-slate-950/20 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs">
                  Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{startEntry}</span> to{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{endEntry}</span> of{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredOrders.length}</span> entries
                </span>
                <span className="text-slate-350 dark:text-slate-700">|</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Rows per page:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="cursor-pointer rounded border-none bg-transparent py-0.5 text-xs font-semibold text-slate-750 focus:ring-0 dark:text-slate-200"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs font-semibold">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
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
import { OrderListSearchDatePanel } from "@/components/portal/shared/orderList/OrderListSearchDatePanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { orderMatchesDateFilter } from "@/components/portal/shared/orderList/orderListDateFilter";
import { useListPartiesQuery, useListOrdersQuery, useListUsersQuery } from "@/store/api";
import { RefreshCw, LayoutDashboard } from "lucide-react";

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
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const { data, isLoading, isFetching, isError, refetch } = useListOrdersQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const partiesQ = useListPartiesQuery({});
  useListUsersQuery({});

  const orders = useMemo(() => pickOrders(data) as OrderRow[], [data]);
  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const partySraById = useMemo(
    () => buildPartySraById(partiesQ.data),
    [partiesQ.data],
  );

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setDateFilter("all");
    setCustomDateFrom("");
    setCustomDateTo("");
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
  const handleDateFilterChange = useCallback((val: string) => {
    setDateFilter(val);
    setCurrentPage(1);
  }, []);
  const handleCustomDateFromChange = useCallback((val: string) => {
    setCustomDateFrom(val);
    setCurrentPage(1);
  }, []);
  const handleCustomDateToChange = useCallback((val: string) => {
    setCustomDateTo(val);
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

      if (!orderMatchesDateFilter(o as Record<string, unknown>, dateFilter, customDateFrom, customDateTo)) {
        return false;
      }

      return true;
    });
  }, [orders, searchQuery, priorityFilter, partyNameById, dateFilter, customDateFrom, customDateTo]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startEntry =
    filteredOrders.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filteredOrders.length);

  const filtersActive =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    dateFilter !== "all";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Loading orders…" />
      {/* Compact Control Strip */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-violet-500/10 bg-gradient-to-r from-violet-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-violet-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Super Admin Orders Control
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/super_admin"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3 w-3" />
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <OrderListSearchDatePanel
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        dateFilter={dateFilter}
        onDateFilterChange={handleDateFilterChange}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        onCustomDateFromChange={handleCustomDateFromChange}
        onCustomDateToChange={handleCustomDateToChange}
        searchFocusClass="focus:border-violet-600 focus:ring-violet-500/25 dark:focus:border-violet-500"
        desktopPlaceholder="Search by order # or party..."
        mobilePlaceholder="Search order # or party…"
        compact
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="px-4 py-16 text-center">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load orders
            </h3>
          </div>
        )}
        {!isLoading && !isError && filteredOrders.length === 0 && (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-xl text-slate-400 dark:border-white/5 dark:bg-slate-955">
              📋
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              No orders found
            </h3>
          </div>
        )}
        {!isLoading && !isError && filteredOrders.length > 0 && (
          <>
            <OrderListPaginationBar
              startEntry={startEntry}
              endEntry={endEntry}
              totalEntries={filteredOrders.length}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(value) => {
                setItemsPerPage(value);
                setCurrentPage(1);
              }}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
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
                        className="min-w-0 break-words whitespace-normal text-xs font-semibold text-slate-800 dark:text-slate-200 lg:col-span-3 flex items-center gap-1.5"
                        title={partyLabel}
                      >
                        <span>{partyLabel}</span>
                        {checkOrderPartySra(o as Record<string, unknown>, partySraById) && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                            SRA
                          </span>
                        )}
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
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white/95 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-screen-2xl flex-col sm:flex-row sm:items-center sm:justify-end">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-1.5 dark:border-white/5 sm:border-t-0">
            <label className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-500/25 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">All Statuses</option>
              {ADMIN_ORDER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <label className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => handlePriorityFilterChange(e.target.value)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-500/25 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">All</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="cursor-pointer text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

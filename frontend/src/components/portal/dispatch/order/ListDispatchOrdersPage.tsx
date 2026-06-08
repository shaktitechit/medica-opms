"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { PRIORITY_OPTIONS } from "@/components/portal/shared/orderStatusOptions";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  useListPartiesQuery,
  useListOrdersQuery,
  useListUsersQuery,
} from "@/store/api";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  LayoutDashboard,
  UserCheck,
  DollarSign,
  Package,
  Truck,
} from "lucide-react";
import { FulfillmentCircleStep } from "@/components/portal/shared/FulfillmentCircleStep";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";

type OrderRow = {
  _id?: string;
  id?: string;
  order_no?: string;
  order_number?: string;
  grand_total?: unknown;
  total?: unknown;
  priority?: string;
  status?: string;
  lifecycle_status?: string;
  workflow_stage?: string;
  current_action?: string;
  finance_approval_status?: string;
  party?: unknown;
  customer?: unknown;
  assigned_dispatch_user?: unknown;
  assigned_sales_user?: unknown;
  order_date?: string;
  expected_delivery_date?: string;
  created_at?: string;
  createdAt?: string;
  order_items?: unknown[];
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
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-955/30 dark:text-rose-455/90 dark:ring-rose-500/25">
        Urgent
      </span>
    );
  }
  if (p === "high") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-955/30 dark:text-amber-455/90 dark:ring-amber-500/20">
        High
      </span>
    );
  }
  if (p === "normal") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-955/30 dark:text-blue-455/90 dark:ring-blue-500/20">
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

function getDispatchOrderTabCategory(order: unknown): "pending_dispatch" | "pending_delivery" | "closed" | "on_hold" | "cancelled" {
  if (!order || typeof order !== "object") return "pending_delivery";
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";

  if (status === "dispatch_pending" || status === "partially_finance_approved" || status === "fully_finance_approved" || row.workflow_stage === "dispatch_review") {
    return "pending_dispatch";
  }

  if (status === "delivered") {
    return "closed";
  }

  const items = Array.isArray(row.order_items) ? row.order_items : [];
  let ordered = 0;
  let delivered = 0;
  items.forEach((line: any) => {
    ordered += Number(line.ordered_quantity ?? line.quantity ?? 0);
    delivered += Number(line.delivered_quantity ?? 0);
  });

  if (ordered > 0 && delivered >= ordered) {
    return "closed";
  }

  // upstream / draft fallbacks
  if (status === "draft" || status === "submitted" || status === "sales_approved" || status === "finance_review" || status === "finance_rejected") {
    return "pending_dispatch";
  }

  return "pending_delivery";
}

export default function ListDispatchOrdersPage() {
  const router = useRouter();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"pending_dispatch" | "pending_delivery" | "closed" | "on_hold" | "cancelled">("pending_dispatch");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const { data, isFetching, isError, refetch } = useListOrdersQuery({});
  const partiesQ = useListPartiesQuery({});
  const usersQ = useListUsersQuery({});

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const orders = useMemo(
    () => pickOrders(data) as OrderRow[],
    [data],
  );

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const userNameById = useMemo(
    () => buildUserNameById(usersQ.data),
    [usersQ.data],
  );

  // Dynamic filter reset
  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setActiveTab("pending_dispatch");
    setPriorityFilter("all");
    setCurrentPage(1);
  }, []);

  // Setters that reset page to 1
  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);

  const handlePriorityFilterChange = useCallback((val: string) => {
    setPriorityFilter(val);
    setCurrentPage(1);
  }, []);

  // Filtered Orders memo
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Universal Search (checks order # or party name across all tabs)
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
      } else {
        // 2. Tab filter (only if search query is empty)
        const category = getDispatchOrderTabCategory(o);
        if (category !== activeTab) {
          return false;
        }
      }

      // 3. Priority filter
      if (priorityFilter !== "all") {
        if ((o.priority || "").toLowerCase() !== priorityFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [orders, searchQuery, activeTab, priorityFilter, partyNameById]);

  // Paginated Orders slice
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  const startEntry = filteredOrders.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filteredOrders.length);

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/10 bg-gradient-to-r from-amber-600/5 to-orange-600/10 p-6 dark:from-amber-500/5 dark:to-orange-500/5 shadow-sm">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-orange-500/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Dispatch Orders Operations
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl font-medium">
              Track pending shipping fulfillment, assign transport drivers, and supervise logistics vehicles.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              title="Reload orders list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/dispatch"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      {partiesQ.isError && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-955/20 dark:text-amber-450 border border-amber-200/50 dark:border-amber-900/30">
          ⚠️ Party directory failed to load — names may show as shortened IDs.
        </div>
      )}

      {/* Universal Search Bar */}
      <div className="relative rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm p-4">
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
          Universal Search
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search universally by order # or party name across all tabs..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2.5 text-sm text-slate-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-amber-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-655 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Nav Tabs & Priority Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 mt-2 pb-2 md:pb-0">
        {searchQuery.trim() ? (
          <div className="flex items-center gap-2.5 py-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Showing <span className="font-bold text-amber-600 dark:text-amber-400">{filteredOrders.length}</span> search results for <span className="italic font-bold text-slate-900 dark:text-slate-100">"{searchQuery}"</span>
            </span>
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        ) : (
          <nav className="-mb-px flex space-x-6 overflow-x-auto pb-px scrollbar-none" aria-label="Order stages">
            {[
              { id: "pending_dispatch", label: "Pending Dispatch" },
              { id: "pending_delivery", label: "Pending Delivery" },
              { id: "closed", label: "Closed Orders" },
              { id: "on_hold", label: "On Hold" },
              { id: "cancelled", label: "Cancelled" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setCurrentPage(1);
                  }}
                  className={`group border-b-2 py-4 px-1 text-sm font-semibold transition whitespace-nowrap inline-flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? "border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-400"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  {isActive && !isFetching && (
                    <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                      {filteredOrders.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2 self-start md:self-center pb-2 md:pb-0">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Priority:
          </label>
          <div className="flex items-center gap-2">
            <select
              value={priorityFilter}
              onChange={(e) => handlePriorityFilterChange(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/25 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <option value="all">All Priorities</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {(searchQuery || activeTab !== "pending_dispatch" || priorityFilter !== "all") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 pl-1 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid/Table Card */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm overflow-hidden">
        {isFetching && (
          <div className="flex flex-col items-center justify-center py-16 space-y-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-650 border-t-transparent" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading orders...</p>
          </div>
        )}

        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load orders
            </h3>
            <p className="mt-1 text-xs text-slate-505">
              Please check your database connection and try again.
            </p>
          </div>
        )}

        {!isFetching && !isError && filteredOrders.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-955 text-slate-400 text-xl border border-slate-100 dark:border-white/5">
              📋
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100 font-sans">
              No orders found
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              {orders.length === 0
                ? "No orders exist in the database system."
                : "No orders match your search and filter parameters."}
            </p>
          </div>
        )}

        {!isFetching && !isError && filteredOrders.length > 0 && (
          <>
            <div className="p-4 flex flex-col gap-3.5 bg-slate-50/10 dark:bg-slate-955/10">
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
                const deptBoxes = computeDepartmentStageBoxes(
                  o as Record<string, unknown>,
                  null,
                );
                const adminBox = deptBoxes.find((b) => b.id === "admin");
                const financeBox = deptBoxes.find((b) => b.id === "finance");
                const dispatchBox = deptBoxes.find((b) => b.id === "dispatch");
                const deliveryBox = deptBoxes.find((b) => b.id === "delivery");

                const adminStatusDim = adminBox?.status;
                const financeStatusDim = financeBox?.status;
                const dispatchStatusDim = dispatchBox?.status;
                const deliveryStatusDim = deliveryBox?.status;

                const orderItems = Array.isArray(o.order_items) ? o.order_items : [];
                const orderedQty = Math.max(1, orderItems.reduce((acc: number, item: any) => {
                  return acc + (Number(item.ordered_quantity ?? item.quantity) || 0);
                }, 0));

                const partyLabel = resolveOrderCounterparty(
                  o as Record<string, unknown>,
                  partyNameById,
                );

                const orderDateStr = formatDateShort((o as any).order_date ?? (o as any).created_at ?? (o as any).createdAt);
                const expectedDeliveryStr = formatDateShort((o as any).expected_delivery_date);

                let stripeColor = "bg-slate-350 dark:bg-slate-700";
                if (pri === "urgent") stripeColor = "bg-rose-500";
                else if (pri === "high") stripeColor = "bg-amber-500";
                else if (pri === "normal") stripeColor = "bg-blue-500";

                return (
                  <div
                    key={id || ref}
                    onClick={() => {
                      if (id) {
                        router.push(`/dispatch/order/${id}`);
                      }
                    }}
                    className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 transition-all duration-300 hover:shadow-md hover:border-amber-500/20 dark:border-white/10 dark:bg-slate-900 flex flex-col gap-4 pl-5 animate-fadeIn cursor-pointer"
                  >
                    {/* Priority Accent Stripe */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${stripeColor}`} />

                    {/* Top Row: Ref, Badges, Party, Financials & Dates */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full border-b border-slate-100/60 pb-3 dark:border-white/5">
                      {/* Ref & Badges */}
                      <div className="flex items-center justify-between lg:justify-start lg:gap-2 lg:w-[130px] lg:shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-50">
                            {ref}
                          </span>
                          {renderPriorityBadge(pri)}
                        </div>
                      </div>

                      {/* Party Title */}
                      <span
                        className="text-xs font-semibold text-slate-800 dark:text-slate-200 lg:flex-1 break-words whitespace-normal"
                        title={partyLabel}
                      >
                        {partyLabel}
                      </span>

                      {/* Financials & Dates */}
                      <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-8 lg:w-[280px] lg:shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col min-w-[90px]">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Grand Total
                          </span>
                          <span className="mt-0.5 font-bold tabular-nums text-slate-900 dark:text-slate-50 text-xs">
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
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Expected Delivery
                          </span>
                          <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-355">
                            {expectedDeliveryStr}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Pipeline */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/30 p-2.5 rounded-lg dark:bg-slate-955/5 border border-slate-100/50 dark:border-white/5">
                      <span className="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase tracking-wider">
                        Fulfillment Pipeline
                      </span>
                      <div className="flex items-center gap-4 sm:gap-6">
                        <FulfillmentCircleStep label="Admin" status={adminStatusDim} completed={adminBox?.completedQty} total={orderedQty} icon={UserCheck} />
                        <FulfillmentCircleStep label="Finance" status={financeStatusDim} completed={financeBox?.completedQty} total={orderedQty} icon={DollarSign} />
                        <FulfillmentCircleStep label="Dispatch" status={dispatchStatusDim} completed={dispatchBox?.completedQty} total={orderedQty} icon={Package} />
                        <FulfillmentCircleStep label="Delivery" status={deliveryStatusDim} completed={deliveryBox?.completedQty} total={orderedQty} icon={Truck} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Navigation Footer */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-slate-955/20 text-slate-600 dark:text-slate-400">
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
                    className="rounded bg-transparent border-none py-0.5 text-xs font-semibold text-slate-755 focus:ring-0 cursor-pointer dark:text-slate-200"
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
                  className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                  title="First Page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="text-xs font-semibold px-2">
                  Page {currentPage} of {totalPages || 1}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                  title="Last Page"
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

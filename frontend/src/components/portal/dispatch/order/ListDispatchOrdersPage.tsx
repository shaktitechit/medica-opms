"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  pickList,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { OrderListSearchDatePanel } from "@/components/portal/shared/orderList/OrderListSearchDatePanel";
import { orderMatchesDateFilter } from "@/components/portal/shared/orderList/orderListDateFilter";
import {
  useListPartiesQuery,
  useListOrdersQuery,
  useListOrderReturnsQuery,
  useListUsersQuery,
} from "@/store/api";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import { RefreshCw, LayoutDashboard } from "lucide-react";
import {
  OrderFulfillmentPipelineStrip,
  buildListOrderFulfillmentPipeline,
} from "@/components/portal/shared/FulfillmentCircleStep";
import {
  DISPATCH_ORDER_TABS,
  buildPendingReturnOrderIds,
  getDispatchOrderTabCategory,
  isDispatchOrderTabCategory,
  orderMatchesDispatchTab,
  pendingApprovalStageLabel,
  type DispatchOrderTabCategory,
} from "../dispatchOrderUtils";
import { resolveApprovalPending } from "@/components/portal/sales/orderUtils";
import { OrderFlagBadge } from "@/components/portal/shared/OrderFlagBadge";

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
  approval_pending?: {
    admin?: boolean;
    finance?: boolean;
    account?: boolean;
    stage?: string;
  };
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

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderWorkflowStatusBadge(category: DispatchOrderTabCategory) {
  let label = "";
  let bgClass = "";
  switch (category) {
    case "pending_approvals":
      label = "Pending Approvals";
      bgClass =
        "bg-violet-50 text-violet-700 ring-violet-600/10 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-500/25";
      break;
    case "pending_transport":
      label = "Pending Transport";
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "pending_delivery":
      label = "Pending Delivery";
      bgClass =
        "bg-blue-50 text-blue-700 ring-blue-600/10 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-500/25";
      break;
    case "returns_pending":
      label = "Pending Returns";
      bgClass =
        "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-500/25";
      break;
    case "closed":
      label = "Closed";
      bgClass =
        "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-500/25";
      break;
    case "on_hold":
      label = "On Hold";
      bgClass =
        "bg-orange-50 text-orange-700 ring-orange-600/10 dark:bg-orange-950/30 dark:text-orange-400 dark:ring-orange-500/25";
      break;
    case "cancelled":
      label = "Cancelled";
      bgClass =
        "bg-slate-50 text-slate-700 ring-slate-600/10 dark:bg-slate-950/30 dark:text-slate-400 dark:ring-slate-500/25";
      break;
    default:
      label = category;
      bgClass =
        "bg-slate-50 text-slate-655 ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset ${bgClass}`}
    >
      {label}
    </span>
  );
}

function renderPendingApprovalBadge(order: OrderRow) {
  const pending = resolveApprovalPending(order);
  if (!pending.admin && !pending.finance && !pending.account) return null;

  const parts: string[] = [];
  if (pending.admin) parts.push("Admin");
  if (pending.finance) parts.push("Finance");
  if (pending.account) parts.push("Account");

  const title = parts.length > 0 ? `Pending: ${parts.join(", ")}` : "Pending approval";
  const label = pending.stage
    ? `${pendingApprovalStageLabel(pending.stage)} pending`
    : "Pending approval";

  return (
    <span
      className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-inset ring-violet-600/10 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-500/25"
      title={title}
    >
      {label}
    </span>
  );
}

export default function ListDispatchOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<DispatchOrderTabCategory>(
    tabFromUrl && isDispatchOrderTabCategory(tabFromUrl) ? tabFromUrl : "pending_transport",
  );
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    if (tabFromUrl && isDispatchOrderTabCategory(tabFromUrl)) {
      setActiveTab(tabFromUrl);
      setCurrentPage(1);
    }
  }, [tabFromUrl]);

  const queryParams = useMemo(() => {
    const base: Record<string, string | undefined> = {};

    if (!searchQuery.trim() && activeTab === "pending_approvals") {
      base.status = "pending_approval";
    }

    if (searchQuery.trim()) {
      base.search = searchQuery.trim();
    }
    return base;
  }, [activeTab, searchQuery]);

  const { data, isLoading, isFetching, isError, refetch } = useListOrdersQuery(queryParams);
  const { data: returnsData } = useListOrderReturnsQuery({});
  const partiesQ = useListPartiesQuery({});
  const usersQ = useListUsersQuery({});

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const orders = useMemo(
    () => pickOrders(data) as OrderRow[],
    [data],
  );

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const partySraById = useMemo(
    () => buildPartySraById(partiesQ.data),
    [partiesQ.data],
  );

  const userNameById = useMemo(
    () => buildUserNameById(usersQ.data),
    [usersQ.data],
  );

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setActiveTab("pending_transport");
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
      if (!searchQuery.trim()) {
        if (!orderMatchesDispatchTab(o, activeTab, categoryOptions)) {
          return false;
        }
      } else {
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

      if (
        !orderMatchesDateFilter(
          o as Record<string, unknown>,
          dateFilter,
          customDateFrom,
          customDateTo,
        )
      ) {
        return false;
      }

      return true;
    });
  }, [
    orders,
    searchQuery,
    activeTab,
    priorityFilter,
    partyNameById,
    categoryOptions,
    dateFilter,
    customDateFrom,
    customDateTo,
  ]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  const startEntry = filteredOrders.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filteredOrders.length);

  const showReset =
    !!searchQuery ||
    activeTab !== "pending_transport" ||
    priorityFilter !== "all" ||
    dateFilter !== "all";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden font-sans">
      <PortalBusyOverlay active={isLoading} message="Loading orders…" />

      {/* Compact Control Strip */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-amber-500/10 bg-gradient-to-r from-amber-600/5 to-orange-600/10 px-4 py-2.5 shadow-sm dark:from-amber-500/5 dark:to-orange-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Dispatch Orders Operations
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
              title="Reload orders list"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/dispatch"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3 w-3" />
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      {partiesQ.isError && (
        <div className="shrink-0 rounded-lg border border-amber-200/50 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-955/20 dark:text-amber-450">
          ⚠️ Party directory failed to load — names may show as shortened IDs.
        </div>
      )}

      <OrderListSearchDatePanel
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        dateFilter={dateFilter}
        onDateFilterChange={handleDateFilterChange}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        onCustomDateFromChange={handleCustomDateFromChange}
        onCustomDateToChange={handleCustomDateToChange}
        searchFocusClass="focus:border-amber-600 focus:ring-amber-500/25 dark:focus:border-amber-500"
        compact
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="px-4 py-16 text-center">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load orders
            </h3>
            <p className="mt-1 text-xs text-slate-505">
              Please check your database connection and try again.
            </p>
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
            <p className="mx-auto mt-1.5 max-w-xs text-xs text-slate-500">
              {orders.length === 0
                ? "No orders exist in the database system."
                : "No orders match your search and filter parameters."}
            </p>
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

                const partyLabel = resolveOrderCounterparty(
                  o as Record<string, unknown>,
                  partyNameById,
                );

                const orderDateStr = formatDateShort(
                  (o as any).order_date ?? (o as any).created_at ?? (o as any).createdAt,
                );
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
                    className="relative flex cursor-pointer flex-col gap-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 pl-5 transition-all duration-300 animate-fadeIn hover:border-amber-500/20 hover:shadow-md dark:border-white/10 dark:bg-slate-900"
                  >
                    <div className={`absolute bottom-0 left-0 top-0 w-1.5 ${stripeColor}`} />

                    <div className="flex w-full flex-col justify-between gap-4 border-b border-slate-100/60 pb-3 dark:border-white/5 lg:flex-row lg:items-center">
                      <div className="flex items-center justify-between lg:w-[420px] lg:shrink-0 lg:justify-start lg:gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-50">
                            {ref}
                          </span>
                          {renderPriorityBadge(pri)}
                          {activeTab === "pending_approvals"
                            ? renderPendingApprovalBadge(o)
                            : renderWorkflowStatusBadge(
                                getDispatchOrderTabCategory(o, categoryOptions),
                              )}
                          <OrderFlagBadge orderId={o._id || o.id} department="dispatch" />
                        </div>
                      </div>

                      <span
                        className="flex items-center gap-1.5 break-words text-xs font-semibold text-slate-800 dark:text-slate-200 lg:flex-1"
                        title={partyLabel}
                      >
                        <span>{partyLabel}</span>
                        {checkOrderPartySra(o as Record<string, unknown>, partySraById) && (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400">
                            SRA
                          </span>
                        )}
                      </span>

                      <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500 dark:text-slate-400 sm:flex sm:items-center sm:gap-8 lg:w-[280px] lg:shrink-0">
                        <div className="flex min-w-[90px] flex-col">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Grand Total
                          </span>
                          <span className="mt-0.5 text-xs font-bold tabular-nums text-slate-900 dark:text-slate-50">
                            ₹{formatMoney(Number.isFinite(total) ? total : 0)}
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

                    <div className="flex flex-col gap-1 rounded-lg border border-slate-100/50 bg-slate-50/30 px-2 py-1.5 dark:border-white/5 dark:bg-slate-955/5 sm:flex-row sm:items-center sm:justify-between">
                      <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Pipeline
                      </span>
                      <div className="min-w-0 overflow-x-auto">
                        <OrderFulfillmentPipelineStrip
                          steps={buildListOrderFulfillmentPipeline(o as Record<string, unknown>)}
                          size="xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <OrderListBottomTabStrip
        tabs={DISPATCH_ORDER_TABS}
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setActiveTab(tabId as DispatchOrderTabCategory);
          setCurrentPage(1);
        }}
        filteredCount={filteredOrders.length}
        isFetching={isFetching}
        searchQuery={searchQuery}
        onClearSearch={() => handleSearchChange("")}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={handlePriorityFilterChange}
        showReset={showReset}
        onReset={handleResetFilters}
        accentActiveClass="border-amber-600 text-amber-600 dark:border-amber-500 dark:text-amber-400"
        searchResultAccentClass="text-amber-600 dark:text-amber-400"
        countBadgeClass="bg-amber-600"
        compact
      />
    </div>
  );
}

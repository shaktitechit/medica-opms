"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmDeleteDraftModal } from "@/components/portal/sales/components/modals/ConfirmDeleteDraftModal";
import { OrderDetailModal } from "@/components/portal/sales/components/modals/OrderDetailModal";
import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  pickList,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  buildPendingReturnOrderIds,
  getOrderTabCategory,
  isSalesOrderTabCategory,
  pendingApprovalStageLabel,
  resolveApprovalPending,
  SALES_ORDER_TAB_LABELS,
  SALES_ORDER_TABS,
  salesTabQueryParams,
  type SalesOrderTabCategory,
} from "@/components/portal/sales/orderUtils";
import {
  OrderFulfillmentPipelineStrip,
  buildListOrderFulfillmentPipeline,
} from "@/components/portal/shared/FulfillmentCircleStep";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { OrderListSearchDatePanel } from "@/components/portal/shared/orderList/OrderListSearchDatePanel";
import { orderMatchesDateFilter } from "@/components/portal/shared/orderList/orderListDateFilter";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteOrderMutation,
  useListOrderReturnsQuery,
  useListPartiesQuery,
  useListOrdersQuery,
} from "@/store/api";
import {
  RefreshCw,
  LayoutDashboard,
  Plus,
  Trash2,
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
  lifecycle_status?: string;
  workflow_stage?: string;
  current_action?: string;
  party?: unknown;
  customer?: unknown;
  assigned_admin_user?: unknown;
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

function renderWorkflowStatusBadge(status: string) {
  const label =
    SALES_ORDER_TAB_LABELS[status as keyof typeof SALES_ORDER_TAB_LABELS] ??
    status;
  let bgClass =
    "bg-slate-50 text-slate-700 ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10";
  switch (status) {
    case "draft":
      bgClass =
        "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-850 dark:text-slate-300 dark:ring-slate-700";
      break;
    case "approval_pending":
    case "pending_admin_approval":
      bgClass =
        "bg-indigo-50 text-indigo-700 ring-indigo-600/10 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-500/25";
      break;
    case "due_sheet_pending":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "pending_finance_approval":
      bgClass =
        "bg-purple-50 text-purple-700 ring-purple-600/10 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-500/25";
      break;
    case "pending_account_approval":
      bgClass =
        "bg-violet-50 text-violet-700 ring-violet-600/10 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-500/25";
      break;
    case "open_dispatched":
      bgClass =
        "bg-teal-50 text-teal-700 ring-teal-600/10 dark:bg-teal-950/30 dark:text-teal-400 dark:ring-teal-500/25";
      break;
    case "transport_return_pending":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "closed_delivered":
      bgClass =
        "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-500/25";
      break;
    case "on_hold":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "rejected":
      bgClass =
        "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-500/25";
      break;
    case "cancelled":
      bgClass =
        "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-500/25";
      break;
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
      className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-700 ring-1 ring-inset ring-purple-600/10 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-500/25"
      title={title}
    >
      {label}
    </span>
  );
}

export default function ListMyOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SalesOrderTabCategory>(() =>
    tabFromUrl && isSalesOrderTabCategory(tabFromUrl) ? tabFromUrl : "draft",
  );
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (tabFromUrl && isSalesOrderTabCategory(tabFromUrl)) {
      setActiveTab(tabFromUrl);
      setCurrentPage(1);
    }
  }, [tabFromUrl]);

  const queryParams = useMemo(() => {
    const base: Record<string, string | undefined> = {};

    if (!searchQuery.trim()) {
      Object.assign(base, salesTabQueryParams(activeTab));
    }

    if (searchQuery.trim()) {
      base.search = searchQuery.trim();
    }
    return base;
  }, [activeTab, searchQuery]);

  const { data, isLoading, isFetching, isError, refetch } = useListOrdersQuery(queryParams);
  const { data: returnsData } = useListOrderReturnsQuery({});
  const partiesQ = useListPartiesQuery({});

  // Pagination State
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const orders = useMemo(() => pickOrders(data) as OrderRow[], [data]);

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const partySraById = useMemo(
    () => buildPartySraById(partiesQ.data),
    [partiesQ.data],
  );

  const showReset =
    searchQuery.trim() !== "" ||
    activeTab !== "draft" ||
    priorityFilter !== "all" ||
    dateFilter !== "all";

  // Dynamic filter reset
  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setActiveTab("draft");
    setPriorityFilter("all");
    setDateFilter("all");
    setCustomDateFrom("");
    setCustomDateTo("");
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

  const handleTabChange = useCallback((tabId: string) => {
    if (isSalesOrderTabCategory(tabId)) {
      setActiveTab(tabId);
      setCurrentPage(1);
    }
  }, []);
  // Filtered Orders memo
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Filter by active tab only if search is not active (universal search)
      if (!searchQuery.trim()) {
        if (
          activeTab !== "all" &&
          getOrderTabCategory(o, categoryOptions) !== activeTab
        ) {
          return false;
        }
      }

      // 1. Priority filter
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
    activeTab,
    categoryOptions,
    priorityFilter,
    searchQuery,
    dateFilter,
    customDateFrom,
    customDateTo,
  ]);

  // Paginated Orders slice
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredOrders.slice(start, end);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  const startEntry =
    filteredOrders.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filteredOrders.length);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteOrder, { isLoading: isDeletingOrder }] =
    useDeleteOrderMutation();

  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);

  const confirmDeleteDraft = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    try {
      await deleteOrder(id).unwrap();
      toast.success(mutationSuccessCopy("deleteOrder"));
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteOrder, deleteTarget]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Loading orders…" />
      <ConfirmDeleteDraftModal
        orderId={deleteTarget?.id ?? null}
        orderLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeletingOrder}
        onClose={closeDeleteModal}
        onConfirm={confirmDeleteDraft}
      />

      {/* Header */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              My Orders
            </h1>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 max-w-xl">
              Create drafts, review status progressions, and track your active sales orders pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              title="Reload orders list"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/sales"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3 w-3" />
              Dashboard
            </Link>
            <Link
              href="/sales/create-order"
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              New Draft
            </Link>
          </div>
        </div>
      </div>

      {partiesQ.isError && (
        <div className="shrink-0 rounded-lg border border-amber-200/50 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400">
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
      />

      {/* Main table card */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load orders
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check your network status and try again.
            </p>
          </div>
        )}

        {!isLoading && !isError && filteredOrders.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-955 text-slate-400 text-xl border border-slate-100 dark:border-white/5">
              📋
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              No orders found
            </h3>
            <p className="mt-1.5 text-xs text-slate-550 max-w-xs mx-auto">
              {orders.length === 0
                ? "Get started by logging your first sales draft order."
                : "No orders match your search and filter parameters."}
            </p>
            {orders.length === 0 && (
              <Link
                href="/sales/create-order"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] dark:bg-blue-50 dark:hover:bg-blue-400 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                New Draft
              </Link>
            )}
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
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-slate-900/50">
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Order No</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Party</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Order Date</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Expected Delivery</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paginatedOrders.map((o) => {
                    const id = orderKey(o);
                    const ref =
                      typeof o.order_no === "string"
                        ? o.order_no
                        : typeof o.order_number === "string"
                          ? o.order_number
                          : id || "—";
                    
                    const pri = typeof o.priority === "string" ? o.priority : "normal";
                    const statusRaw = deriveOrderWorkflowStatus(o) || "draft";
                    const isDraftRow = statusRaw === "draft";

                    const partyLabel = resolveOrderCounterparty(
                      o as Record<string, unknown>,
                      partyNameById,
                    );

                    const orderDateStr = formatDateShort((o as any).order_date ?? (o as any).created_at ?? (o as any).createdAt);
                    const expectedDeliveryStr = formatDateShort((o as any).expected_delivery_date);

                    return (
                      <tr
                        key={id || ref}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => {
                          if (id) {
                            router.push(`/sales/order/${id}`);
                          }
                        }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-mono font-bold">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (id) setViewOrderId(id);
                            }}
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-bold hover:underline"
                          >
                            {ref}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                            {partyLabel}
                          </span>
                          {checkOrderPartySra(o as Record<string, unknown>, partySraById) && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400">
                              SRA
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400 tabular-nums">
                          {orderDateStr}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400 tabular-nums">
                          {expectedDeliveryStr}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {renderPriorityBadge(pri)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {activeTab === "approval_pending"
                            ? renderPendingApprovalBadge(o)
                            : renderWorkflowStatusBadge(
                                getOrderTabCategory(o, categoryOptions),
                              )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (id) setViewOrderId(id);
                              }}
                              className="rounded border border-slate-200 hover:bg-slate-50 hover:text-slate-900 px-2 py-1 text-slate-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 transition font-semibold"
                            >
                              View
                            </button>
                            {isDraftRow && id && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget({ id, label: ref });
                                }}
                                disabled={isDeletingOrder}
                                className="inline-flex items-center justify-center rounded border border-slate-200 hover:border-rose-350 p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-rose-455 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                title="Delete Draft Order"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <OrderListBottomTabStrip
        tabs={SALES_ORDER_TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        filteredCount={filteredOrders.length}
        isFetching={isFetching}
        searchQuery={searchQuery}
        onClearSearch={() => handleSearchChange("")}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={handlePriorityFilterChange}
        showReset={showReset}
        onReset={handleResetFilters}
      />

      {viewOrderId && (
        <OrderDetailModal
          orderId={viewOrderId}
          partyNameById={partyNameById}
          onClose={() => setViewOrderId(null)}
        />
      )}
    </div>
  );
}

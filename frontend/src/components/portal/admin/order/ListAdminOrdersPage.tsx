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
import { GoogleSheetOrdersModal } from "@/components/portal/shared/GoogleSheetOrdersModal";
import { GoogleSheetAnalyticsModal } from "@/components/portal/shared/GoogleSheetAnalyticsModal";
import { OpenOrdersModal } from "@/components/portal/shared/orderList/OpenOrdersModal";
import { PRIORITY_OPTIONS } from "@/components/portal/shared/orderStatusOptions";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteOrderMutation,
  useListPartiesQuery,
  useListOrdersQuery,
  useListOrderReturnsQuery,
} from "@/store/api";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  LayoutDashboard,
  Plus,
  Trash2,
  FileText,
  TrendingUp,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import {
  OrderFulfillmentPipelineStrip,
  buildListOrderFulfillmentPipeline,
} from "@/components/portal/shared/FulfillmentCircleStep";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { ORDER_PRIORITY_TABS } from "@/components/portal/shared/orderList/orderWorkflowTabs";
import {
  getAdminOrderTabCategory,
  normalizeAdminTabFromUrl,
  orderMatchesAdminTab,
  pendingApprovalStageLabel,
  adminTabQueryParams,
  buildPendingReturnOrderIds,
  ADMIN_ORDER_TABS,
  ADMIN_ORDER_TAB_LABELS,
  type AdminOrderTabCategory,
} from "@/components/portal/admin/adminOrderUtils";
import { resolveApprovalPending } from "@/components/portal/sales/orderUtils";
import { OrderFlagBadge } from "@/components/portal/shared/OrderFlagBadge";
import { OrderDueSheetBadge } from "@/components/portal/shared/OrderDueSheetBadge";

const DATE_FILTER_OPTIONS = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_week", label: "Last 7 Days" },
  { id: "last_month", label: "Last Month" },
  { id: "custom", label: "Custom Range" },
] as const;

const dateFilterSelectClass =
  "shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none transition focus:border-purple-600 focus:ring-2 focus:ring-purple-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 cursor-pointer";

const dateInputSelectClass =
  "min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none transition focus:border-purple-600 focus:ring-2 focus:ring-purple-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 cursor-pointer";

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
  due_sheet_uploaded?: boolean;
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
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-950/30 dark:text-rose-455/90 dark:ring-rose-500/25">
        Urgent
      </span>
    );
  }
  if (p === "high") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-950/30 dark:text-amber-455/90 dark:ring-amber-500/20">
        High
      </span>
    );
  }
  if (p === "normal") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-950/30 dark:text-blue-455/90 dark:ring-blue-500/20">
        Normal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
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

function renderWorkflowStatusBadge(category: AdminOrderTabCategory) {
  const label = ADMIN_ORDER_TAB_LABELS[category];
  let bgClass =
    "bg-slate-50 text-slate-700 ring-slate-600/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10";
  switch (category) {
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
    case "transport_pending":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "return_pending":
      bgClass =
        "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-500/25";
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ring-1 ring-inset ${bgClass}`}
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
      className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-violet-700 ring-1 ring-inset ring-violet-600/10 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-500/25"
      title={title}
    >
      {label}
    </span>
  );
}

export default function ListAdminOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const viewBy = searchParams.get("by") === "priority" ? "priority" : "workflow";
  const defaultTab: AdminOrderTabCategory =
    viewBy === "priority" ? "all" : "pending_admin_approval";

  const qFromUrl = searchParams.get("q") ?? "";

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState(qFromUrl);
  const [isGoogleSheetOpen, setIsGoogleSheetOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isOpenOrdersOpen, setIsOpenOrdersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminOrderTabCategory>(() =>
    tabFromUrl ? normalizeAdminTabFromUrl(tabFromUrl) : defaultTab,
  );
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(tabFromUrl ? normalizeAdminTabFromUrl(tabFromUrl) : defaultTab);
    setPriorityFilter("all");
    setCurrentPage(1);
  }, [tabFromUrl, defaultTab]);

  useEffect(() => {
    setSearchQuery(qFromUrl);
    if (qFromUrl) setCurrentPage(1);
  }, [qFromUrl]);

  const queryParams = useMemo(() => {
    const base: Record<string, string | undefined> = {};

    if (!searchQuery.trim()) {
      Object.assign(base, adminTabQueryParams(activeTab));
    }

    if (searchQuery.trim()) {
      base.search = searchQuery.trim();
    }
    return base;
  }, [activeTab, searchQuery]);

  const { data, isLoading, isFetching, isError, refetch } = useListOrdersQuery(queryParams);
  const { data: returnsData } = useListOrderReturnsQuery({});
  const partiesQ = useListPartiesQuery({});

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const [itemsPerPage, setItemsPerPage] = useState(10);

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

  // Dynamic filter reset
  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setActiveTab(defaultTab);
    setPriorityFilter("all");
    setDateFilter("all");
    setCustomDateFrom("");
    setCustomDateTo("");
    setCurrentPage(1);
  }, [defaultTab]);

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

  // Filtered Orders memo
  const filteredOrders = useMemo(() => {
    // ── date range helpers ──────────────────────────────────────
    const toDay = (v: unknown): Date | null => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    let dateFrom: Date | null = null;
    let dateTo:   Date | null = null;

    if (dateFilter === "today") {
      dateFrom = startOfDay(now);
      dateTo   = endOfDay(now);
    } else if (dateFilter === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      dateFrom = startOfDay(y);
      dateTo   = endOfDay(y);
    } else if (dateFilter === "last_week") {
      const w = new Date(now); w.setDate(w.getDate() - 7);
      dateFrom = startOfDay(w);
      dateTo   = endOfDay(now);
    } else if (dateFilter === "last_month") {
      const m = new Date(now); m.setMonth(m.getMonth() - 1);
      dateFrom = startOfDay(m);
      dateTo   = endOfDay(now);
    } else if (dateFilter === "custom") {
      if (customDateFrom) dateFrom = startOfDay(new Date(customDateFrom));
      if (customDateTo)   dateTo   = endOfDay(new Date(customDateTo));
    }
    // ────────────────────────────────────────────────────────────

    return orders.filter((o) => {
      if (!searchQuery.trim()) {
        if (!orderMatchesAdminTab(o, activeTab, categoryOptions)) {
          return false;
        }
      }

      if (priorityFilter !== "all") {
        if ((o.priority || "").toLowerCase() !== priorityFilter.toLowerCase()) {
          return false;
        }
      }

      if (dateFrom || dateTo) {
        const raw = (o as any).order_date;
        const d = toDay(raw);
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
      }

      return true;
    });
  }, [orders, activeTab, categoryOptions, priorityFilter, searchQuery, dateFilter, customDateFrom, customDateTo]);

  // Paginated Orders slice
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
    activeTab !== defaultTab ||
    priorityFilter !== "all" ||
    dateFilter !== "all";

  const isPendingTab =
    activeTab === "pending_admin_approval" ||
    activeTab === "due_sheet_pending" ||
    activeTab === "pending_finance_approval" ||
    activeTab === "pending_account_approval";

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteOrder, { isLoading: isDeletingOrder }] = useDeleteOrderMutation();

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

      {/* Compact Control Strip */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-purple-500/10 bg-gradient-to-r from-purple-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-purple-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Admin Orders Control
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpenOrdersOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-100 dark:border-cyan-700/50 dark:bg-cyan-950/40 dark:text-cyan-400 dark:hover:bg-cyan-900/30"
              title="View open orders (past approvals, not fully delivered)"
            >
              <FolderOpen className="h-3 w-3" />
              Open Orders
            </button>
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
            <button
              type="button"
              onClick={() => setIsGoogleSheetOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              title="Open spreadsheet view"
            >
              <FileText className="h-3 w-3 text-purple-600 dark:text-purple-400" />
              Sheet
            </button>
            <button
              type="button"
              onClick={() => setIsAnalyticsOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              title="View analytics"
            >
              <TrendingUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              Analytics
            </button>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3 w-3" />
              Dashboard
            </Link>
            <Link
              href="/admin/create-order"
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Draft Order
            </Link>
          </div>
        </div>
      </div>

      {partiesQ.isError && (
        <div className="shrink-0 rounded-lg border border-amber-200/50 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400">
          ⚠️ Party directory failed to load — names may show as shortened IDs.
        </div>
      )}
      {/* Universal Search + Date Filter Panel */}
      <div className="relative shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-4">
        {/* Mobile / small: search + day/date selects inline */}
        <div className="flex flex-col gap-2 md:hidden">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search order # or party…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-655 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <select
              value={dateFilter}
              onChange={(e) => handleDateFilterChange(e.target.value)}
              className={`${dateFilterSelectClass} max-w-[6.75rem]`}
              aria-label="Order date filter"
            >
              {DATE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {dateFilter === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => { setCustomDateFrom(e.target.value); setCurrentPage(1); }}
                className={`${dateInputSelectClass} flex-1`}
                title="From date"
                aria-label="From date"
              />
              <span className="text-2xs text-slate-400">—</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => { setCustomDateTo(e.target.value); setCurrentPage(1); }}
                className={`${dateInputSelectClass} flex-1`}
                title="To date"
                aria-label="To date"
              />
            </div>
          )}
        </div>

        {/* Desktop: search + order date inline */}
        <div className="hidden md:block">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search universally by order # or party name across all tabs..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-blue-500"
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

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="whitespace-nowrap text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Order Date
              </span>
              <select
                value={dateFilter}
                onChange={(e) => handleDateFilterChange(e.target.value)}
                className={`${dateFilterSelectClass} min-w-[9rem] py-2.5 text-sm`}
                aria-label="Order date filter"
              >
                {DATE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {dateFilter === "custom" && (
                <>
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => { setCustomDateFrom(e.target.value); setCurrentPage(1); }}
                    className={`${dateInputSelectClass} py-2.5 text-sm`}
                    title="From date"
                    aria-label="From date"
                  />
                  <span className="text-xs text-slate-400">—</span>
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => { setCustomDateTo(e.target.value); setCurrentPage(1); }}
                    className={`${dateInputSelectClass} py-2.5 text-sm`}
                    title="To date"
                    aria-label="To date"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Main Grid/Table Card */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load orders
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check your database connection and try again.
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
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              {orders.length === 0
                ? "No orders exist in the database system."
                : "No orders match your search and filter parameters."}
            </p>
          </div>
        )}

        {!isLoading && !isError && filteredOrders.length > 0 && (
          <>
            {/* Pagination Top Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-2.5 border-b border-slate-200/60 dark:border-white/5 bg-slate-50/60 dark:bg-slate-950/15 text-slate-600 dark:text-slate-400 shrink-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs">
                  Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{startEntry}</span> to{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{endEntry}</span> of{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredOrders.length}</span> entries
                </span>
                <span className="text-slate-350 dark:text-slate-700">|</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-slate-500">Rows per page:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded bg-transparent border-none py-0.5 text-xs font-semibold text-slate-750 focus:ring-0 cursor-pointer dark:text-slate-200"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                <button type="button" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors" title="First Page"><ChevronsLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors" title="Previous Page"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-xs font-semibold px-2">Page {currentPage} of {totalPages || 1}</span>
                <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors" title="Next Page"><ChevronRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0} className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors" title="Last Page"><ChevronsRight className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-slate-900/50">
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Order No</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Party</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Grand Total</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Created</th>
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
                    const total = Number(o.grand_total ?? o.total ?? 0);
                    const pri = typeof o.priority === "string" ? o.priority : "normal";

                    const partyLabel = resolveOrderCounterparty(
                      o as Record<string, unknown>,
                      partyNameById,
                    );

                    const statusRaw = deriveOrderWorkflowStatus(o) || "draft";
                    const isDraftRow = statusRaw === "draft";
                    const orderDateStr = formatDateShort((o as any).order_date ?? (o as any).created_at ?? (o as any).createdAt);
                    const expectedDeliveryStr = formatDateShort((o as any).expected_delivery_date);

                    return (
                      <tr
                        key={id || ref}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => {
                          if (id) {
                            router.push(`/admin/order/${id}`);
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
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <OrderDueSheetBadge uploaded={o.due_sheet_uploaded} />
                            <OrderFlagBadge orderId={o._id || o.id} department="admin" />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                            {partyLabel}
                          </span>
                          {checkOrderPartySra(o as Record<string, unknown>, partySraById) && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400">
                              SRA
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                          ₹{formatMoney(Number.isFinite(total) ? total : 0)}
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
                          {isPendingTab
                            ? renderPendingApprovalBadge(o)
                            : renderWorkflowStatusBadge(getAdminOrderTabCategory(o, categoryOptions) ?? "open_dispatched")}
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

      {viewBy === "priority" ? (
        <OrderListBottomTabStrip
          tabs={ORDER_PRIORITY_TABS}
          activeTab={priorityFilter}
          onTabChange={(tabId) => {
            setPriorityFilter(tabId);
            setCurrentPage(1);
          }}
          filteredCount={filteredOrders.length}
          isFetching={isFetching}
          searchQuery={searchQuery}
          onClearSearch={() => handleSearchChange("")}
          priorityFilter={activeTab}
          onPriorityFilterChange={(val) => {
            setActiveTab(val as AdminOrderTabCategory);
            setCurrentPage(1);
          }}
          filterLabel="Workflow"
          filterOptions={ADMIN_ORDER_TABS.map((tab) => ({
            value: tab.id,
            label: tab.label,
          }))}
          showReset={showReset}
          onReset={handleResetFilters}
          compact
        />
      ) : (
        <OrderListBottomTabStrip
          tabs={ADMIN_ORDER_TABS}
          activeTab={activeTab}
          onTabChange={(tabId) => {
            setActiveTab(tabId as AdminOrderTabCategory);
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
          compact
        />
      )}

      <OpenOrdersModal
        isOpen={isOpenOrdersOpen}
        onClose={() => setIsOpenOrdersOpen(false)}
        orders={orders}
        partyNameById={partyNameById}
        portalBasePath="/admin"
        renderStatusBadge={(order) => {
          const cat = getAdminOrderTabCategory(order, categoryOptions);
          return cat ? renderWorkflowStatusBadge(cat) : null;
        }}
      />
      <GoogleSheetOrdersModal
        isOpen={isGoogleSheetOpen}
        onClose={() => setIsGoogleSheetOpen(false)}
        partyNameById={partyNameById}
        initialTab={activeTab}
      />
      <GoogleSheetAnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        partyNameById={partyNameById}
        portal="admin"
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

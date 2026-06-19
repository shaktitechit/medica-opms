"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { PRIORITY_OPTIONS } from "@/components/portal/shared/orderStatusOptions";
import {
  useListPartiesQuery,
  useListOrdersQuery,
  useListUsersQuery,
} from "@/store/api";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import { Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  LayoutDashboard,
  TableProperties } from "lucide-react";
import { GoogleSheetOrdersModal } from "@/components/portal/shared/GoogleSheetOrdersModal";
import {
  OrderFulfillmentPipelineStrip,
  buildListOrderFulfillmentPipeline,
} from "@/components/portal/shared/FulfillmentCircleStep";
import {
  FINANCE_ORDER_TABS,
  getFinanceOrderTabCategory,
  isFinanceOrderTabCategory,
  orderMatchesFinanceTab,
  pendingApprovalStageLabel,
  type FinanceOrderTabCategory,
} from "../financeOrderUtils";
import { resolveApprovalPending } from "@/components/portal/sales/orderUtils";

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
  assigned_finance_user?: unknown;
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
  }  );
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderWorkflowStatusBadge(category: FinanceOrderTabCategory) {
  let label = "";
  let bgClass = "";
  switch (category) {
    case "pending_finance_approval":
      label = "Pending Finance";
      bgClass =
        "bg-purple-50 text-purple-700 ring-purple-600/10 dark:bg-purple-955/30 dark:text-purple-400 dark:ring-purple-500/25";
      break;
    case "pending_approvals":
      label = "Pending Approvals";
      bgClass =
        "bg-violet-50 text-violet-700 ring-violet-600/10 dark:bg-violet-955/30 dark:text-violet-400 dark:ring-violet-500/25";
      break;
    case "open":
      label = "Open";
      bgClass =
        "bg-teal-50 text-teal-700 ring-teal-600/10 dark:bg-teal-955/30 dark:text-teal-400 dark:ring-teal-500/25";
      break;
    case "closed":
      label = "Closed";
      bgClass =
        "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-955/30 dark:text-emerald-400 dark:ring-emerald-500/25";
      break;
    case "on_hold":
      label = "On Hold";
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-955/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "rejected":
      label = "Rejected";
      bgClass =
        "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-955/30 dark:text-red-400 dark:ring-red-500/25";
      break;
    case "cancelled":
      label = "Cancelled";
      bgClass =
        "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-955/30 dark:text-rose-400 dark:ring-rose-500/25";
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
      className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-inset ring-violet-600/10 dark:bg-violet-955/30 dark:text-violet-400 dark:ring-violet-500/25"
      title={title}
    >
      {label}
    </span>
  );
}

export default function ListFinanceOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FinanceOrderTabCategory>(() => {
    if (tabFromUrl === "pending_finance_review") return "pending_finance_approval";
    return tabFromUrl && isFinanceOrderTabCategory(tabFromUrl) ? tabFromUrl : "pending_finance_approval";
  });
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    if (tabFromUrl === "pending_finance_review") {
      setActiveTab("pending_finance_approval");
      setCurrentPage(1);
      return;
    }
    if (tabFromUrl && isFinanceOrderTabCategory(tabFromUrl)) {
      setActiveTab(tabFromUrl);
      setCurrentPage(1);
    }
  }, [tabFromUrl]);

  const queryParams = useMemo(() => {
    const base: Record<string, string | undefined> = {};

    if (!searchQuery.trim()) {
      switch (activeTab) {
        case "pending_finance_approval":
          base.status = "pending_finance_review";
          break;
        case "pending_approvals":
          base.status = "pending_approval";
          break;
        case "on_hold":
          base.status = "on_hold";
          break;
        case "cancelled":
          base.status = "cancelled";
          break;
        case "rejected":
          base.status = "finance_rejected";
          break;
        case "open":
          base.exclude_status = "draft,submitted,on_hold,cancelled,finance_rejected";
          break;
        case "closed":
          base.status = "closed";
          break;
      }
    }

    if (searchQuery.trim()) {
      base.search = searchQuery.trim();
    }
    return base;
  }, [activeTab, searchQuery]);

  const { data, isLoading, isFetching, isError, refetch } = useListOrdersQuery(queryParams);
  const partiesQ = useListPartiesQuery({});
  const usersQ = useListUsersQuery({});

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

  // Dynamic filter reset
  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setActiveTab("pending_finance_approval");
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
      if (!searchQuery.trim()) {
        if (!orderMatchesFinanceTab(o, activeTab)) {
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
    <div className="space-y-6">
      <PortalBusyOverlay active={isLoading} message="Loading orders…" />
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/10 bg-gradient-to-r from-emerald-600/5 to-teal-600/10 p-6 dark:from-emerald-500/5 dark:to-teal-500/5 shadow-sm">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-400 dark:text-slate-50">
              Finance Orders Review
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl font-medium">
              Audit order pricing details, verify customer credit terms, and process pending financial approvals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/30 cursor-pointer"
              title="Open spreadsheet view"
            >
              <TableProperties className="h-3.5 w-3.5" />
              View Sheet
            </button>
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
              href="/finance"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      {partiesQ.isError && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-955/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30">
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
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-blue-500"
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
              Showing <span className="font-bold text-blue-600 dark:text-blue-400">{filteredOrders.length}</span> search results for <span className="italic font-bold text-slate-900 dark:text-slate-100">"{searchQuery}"</span>
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
            {FINANCE_ORDER_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`group border-b-2 py-4 px-1 text-sm font-semibold transition whitespace-nowrap inline-flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  {isActive && !isFetching && (
                    <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 text-[10px] font-bold">
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
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <option value="all">All Priorities</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {(searchQuery || activeTab !== "pending_finance_approval" || priorityFilter !== "all") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-400 pl-1 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid/Table Card */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm overflow-hidden">
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
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-400 text-xl border border-slate-100 dark:border-white/5">
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
                        router.push(`/finance/order/${id}`);
                      }
                    }}
                    className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 transition-all duration-300 hover:shadow-md hover:border-blue-500/20 dark:border-white/10 dark:bg-slate-900 flex flex-col gap-4 pl-5 animate-fadeIn cursor-pointer"
                  >
                    {/* Priority Accent Stripe */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${stripeColor}`} />

                    {/* Top Row: Ref, Badges, Party, Financials & Dates, Actions */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full border-b border-slate-100/60 pb-3 dark:border-white/5">
                      {/* Ref & Badges */}
                      <div className="flex items-center justify-between lg:justify-start lg:gap-2 lg:w-[130px] lg:shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-50">
                            {ref}
                          </span>
                          {renderPriorityBadge(pri)}
                          {activeTab === "pending_finance_approval" || activeTab === "pending_approvals"
                            ? renderPendingApprovalBadge(o)
                            : renderWorkflowStatusBadge(getFinanceOrderTabCategory(o) ?? "open")}
                        </div>
                      </div>

                      {/* Party Title */}
                      <span
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 lg:flex-1 break-words whitespace-normal font-sans"
                        title={partyLabel}
                      >
                        <span>{partyLabel}</span>
                        {checkOrderPartySra(o as Record<string, unknown>, partySraById) && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                            SRA
                          </span>
                        )}
                      </span>

                      {/* Financials & Dates */}
                      <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-8 lg:w-[280px] lg:shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col min-w-[90px]">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Grand Total
                          </span>
                          <span className="mt-0.5 font-bold tabular-nums text-slate-900 dark:text-slate-50 text-xs">
                            ₹{formatMoney(Number.isFinite(total) ? total : 0)}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Created
                          </span>
                          <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                            {orderDateStr}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Expected Delivery
                          </span>
                          <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                            {expectedDeliveryStr}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Pipeline */}
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between bg-slate-50/30 px-2 py-1.5 rounded-lg dark:bg-slate-950/5 border border-slate-100/50 dark:border-white/5">
                      <span className="shrink-0 text-slate-400 dark:text-slate-500 font-bold text-[8px] uppercase tracking-wider">
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

            {/* Pagination Navigation Footer */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/20 text-slate-600 dark:text-slate-400">
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
                    className="rounded bg-transparent border-none py-0.5 text-xs font-semibold text-slate-700 focus:ring-0 cursor-pointer dark:text-slate-200"
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

      <GoogleSheetOrdersModal
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        partyNameById={partyNameById}
        portal="finance"
        initialTab="pending_finance_approval"
      />
    </div>
  );
}

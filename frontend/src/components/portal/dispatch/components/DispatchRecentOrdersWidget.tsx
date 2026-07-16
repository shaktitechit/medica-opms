"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { AlertTriangle,
  UserCheck,
  DollarSign,
  Package,
  Truck,
  ArrowRight,
  Search,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { resolveOrderCounterparty, checkOrderPartySra } from "@/components/portal/sales/partyDisplay";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import { FulfillmentCircleStep } from "@/components/portal/shared/FulfillmentCircleStep";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  DISPATCH_ORDER_TAB_LABELS,
  getDispatchOrderTabCategory,
  type DispatchOrderCategoryOptions,
  type DispatchOrderTabCategory,
} from "../dispatchOrderUtils";

interface DispatchRecentOrdersWidgetProps {
  orders: unknown[];
  isOrdersFetching: boolean;
  isOrdersError: boolean;
  partyNameById: Map<string, string>;
  partySraById?: Map<string, boolean>;
  categoryOptions?: DispatchOrderCategoryOptions;
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function renderWorkflowStatusBadge(category: DispatchOrderTabCategory) {
  const label = DISPATCH_ORDER_TAB_LABELS[category];
  let bgClass =
    "bg-slate-50 text-slate-700 ring-slate-600/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10";

  switch (category) {
    case "pending_admin_approval":
      bgClass =
        "bg-indigo-50 text-indigo-700 ring-indigo-600/10 dark:bg-indigo-955/30 dark:text-indigo-400 dark:ring-indigo-500/25";
      break;
    case "due_sheet_pending":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-955/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "pending_finance_approval":
      bgClass =
        "bg-purple-50 text-purple-700 ring-purple-600/10 dark:bg-purple-955/30 dark:text-purple-400 dark:ring-purple-500/25";
      break;
    case "pending_account_approval":
      bgClass =
        "bg-violet-50 text-violet-700 ring-violet-600/10 dark:bg-violet-955/30 dark:text-violet-400 dark:ring-violet-500/25";
      break;
    case "transport_return_pending":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-955/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "open_dispatched":
      bgClass =
        "bg-teal-50 text-teal-700 ring-teal-600/10 dark:bg-teal-955/30 dark:text-teal-400 dark:ring-teal-500/25";
      break;
    case "closed_delivered":
      bgClass =
        "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-955/30 dark:text-emerald-400 dark:ring-emerald-500/25";
      break;
    case "on_hold":
      bgClass =
        "bg-orange-50 text-orange-700 ring-orange-600/10 dark:bg-orange-955/30 dark:text-orange-400 dark:ring-orange-500/25";
      break;
    case "cancelled":
      bgClass =
        "bg-slate-50 text-slate-700 ring-slate-600/10 dark:bg-slate-955/30 dark:text-slate-400 dark:ring-slate-500/25";
      break;
    case "rejected":
      bgClass =
        "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-955/30 dark:text-red-400 dark:ring-red-500/25";
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

export default function DispatchRecentOrdersWidget({
  orders,
  isOrdersFetching,
  isOrdersError,
  partyNameById,
  partySraById,
  categoryOptions,
}: DispatchRecentOrdersWidgetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        const status = deriveOrderWorkflowStatus(o);
        // Exclude drafts and orders that haven't reached dispatch review stage
        return status !== "draft" && status !== "submitted" && status !== "sales_approved" && status !== "finance_review" && status !== "finance_rejected";
      })
      .filter((o) => {
        const row = o as Record<string, unknown>;
        // 1. Search Query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const id =
            row._id != null ? String(row._id) : row.id != null ? String(row.id) : "";
          const ref = String(row.order_no ?? row.order_number ?? id ?? "").toLowerCase();
          const partyLabel = resolveOrderCounterparty(row, partyNameById).toLowerCase();
          if (!ref.includes(q) && !partyLabel.includes(q)) {
            return false;
          }
        }
        // 2. Priority filter
        if (priorityFilter !== "all") {
          const p = typeof row.priority === "string" ? row.priority.toLowerCase() : "normal";
          if (p !== priorityFilter.toLowerCase()) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const aRow = a as Record<string, unknown>;
        const bRow = b as Record<string, unknown>;
        const aTime = aRow.createdAt ? new Date(String(aRow.createdAt)).getTime() : 0;
        const bTime = bRow.createdAt ? new Date(String(bRow.createdAt)).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [orders, searchQuery, priorityFilter, partyNameById]);

  const hasActiveFilters = searchQuery.trim() !== "" || priorityFilter !== "all";

  const handleResetFilters = () => {
    setSearchQuery("");
    setPriorityFilter("all");
  };

  return (
    <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 font-sans">
      {/* Header and Link */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
            Dispatch Queue Explorer
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
            Track package preparation, transport listings, and shipping handovers
          </p>
        </div>
        <Link
          href="/dispatch/orders"
          className="text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400 self-start sm:self-auto"
        >
          Manage All Cargo
        </Link>
      </div>

      {/* SEARCH AND FILTER TOOLS */}
      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500 pointer-events-none">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Order # or client..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-655 focus:ring-1 focus:ring-amber-500/25 dark:border-white/10 dark:bg-slate-955 dark:text-slate-50 dark:focus:border-amber-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 dark:text-slate-550 dark:hover:text-slate-300 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-655 dark:border-white/10 dark:bg-slate-955 dark:text-slate-100 cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-450 pl-1 cursor-pointer whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ORDERS LIST */}
      <div className="mt-5">
        {isOrdersFetching && (
          <div className="space-y-3 py-6">
            {[...Array(3)].map((_, idx) => (
              <div
                key={idx}
                className="h-20 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        )}

        {isOrdersError && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-xs text-rose-800 dark:bg-rose-955/20 dark:text-rose-450 my-4 border border-rose-200/20">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Could not fetch recent orders. Please check your credentials or network.
          </div>
        )}

        {!isOrdersFetching && !isOrdersError && filteredOrders.length === 0 && (
          <div className="py-10 text-center border border-dashed border-slate-200 dark:border-white/5 rounded-xl">
            <p className="text-xs text-slate-505 dark:text-slate-400 font-medium">
              {hasActiveFilters ? "No matching orders found." : "No orders found in the system."}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"
              >
                Clear Search & Filters
              </button>
            )}
          </div>
        )}

        {!isOrdersFetching && !isOrdersError && filteredOrders.length > 0 && (
          <div className="flex flex-col gap-3.5">
            {filteredOrders.map((o) => {
              const row = o as Record<string, unknown>;
              const id =
                row._id != null ? String(row._id) : row.id != null ? String(row.id) : "";
              const ref = String(row.order_no ?? row.order_number ?? id ?? "—");
              const pri = typeof row.priority === "string" ? row.priority : "normal";
              const grandTotal = Number(row.grand_total ?? row.total ?? 0);

              const deptBoxes = computeDepartmentStageBoxes(row, null);
              const adminBox = deptBoxes.find((b) => b.id === "admin");
              const financeBox = deptBoxes.find((b) => b.id === "finance");
              const dispatchBox = deptBoxes.find((b) => b.id === "dispatch");
              const accountBox = deptBoxes.find((b) => b.id === "account");
  const deliveryBox = deptBoxes.find((b) => b.id === "delivery");

              const adminStatusDim = adminBox?.status;
              const financeStatusDim = financeBox?.status;
              const dispatchStatusDim = dispatchBox?.status;
              const accountStatusDim = accountBox?.status;
  const deliveryStatusDim = deliveryBox?.status;

              const orderItems = Array.isArray(row.order_items) ? row.order_items : [];
              const orderedQty = Math.max(
                1,
                orderItems.reduce((acc: number, item) => {
                  const line = item as { ordered_quantity?: unknown; quantity?: unknown };
                  return acc + (Number(line.ordered_quantity ?? line.quantity) || 0);
                }, 0),
              );

              const partyLabel = resolveOrderCounterparty(row, partyNameById);
              const orderDateStr = formatDateShort(row.order_date ?? row.created_at ?? row.createdAt);
              const expectedDeliveryStr = formatDateShort(row.expected_delivery_date);
              const statusCategory = getDispatchOrderTabCategory(row, categoryOptions);

              let stripeColor = "bg-slate-350 dark:bg-slate-700";
              if (pri === "urgent") stripeColor = "bg-rose-500";
              else if (pri === "high") stripeColor = "bg-amber-500";
              else if (pri === "normal") stripeColor = "bg-blue-500";

              return (
                <Link
                  key={id || ref}
                  href={`/dispatch/order/${id}`}
                  className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 transition-all duration-300 hover:shadow-md hover:border-amber-500/20 dark:border-white/10 dark:bg-slate-900 flex flex-col gap-4 pl-5 cursor-pointer"
                >
                  {/* Priority Accent Stripe */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${stripeColor}`} />

                  {/* Top Row: Ref, Badges, Party, Dates */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full border-b border-slate-100/60 pb-3 dark:border-white/5">
                    {/* Ref & Badges */}
                    <div className="flex items-center gap-2 flex-wrap sm:w-[130px] sm:shrink-0">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-55">
                        {ref.slice(0, 12)}
                      </span>
                      {renderPriorityBadge(pri)}
                      {statusCategory
                        ? renderWorkflowStatusBadge(statusCategory)
                        : null}
                    </div>

                    {/* Party Title */}
                    <span
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 sm:flex-1 break-words whitespace-normal font-sans"
                      title={partyLabel}
                    >
                      <span>{partyLabel}</span>
                      {checkOrderPartySra(row, partySraById) && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                          SRA
                        </span>
                      )}
                    </span>

                    {/* Financials & Dates */}
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-6 sm:w-[260px] sm:shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col min-w-[75px]">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Grand Total
                        </span>
                        <span className="mt-0.5 font-bold tabular-nums text-slate-900 dark:text-slate-50 text-xs">
                          ₹{formatMoney(grandTotal)}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Order Date
                        </span>
                        <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-350">
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/30 p-2.5 rounded-lg dark:bg-slate-955/5 border border-slate-100/50 dark:border-white/5 font-sans">
                    <span className="text-slate-400 dark:text-slate-505 font-bold text-[9px] uppercase tracking-wider">
                      Fulfillment Pipeline
                    </span>
                    <div className="flex items-center gap-4 sm:gap-6">
                      <FulfillmentCircleStep
                        label="Admin"
                        status={adminStatusDim}
                        completed={adminBox?.completedQty}
                        total={orderedQty}
                        icon={UserCheck}
                      />
                      <FulfillmentCircleStep
                        label="Finance"
                        status={financeStatusDim}
                        completed={financeBox?.completedQty}
                        total={orderedQty}
                        icon={DollarSign}
                      />
                      <FulfillmentCircleStep
                        label="Dispatch"
                        status={dispatchStatusDim}
                        completed={dispatchBox?.completedQty}
                        total={orderedQty}
                        icon={Package}
                      />
                      <FulfillmentCircleStep
                        label="Delivery"
                        status={deliveryStatusDim}
                        completed={deliveryBox?.completedQty}
                        total={orderedQty}
                        icon={Truck}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

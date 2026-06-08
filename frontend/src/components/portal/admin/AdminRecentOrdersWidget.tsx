"use client";

import Link from "next/link";
import { AlertTriangle, UserCheck, DollarSign, Package, Truck, ArrowRight } from "lucide-react";
import { resolveOrderCounterparty } from "@/components/portal/sales/partyDisplay";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import { FulfillmentCircleStep } from "@/components/portal/shared/FulfillmentCircleStep";
import { getOrderTabCategory } from "../sales/orderUtils";

interface AdminRecentOrdersWidgetProps {
  recentOrders: any[];
  isOrdersFetching: boolean;
  isOrdersError: boolean;
  partyNameById: Map<string, string>;
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

function renderWorkflowStatusBadge(status: string) {
  let label = "";
  let bgClass = "";
  switch (status) {
    case "draft":
      label = "Draft";
      bgClass = "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-850 dark:text-slate-300 dark:ring-slate-700";
      break;
    case "open":
      label = "Open";
      bgClass = "bg-blue-50 text-blue-700 ring-blue-600/10 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-500/25";
      break;
    case "closed":
      label = "Closed";
      bgClass = "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-955/30 dark:text-emerald-400 dark:ring-emerald-500/25";
      break;
    case "on_hold":
      label = "On Hold";
      bgClass = "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-955/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "rejected":
      label = "Rejected";
      bgClass = "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-955/30 dark:text-red-400 dark:ring-red-500/25";
      break;
    case "cancelled":
      label = "Cancelled";
      bgClass = "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-955/30 dark:text-rose-400 dark:ring-rose-500/25";
      break;
    default:
      label = status;
      bgClass = "bg-slate-50 text-slate-655 ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10";
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset ${bgClass}`}>
      {label}
    </span>
  );
}

export default function AdminRecentOrdersWidget({
  recentOrders,
  isOrdersFetching,
  isOrdersError,
  partyNameById,
}: AdminRecentOrdersWidgetProps) {
  return (
    <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/5">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100">
            Recent System Orders
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Overview of the latest 3 order entries across all portals
          </p>
        </div>
        <Link
          href="/admin/orders"
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          See all
        </Link>
      </div>

      <div className="mt-4">
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
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-xs text-rose-800 dark:bg-rose-955/20 dark:text-rose-450 my-4">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Could not fetch recent orders. Please check your credentials or network.
          </div>
        )}

        {!isOrdersFetching && !isOrdersError && recentOrders.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No orders created yet in the database.
            </p>
            <Link
              href="/admin/create-order"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-955/30 dark:text-blue-400 dark:hover:bg-blue-900/30"
            >
              Create first system order
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {!isOrdersFetching && !isOrdersError && recentOrders.length > 0 && (
          <div className="flex flex-col gap-3.5">
            {recentOrders.map((o) => {
              const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
              const ref = o.order_no || o.order_number || id || "—";
              const pri = typeof o.priority === "string" ? o.priority : "normal";

              const deptBoxes = computeDepartmentStageBoxes(
                o as Record<string, unknown>,
                null
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
              const orderedQty = Math.max(
                1,
                orderItems.reduce((acc: number, item: any) => {
                  return acc + (Number(item.ordered_quantity ?? item.quantity) || 0);
                }, 0)
              );

              const partyLabel = resolveOrderCounterparty(
                o as Record<string, unknown>,
                partyNameById
              );

              const orderDateStr = formatDateShort(o.order_date ?? o.created_at ?? o.createdAt);
              const expectedDeliveryStr = formatDateShort(o.expected_delivery_date);

              let stripeColor = "bg-slate-350 dark:bg-slate-700";
              if (pri === "urgent") stripeColor = "bg-rose-500";
              else if (pri === "high") stripeColor = "bg-amber-500";
              else if (pri === "normal") stripeColor = "bg-blue-500";

              return (
                <Link
                  key={id || ref}
                  href={`/admin/order/${id}`}
                  className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 transition-all duration-300 hover:shadow-md hover:border-blue-500/20 dark:border-white/10 dark:bg-slate-900 flex flex-col gap-4 pl-5 cursor-pointer"
                >
                  {/* Priority Accent Stripe */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${stripeColor}`} />

                  {/* Top Row: Ref, Badges, Party, Dates */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full border-b border-slate-100/60 pb-3 dark:border-white/5">
                    {/* Ref & Badges */}
                    <div className="flex items-center gap-2 flex-wrap sm:w-[130px] sm:shrink-0">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-550 dark:text-slate-50">
                        {ref.slice(0, 12)}
                      </span>
                      {renderPriorityBadge(pri)}
                      {renderWorkflowStatusBadge(getOrderTabCategory(o))}
                    </div>

                    {/* Party Title */}
                    <span
                      className="text-xs font-semibold text-slate-800 dark:text-slate-200 sm:flex-1 break-words whitespace-normal font-sans"
                      title={partyLabel}
                    >
                      {partyLabel}
                    </span>

                    {/* Dates */}
                    <div className="grid grid-cols-2 sm:flex sm:items-center sm:gap-6 sm:w-[180px] sm:shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
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
                        <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-350">
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

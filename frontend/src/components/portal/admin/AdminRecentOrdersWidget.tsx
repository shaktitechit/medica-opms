"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { resolveOrderCounterparty, checkOrderPartySra } from "@/components/portal/sales/partyDisplay";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { getAdminOrderTabCategory, ADMIN_ORDER_TAB_LABELS } from "./adminOrderUtils";

interface AdminRecentOrdersWidgetProps {
  recentOrders: unknown[];
  isOrdersFetching: boolean;
  isOrdersError: boolean;
  partyNameById: Map<string, string>;
  partySraById?: Map<string, boolean>;
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
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-955/30 dark:text-rose-455/90 dark:ring-rose-500/25">
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
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-955/30 dark:text-blue-455/90 dark:ring-blue-500/20">
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

function renderWorkflowStatusBadge(category: string) {
  const label = ADMIN_ORDER_TAB_LABELS[category as keyof typeof ADMIN_ORDER_TAB_LABELS] ?? category;
  let bgClass =
    "bg-slate-50 text-slate-700 ring-slate-600/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10";
  switch (category) {
    case "draft":
      bgClass =
        "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-850 dark:text-slate-300 dark:ring-slate-700";
      break;
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
    case "open_dispatched":
      bgClass =
        "bg-teal-50 text-teal-700 ring-teal-600/10 dark:bg-teal-950/30 dark:text-teal-400 dark:ring-teal-500/25";
      break;
    case "transport_pending":
      bgClass =
        "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-955/30 dark:text-amber-400 dark:ring-amber-500/25";
      break;
    case "return_pending":
      bgClass =
        "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-955/30 dark:text-rose-400 dark:ring-rose-500/25";
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ring-1 ring-inset ${bgClass}`}
    >
      {label}
    </span>
  );
}

function adminStatusLabel(order: unknown): string {
  const cat = getAdminOrderTabCategory(order);
  if (cat) return cat;
  if (deriveOrderWorkflowStatus(order) === "draft") return "draft";
  return "open_dispatched";
}

export default function AdminRecentOrdersWidget({
  recentOrders,
  isOrdersFetching,
  isOrdersError,
  partyNameById,
  partySraById,
}: AdminRecentOrdersWidgetProps) {
  const router = useRouter();

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
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-xs text-rose-800 dark:bg-rose-955/20 dark:text-rose-455 my-4">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-slate-900/50">
                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Order No</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Party</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Expected Delivery</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {recentOrders.map((o) => {
                  const row = o as Record<string, unknown>;
                  const id = row._id != null ? String(row._id) : row.id != null ? String(row.id) : "";
                  const ref =
                    (typeof row.order_no === "string" && row.order_no) ||
                    (typeof row.order_number === "string" && row.order_number) ||
                    id ||
                    "—";
                  const pri = typeof row.priority === "string" ? row.priority : "normal";

                  const partyLabel = resolveOrderCounterparty(row, partyNameById);
                  const expectedDeliveryStr = formatDateShort(row.expected_delivery_date);

                  return (
                    <tr
                      key={id || ref}
                      onClick={() => {
                        if (id) {
                          router.push(`/admin/order/${id}`);
                        }
                      }}
                      className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-blue-600 hover:underline dark:text-blue-400">
                        {ref.slice(0, 12)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                          {partyLabel}
                        </span>
                        {checkOrderPartySra(row, partySraById) && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400">
                            SRA
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400 tabular-nums">
                        {expectedDeliveryStr}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderPriorityBadge(pri)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderWorkflowStatusBadge(adminStatusLabel(o))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

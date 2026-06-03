"use client";

import { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import { useListOrderFinanceApprovalsQuery } from "@/store/api";

type FinanceApprovalsTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
};

function pickList(raw: unknown): Record<string, any>[] {
  if (Array.isArray(raw)) return raw as Record<string, any>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, any>[];
    if (Array.isArray(o.data)) return o.data as Record<string, any>[];
  }
  return [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function statusBadgeClass(status: string): string {
  if (status === "rejected") {
    return "bg-rose-550/10 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-950/30 dark:text-rose-355 dark:ring-rose-500/30";
  }
  if (status === "pending_review" || status === "pending") {
    return "bg-amber-500/10 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/30";
  }
  if (status === "fully_approved" || status === "approved") {
    return "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/30";
  }
  if (status === "partially_approved") {
    return "bg-sky-500/10 text-sky-700 ring-1 ring-sky-600/20 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-500/30";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10";
}

function formatStatus(status: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function FinanceApprovalsTab({ orderId, detail }: FinanceApprovalsTabProps) {
  const approvalsQ = useListOrderFinanceApprovalsQuery({ order: orderId });

  const approvals = useMemo(() => {
    return pickList(approvalsQ.data);
  }, [approvalsQ.data]);

  // Aggregate items and their allocations
  const allocationSummary = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items.map((item: any) => {
      const orderedQty = Number(item.ordered_quantity ?? item.quantity ?? 0);
      const approvedQty = Number(item.approved_quantity ?? 0);
      const remainingQty = Math.max(0, orderedQty - approvedQty);
      const progressPercent = orderedQty > 0 ? Math.min(100, Math.round((approvedQty / orderedQty) * 100)) : 0;
      const unitPrice = Number(item.unit_price ?? 0);
      
      return {
        id: String(item._id ?? item.id ?? ""),
        productName: String(item.product_name ?? ""),
        sku: String(item.sku ?? ""),
        rateType: String(item.applied_rate_type ?? "—"),
        unitPrice,
        orderedQty,
        approvedQty,
        remainingQty,
        progressPercent,
      };
    });
  }, [detail]);

  return (
    <div className="space-y-6">
      {/* Allocations Summary Card */}
      <DashboardCard
        title="Itemwise Allocation Details"
        description="Monitor how ordered quantities correspond with releases authorized by Finance."
      >
        {!allocationSummary.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No items available in this order.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
            <table className="w-full min-w-[800px] text-left text-xs font-sans">
              <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400 font-semibold border-b border-slate-200/90 dark:border-white/10">
                <tr>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">Rate Type</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Ordered Qty</th>
                  <th className="px-4 py-3 text-right">Approved Qty</th>
                  <th className="px-4 py-3 text-right">Remaining Qty</th>
                  <th className="px-4 py-3">Approval Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 bg-white dark:divide-white/10 dark:bg-slate-900">
                {allocationSummary.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/40 transition dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <span className="font-semibold block text-slate-900 dark:text-slate-100">{item.productName}</span>
                      {item.sku && <span className="text-[10px] text-slate-400">SKU: {item.sku}</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-350">{item.rateType}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-700 dark:text-slate-350">{item.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-350">{item.orderedQty}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-450">{item.approvedQty}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-500">{item.remainingQty}</td>
                    <td className="px-4 py-3 min-w-[150px]">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              item.progressPercent === 100 
                                ? "bg-emerald-500" 
                                : item.progressPercent > 0 
                                ? "bg-blue-500" 
                                : "bg-slate-300 dark:bg-slate-600"
                            }`}
                            style={{ width: `${item.progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                          {item.progressPercent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>

      {/* Finance Approvals Audit Trail */}
      <DashboardCard
        title="Finance Approvals Audit Trail"
        description="Audit records, item allocations, credit reviews, risk profiling, and decision logs."
      >
        {approvalsQ.isLoading ? (
          <p className="text-xs text-slate-500 font-sans">Loading approvals...</p>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-200">No finance approvals</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Finance approvals will appear here once submitted and reviewed by the Finance department.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((app) => (
              <div
                key={app._id}
                className="rounded-xl border border-slate-200/90 bg-slate-50/10 p-4 shadow-sm transition dark:border-white/10 dark:bg-slate-950/20 hover:border-slate-300 dark:hover:border-white/20"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {app.approval_no}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-[10px] text-slate-500 font-sans">
                      Rev #{app.revision_number}
                    </span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide ${statusBadgeClass(app.approval_status)}`}>
                    {formatStatus(app.approval_status)}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4 font-sans">
                  <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5 shadow-2xs">
                    <span className="block text-slate-400 text-[10px] uppercase font-semibold">Credit Checked</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {app.credit_limit_checked ? "✅ Yes" : "❌ No"}
                    </span>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5 shadow-2xs">
                    <span className="block text-slate-400 text-[10px] uppercase font-semibold">Outstanding Checked</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {app.outstanding_checked ? "✅ Yes" : "❌ No"}
                    </span>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5 shadow-2xs">
                    <span className="block text-slate-400 text-[10px] uppercase font-semibold">Risk Level</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">
                      {app.risk_level}
                    </span>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5 shadow-2xs">
                    <span className="block text-slate-400 text-[10px] uppercase font-semibold">Approved Total</span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {Number(app.approved_total_amount ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Itemised Breakdown inside the approval block */}
                {app.approval_items && app.approval_items.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100 dark:border-white/5 text-[10px] font-sans">
                    <table className="w-full text-left bg-white/40 dark:bg-slate-900/30">
                      <thead>
                        <tr className="bg-slate-100/50 dark:bg-slate-950/40 text-slate-500 font-semibold border-b border-slate-100 dark:border-white/5">
                          <th className="px-3 py-1.5">Item</th>
                          <th className="px-3 py-1.5 text-right">Ordered</th>
                          <th className="px-3 py-1.5 text-right">Approved</th>
                          <th className="px-3 py-1.5">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {app.approval_items.map((it: any) => (
                          <tr key={it._id || it.order_item_id} className="hover:bg-slate-50/40 transition dark:hover:bg-white/5">
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-200">
                              {it.product?.product_name || "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">
                              {it.ordered_quantity} @ {Number(it.ordered_unit_price ?? it.product?.unit_price ?? 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-150">
                              {it.approved_quantity} @ {Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-slate-500 italic truncate max-w-[200px]" title={it.remarks || it.rejection_reason || it.hold_reason}>
                              {it.remarks || it.rejection_reason || it.hold_reason || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 text-xs font-sans text-slate-600 dark:text-slate-355">
                  {app.approval_notes && (
                    <p className="bg-white p-2.5 rounded-lg border border-slate-100 dark:bg-slate-900 dark:border-white/5 shadow-2xs">
                      <span className="font-semibold text-slate-500 mr-1.5">Audit Notes:</span>
                      {app.approval_notes}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5 text-[10px] text-slate-400">
                  <span>Reviewed on {formatDate(app.reviewed_at || app.updatedAt || app.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

export default FinanceApprovalsTab;

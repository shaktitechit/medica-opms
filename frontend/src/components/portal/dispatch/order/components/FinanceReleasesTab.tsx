"use client";

import { DashboardCard } from "@/components/widgets";

interface FinanceReleasesTabProps {
  approvals: any[];
  isLoading: boolean;
  canCreateDispatch: boolean;
  busy: boolean;
  openDispatchModal: (app: Record<string, unknown>) => void;
  formatDate: (date: any) => string;
  isReleaseFullyDispatched: (app: Record<string, unknown>) => boolean;
  releaseHasDispatches: (app: Record<string, unknown>) => boolean;
}

function isApprovedFinanceRelease(app: Record<string, unknown>): boolean {
  const s = String(app.approval_status || "").toLowerCase();
  return (
    s === "fully_approved" || s === "partially_approved" || s === "approved"
  );
}

export function FinanceReleasesTab({
  approvals,
  isLoading,
  canCreateDispatch,
  busy,
  openDispatchModal,
  formatDate,
  isReleaseFullyDispatched,
  releaseHasDispatches,
}: FinanceReleasesTabProps) {
  return (
    <DashboardCard
      title="Finance Release History"
      description="Audit records and approved item allocations from the finance department."
    >
      {isLoading ? (
        <p className="text-xs text-slate-500 font-sans">Loading release history...</p>
      ) : approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h3 className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-200 font-sans">No finance releases</h3>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-sans">No releases have been recorded for this order yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((app: any) => (
            <div
              key={app._id}
              className="rounded-xl border border-slate-200/90 bg-slate-50/20 p-4 shadow-sm transition dark:border-white/10 dark:bg-slate-955/20 hover:border-slate-300 dark:hover:border-white/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5 dark:border-white/5 font-sans">
                <div>
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {app.approval_no}
                  </span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="text-[10px] text-slate-500">
                    Rev #{app.revision_number}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {isApprovedFinanceRelease(app as Record<string, unknown>) &&
                    canCreateDispatch ? (
                     isReleaseFullyDispatched(app as Record<string, unknown>) ? (
                       <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 ring-1 ring-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold">
                         Dispatch completed
                       </span>
                     ) : (
                       <button
                         type="button"
                         disabled={busy}
                         onClick={() =>
                           openDispatchModal(app as Record<string, unknown>)
                         }
                         className="rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 text-xs font-semibold text-white transition cursor-pointer"
                       >
                         {releaseHasDispatches(app as Record<string, unknown>)
                           ? "Continue Dispatch"
                           : "Create Dispatch"}
                       </button>
                     )
                   ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-3 text-[11px] sm:grid-cols-3 font-sans">
                <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                  <span className="block text-slate-400 text-[9px] uppercase font-semibold">Credit Limit Checked</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {app.credit_limit_checked ? "✅ Yes" : "❌ No"}
                  </span>
                </div>
                <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                  <span className="block text-slate-400 text-[9px] uppercase font-semibold">Outstanding Checked</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {app.outstanding_checked ? "✅ Yes" : "❌ No"}
                  </span>
                </div>
                <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                  <span className="block text-slate-400 text-[9px] uppercase font-semibold">Approved Total</span>
                  <span className="font-mono font-semibold text-emerald-650 dark:text-emerald-400">
                    {app.approved_total_amount ? Number(app.approved_total_amount).toFixed(2) : "0.00"}
                  </span>
                </div>
              </div>

              {app.approval_items && app.approval_items.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded border border-slate-100 dark:border-white/5 text-[10px] font-sans">
                  <table className="w-full text-left bg-white/40 dark:bg-slate-900/30">
                    <thead>
                      <tr className="bg-slate-100/50 dark:bg-slate-950/40 text-slate-500 font-semibold border-b border-slate-100 dark:border-white/5">
                        <th className="px-2 py-1">Item</th>
                        <th className="px-2 py-1 text-right">Ordered</th>
                        <th className="px-2 py-1 text-right">Approved</th>
                        <th className="px-2 py-1">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {app.approval_items.map((it: any) => (
                        <tr key={it._id || it.order_item_id}>
                          <td className="px-2 py-1.5 font-medium">{it.product?.product_name || "—"}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{it.ordered_quantity}</td>
                          <td className="px-2 py-1.5 text-right font-medium text-slate-700 dark:text-slate-300">
                            {it.approved_quantity}
                          </td>
                          <td className="px-2 py-1.5 text-slate-500 italic truncate max-w-[150px]" title={it.remarks || it.rejection_reason || it.hold_reason}>
                            {it.remarks || it.rejection_reason || it.hold_reason || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3 text-xs font-sans text-slate-600 dark:text-slate-300">
                {app.approval_notes && (
                  <p className="bg-white p-2 rounded-lg border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                    <span className="font-semibold text-slate-500 mr-1">Audit Notes:</span>
                    {app.approval_notes}
                  </p>
                )}
              </div>

              <div className="mt-2 text-[10px] text-slate-500 text-right">
                Reviewed on {formatDate(app.reviewed_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

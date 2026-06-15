"use client";

import { useMemo } from "react";
import { CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { useListOrderApprovalsQuery, useListUsersQuery } from "@/store/api";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";
import { DashboardCard } from "@/components/widgets";

type ApprovalTabProps = {
  orderId: string;
  detail: Record<string, unknown> | null;
};

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function formatStatus(status: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function lineApprovalBadgeClass(status: string): string {
  if (status === "rejected") return "text-rose-600 dark:text-rose-400";
  if (status === "partially_approved") return "text-sky-600 dark:text-sky-400";
  if (status === "fully_approved") return "text-emerald-600 dark:text-emerald-400";
  return "text-slate-500 dark:text-slate-400";
}

export function ApprovalTab({ orderId, detail }: ApprovalTabProps) {
  const approvalsQ = useListOrderApprovalsQuery({ order: orderId }, { skip: !orderId });
  const usersQ = useListUsersQuery({});

  const approvals = useMemo(() => {
    const rows = pickList(approvalsQ.data);
    return [...rows].sort(
      (a, b) => Number(b.revision_number ?? 0) - Number(a.revision_number ?? 0)
    );
  }, [approvalsQ.data]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of pickList(usersQ.data)) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.name || u.username || id);
    }
    return map;
  }, [usersQ.data]);

  return (
    <div className="space-y-4">
      <DashboardCard
        title="Order Approval History"
        description="View administrative, financial, and account sign-offs for this order."
      >
        {approvalsQ.isLoading ? (
          <div className="flex items-center gap-2 text-xs font-sans text-slate-500 py-6">
            <svg className="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Loading approval history…</span>
          </div>
        ) : approvalsQ.isError ? (
          <p className="text-xs font-sans text-rose-600 dark:text-rose-400 py-6">
            Could not load approvals for this order. Please refresh the page or try again.
          </p>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700" />
            <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-200">
              No approval revisions found
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
              Approval revisions will appear here once the order is reviewed and signed off by the Admin department.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {approvals.map((app) => {
              const appNo = String(app.approval_no ?? "—");
              const revisionNumber = String(app.revision_number ?? 1);
              
              // Resolve reviewer details
              const approvedByLabel = resolveUserDisplay(app.approved_by, userNameById);
              const approvedAtLabel = formatDate(app.approved_at);
              
              const financeApprovedByLabel = resolveUserDisplay(app.finance_approved_by, userNameById);
              const financeApprovedAtLabel = formatDate(app.finance_approved_at);
              
              const accountApprovedByLabel = resolveUserDisplay(app.account_approved_by, userNameById);
              const accountApprovedAtLabel = formatDate(app.account_approved_at);

              const items = Array.isArray(app.approval_items) ? (app.approval_items as Record<string, unknown>[]) : [];

              return (
                <div
                  key={String(app._id ?? app.id)}
                  className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/40"
                >
                  {/* Revision Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                        {appNo}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="font-sans text-[10px] text-slate-500 font-semibold">
                        Revision #{revisionNumber}
                      </span>
                    </div>
                  </div>

                  {/* Department Sign-Off Badges & Metadata */}
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {app.is_admin_approved ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Admin Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/20">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Admin Review Pending
                          </span>
                        )}

                        {app.is_finance_approved ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Finance Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10">
                            Finance Pending
                          </span>
                        )}

                        {app.is_account_approved ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Account Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10">
                            Account Pending
                          </span>
                        )}
                      </div>

                      <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <p>
                          <b>Admin:</b>{" "}
                          {app.is_admin_approved ? (
                            <>
                              Approved by <span className="font-medium text-slate-700 dark:text-slate-200">{approvedByLabel}</span>
                              {approvedAtLabel !== "—" ? <span className="tabular-nums"> at {approvedAtLabel}</span> : null}
                            </>
                          ) : (
                            "Pending sign-off"
                          )}
                        </p>
                        {Boolean(app.is_finance_approved) && (
                          <p>
                            <b>Finance:</b> Approved by <span className="font-medium text-slate-700 dark:text-slate-200">{financeApprovedByLabel}</span>
                            {financeApprovedAtLabel !== "—" ? <span className="tabular-nums"> at {financeApprovedAtLabel}</span> : null}
                          </p>
                        )}
                        {Boolean(app.is_account_approved) && (
                          <p>
                            <b>Account:</b> Approved by <span className="font-medium text-slate-700 dark:text-slate-200">{accountApprovedByLabel}</span>
                            {accountApprovedAtLabel !== "—" ? <span className="tabular-nums"> at {accountApprovedAtLabel}</span> : null}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Approved Items Table */}
                  {items.length > 0 && (
                    <div className="mt-4 border-t border-slate-200/90 pt-4 dark:border-white/10">
                      <h4 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Approved Items Registry
                      </h4>
                      <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10">
                        <table className="w-full min-w-[700px] text-left font-sans text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-950">
                            <tr>
                              <th className="px-3 py-2 font-medium">Product</th>
                              <th className="px-3 py-2 font-medium">Rate Type</th>
                              <th className="px-3 py-2 font-medium text-right">Batch Qty</th>
                              <th className="px-3 py-2 font-medium text-right">Approve Qty</th>
                              <th className="px-3 py-2 font-medium">Line Status</th>
                              <th className="px-3 py-2 font-medium">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                            {items.map((it) => {
                              const rateType = String(it.applied_rate_type ?? "MANUAL");
                              const rateMapped = Boolean(it.rate_mapped);
                              const qty = Number(it.approved_quantity ?? 0);
                              const freeQty = Number(it.free_quantity ?? 0);
                              const orderedQty = Number(it.ordered_quantity ?? 0);

                              let lineStatus = "pending";
                              if (app.rejected_by || app.rejection_reason || qty <= 0) {
                                lineStatus = "rejected";
                              } else if (qty >= orderedQty) {
                                lineStatus = "fully_approved";
                              } else {
                                lineStatus = "partially_approved";
                              }

                              return (
                                <tr
                                  key={String(it._id ?? it.order_item_id)}
                                  className="bg-white dark:bg-slate-900"
                                >
                                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-200">
                                    {String(
                                      (it.product as Record<string, unknown> | undefined)
                                        ?.product_name ?? "—"
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-sans">
                                    <div className="flex flex-col">
                                      <span className="font-semibold">{rateType}</span>
                                      {rateMapped ? (
                                        <span className="text-[9px] text-emerald-600 font-semibold dark:text-emerald-400 leading-none">
                                          Negotiated
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-slate-400 font-medium dark:text-slate-500 leading-none">
                                          Manual
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                    {orderedQty}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                                    <div className="flex flex-col">
                                      <span className="font-semibold">{qty}</span>
                                      {freeQty > 0 ? (
                                        <span className="text-[9px] text-indigo-600 dark:text-indigo-400 leading-none">
                                          +{freeQty} free
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td
                                    className={`px-3 py-2 font-medium ${lineApprovalBadgeClass(lineStatus)}`}
                                  >
                                    {formatStatus(lineStatus)}
                                  </td>
                                  <td
                                    className="max-w-[180px] truncate px-3 py-2 italic text-slate-500 dark:text-slate-450"
                                    title={String(it.remarks ?? it.rejection_reason ?? "")}
                                  >
                                    {String(it.remarks ?? it.rejection_reason ?? "—")}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Revision Notes */}
                  {app.approval_notes ? (
                    <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 font-sans text-xs text-slate-655 dark:border-white/5 dark:bg-slate-950/30 dark:text-slate-300">
                      <span className="mr-1.5 font-semibold text-slate-500">
                        Approval Notes:
                      </span>
                      {String(app.approval_notes)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

export default ApprovalTab;

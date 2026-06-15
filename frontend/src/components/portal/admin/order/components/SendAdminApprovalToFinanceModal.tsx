"use client";

import { useMemo } from "react";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";

type SendAdminApprovalToFinanceModalProps = {
  open: boolean;
  approval: Record<string, unknown> | null;
  userNameById: Record<string, string>;
  financeUsers: Record<string, unknown>[];
  defaultFinanceAssignee?: string;
  existingFinanceAssignees?: string[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    assignedFinanceUser: string;
    remarks: string;
  }) => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function formatStatus(status: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function approvalItems(approval: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];
}

export function SendAdminApprovalToFinanceModal({
  open,
  approval,
  userNameById,
  financeUsers,
  defaultFinanceAssignee = "",
  existingFinanceAssignees = [],
  isSubmitting = false,
  onClose,
  onSubmit,
}: SendAdminApprovalToFinanceModalProps) {
  const items = useMemo(() => (approval ? approvalItems(approval) : []), [approval]);

  const computedTotals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    for (const it of items) {
      if (Number(it.approved_quantity ?? 0) <= 0) continue;
      const qty = Number(it.approved_quantity ?? 0);
      const price = Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0);
      const discountPercent = Number(it.discount_percent ?? 0);
      const discountAmt = Number(it.discount_amount ?? 0);
      const gstPercent = Number(it.gst_percent ?? 0);

      const gross = qty * price;
      const lineDiscount = discountPercent > 0 
        ? (gross * discountPercent) / 100 
        : (Number(it.ordered_quantity ?? 0) > 0 ? (discountAmt * qty) / Number(it.ordered_quantity ?? 0) : 0);
      const taxable = Math.max(0, gross - lineDiscount);
      const lineGst = (taxable * gstPercent) / 100;

      subtotal += taxable;
      gst += lineGst;
    }
    return { subtotal, gst };
  }, [items]);

  if (!open || !approval) return null;

  const approvalNo = String(approval.approval_no ?? "—");
  const revision = String(approval.revision_number ?? 1);
  const approvedByLabel = resolveUserDisplay(approval.approved_by, userNameById);
  const approvedAtLabel = formatDate(approval.approved_at);
  const orderedTotal = Number(approval.ordered_total_amount ?? 0);
  const approvedTotal = Number(approval.approved_total_amount ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Send to Finance
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Review admin approval details and assign a finance operator for this batch.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const assignedFinanceUser = (
              form.elements.namedItem("assigned_finance_user") as HTMLSelectElement
            ).value;
            const remarks = (
              form.elements.namedItem("send_finance_remarks") as HTMLTextAreaElement
            ).value;
            onSubmit({ assignedFinanceUser, remarks });
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {approvalNo}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Revision #{revision} · {formatStatus(String(approval.approval_status ?? ""))}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Sales Approved
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                Approved by{" "}
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {approvedByLabel}
                </span>
                {approvedAtLabel !== "—" ? (
                  <>
                    {" "}
                    · <span className="tabular-nums">{approvedAtLabel}</span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4 font-sans text-xs">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-slate-500 dark:text-slate-400">
                  Batch Ordered
                </span>
                <span className="mt-1 block font-mono text-sm font-semibold text-slate-900 dark:text-slate-50">
                  ₹{orderedTotal.toFixed(2)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-slate-500 dark:text-slate-400">
                  Taxable Subtotal
                </span>
                <span className="mt-1 block font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                  ₹{computedTotals.subtotal.toFixed(2)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-slate-500 dark:text-slate-400">
                  GST Total
                </span>
                <span className="mt-1 block font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                  ₹{computedTotals.gst.toFixed(2)}
                </span>
              </div>
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                <span className="block text-emerald-600 dark:text-emerald-400 font-medium">
                  Net Approved Total
                </span>
                <span className="mt-1 block font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  ₹{approvedTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {items.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Approved Items
                </h4>
                <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10">
                  <table className="w-full min-w-[750px] text-left text-[11px] font-sans">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200/90 dark:border-white/10">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Rate Type</th>
                        <th className="px-3 py-2 text-right">Batch Qty</th>
                        <th className="px-3 py-2 text-right">Approved Qty</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Discount</th>
                        <th className="px-3 py-2 text-right">GST</th>
                        <th className="px-3 py-2 text-right">Net Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900/30">
                      {items.map((it) => {
                        const product = it.product as Record<string, unknown> | undefined;
                        const sku = product?.sku ? String(product.sku) : "";
                        const qty = Number(it.approved_quantity ?? 0);
                        const unitPrice = Number(it.approved_unit_price ?? it.ordered_unit_price ?? 0);
                        const discountPercent = Number(it.discount_percent ?? 0);
                        const discountAmt = Number(it.discount_amount ?? 0);
                        const gstPercent = Number(it.gst_percent ?? 0);
                        const freeQtyVal = Number(it.free_quantity ?? 0);
                        const rateType = String(it.applied_rate_type ?? "MANUAL");
                        const rateMapped = Boolean(it.rate_mapped);

                        const gross = qty * unitPrice;
                        const lineDiscount = discountPercent > 0 
                          ? (gross * discountPercent) / 100 
                          : (Number(it.ordered_quantity ?? 0) > 0 ? (discountAmt * qty) / Number(it.ordered_quantity ?? 0) : 0);
                        const taxable = Math.max(0, gross - lineDiscount);
                        const lineGst = (taxable * gstPercent) / 100;
                        const lineTotal = taxable + lineGst;

                        const scaledFreeQty = Number(it.ordered_quantity ?? 0) > 0 
                          ? Math.floor((freeQtyVal * qty) / Number(it.ordered_quantity ?? 0))
                          : 0;

                        return (
                          <tr key={String(it._id ?? it.order_item_id)} className="hover:bg-slate-50/20 dark:hover:bg-white/5">
                            <td className="px-3 py-2">
                              <span className="font-semibold block text-slate-900 dark:text-slate-100">
                                {String(product?.product_name ?? "—")}
                              </span>
                              {sku && <span className="text-[10px] text-slate-400">SKU: {sku}</span>}
                            </td>
                            <td className="px-3 py-2">
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
                              {Number(it.ordered_quantity ?? 0)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                              <div className="flex flex-col items-end">
                                <span>{qty}</span>
                                {scaledFreeQty > 0 ? (
                                  <span className="text-[9px] text-indigo-600 dark:text-indigo-400 leading-none">
                                    +{scaledFreeQty} free
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">
                              ₹{unitPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">
                              <div className="flex flex-col items-end">
                                <span>{discountPercent > 0 ? `${discountPercent}%` : "—"}</span>
                                {lineDiscount > 0 ? (
                                  <span className="text-[9px] text-slate-500 leading-none">
                                    (-₹{lineDiscount.toFixed(2)})
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">
                              <div className="flex flex-col items-end">
                                <span>{gstPercent > 0 ? `${gstPercent}%` : "0%"}</span>
                                {lineGst > 0 ? (
                                  <span className="text-[9px] text-slate-500 leading-none">
                                    (+₹{lineGst.toFixed(2)})
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-bold font-mono text-slate-900 dark:text-slate-100 bg-slate-50/10 dark:bg-slate-950/10">
                              ₹{lineTotal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {approval.approval_notes ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-600 dark:border-white/5 dark:bg-slate-950/30 dark:text-slate-300">
                <span className="mr-1.5 font-semibold text-slate-500">Approval notes:</span>
                {String(approval.approval_notes)}
              </p>
            ) : null}

            <div className="space-y-1.5 border-t border-slate-100 pt-4 dark:border-white/5">
              <label className={labelClass} htmlFor="assigned_finance_user">
                Finance operator assignment
              </label>
              {existingFinanceAssignees.length > 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Already assigned on this order:{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {existingFinanceAssignees.join(", ")}
                  </span>
                  . Selecting another operator will add them without removing existing assignees.
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  The selected operator will be added to this order&apos;s finance assignees.
                </p>
              )}
              <select
                id="assigned_finance_user"
                name="assigned_finance_user"
                defaultValue={defaultFinanceAssignee}
                className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50/50 dark:disabled:bg-slate-900/50`}
                disabled={isSubmitting || (Number(approval.revision_number ?? 1) > 1 && !!defaultFinanceAssignee)}
                required
              >
                <option value="">— Select Finance Operator —</option>
                {financeUsers.map((u) => {
                  const id = String(u._id ?? u.id ?? "");
                  return (
                    <option key={id} value={id}>
                      {String(u.name || u.username || id)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="send_finance_remarks">
                Remarks (Optional)
              </label>
              <textarea
                id="send_finance_remarks"
                name="send_finance_remarks"
                rows={3}
                className={inputClass}
                placeholder="Notes for the finance department about this approval batch…"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={btnSecondaryClass}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {isSubmitting ? "Sending…" : "Send to Finance"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SendAdminApprovalToFinanceModal;

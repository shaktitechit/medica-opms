"use client";

import { useMemo, useState } from "react";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  buildSettlementPreviewLines,
  hasPendingReturns,
} from "@/components/portal/shared/returnSettlement";
import { useCloseOrderWithReturnsMutation, useListDispatchesQuery } from "@/store/api";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";

function formatMoney(v: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);
}

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

type CloseAccountOrderModalProps = {
  orderId: string;
  returnRecord: Record<string, unknown>;
  detail: Record<string, unknown> | null;
  allReturns: Record<string, unknown>[];
  onClose: () => void;
  onSuccess?: () => void;
};

export function CloseAccountOrderModal({
  orderId,
  returnRecord,
  detail,
  allReturns,
  onClose,
  onSuccess,
}: CloseAccountOrderModalProps) {
  const [extraCharges, setExtraCharges] = useState("");
  const [penaltyAmount, setPenaltyAmount] = useState("");
  const [damageCharge, setDamageCharge] = useState("");
  const [closureRemarks, setClosureRemarks] = useState("");
  const [closeOrder, { isLoading }] = useCloseOrderWithReturnsMutation();
  const dispatchesQ = useListDispatchesQuery({ order: orderId });

  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const receivedReturns = useMemo(
    () => allReturns.filter((r) => String(r.return_status || "") === "received"),
    [allReturns],
  );

  const dispatches = useMemo(() => pickList(dispatchesQ.data), [dispatchesQ.data]);

  const previewLines = useMemo(
    () => buildSettlementPreviewLines(orderItems, receivedReturns, dispatches),
    [orderItems, receivedReturns, dispatches],
  );

  const totals = useMemo(() => {
    const subtotal = previewLines.reduce((sum, line) => sum + line.taxable, 0);
    const gstAmount = previewLines.reduce((sum, line) => sum + line.gst, 0);
    const headerDiscount = Number(detail?.discount_amount || 0);
    const extra = Math.max(0, Number(extraCharges) || 0);
    const penalty = Math.max(0, Number(penaltyAmount) || 0);
    const damage = Math.max(0, Number(damageCharge) || 0);
    const grandTotal = subtotal + gstAmount - headerDiscount + extra + penalty + damage;
    const totalReturned = previewLines.reduce((sum, line) => sum + line.returnedQty, 0);
    const totalNet = previewLines.reduce((sum, line) => sum + line.netQty, 0);
    const originalGrand = Number(detail?.grand_total || 0);

    return {
      subtotal,
      gstAmount,
      headerDiscount,
      extra,
      penalty,
      damage,
      grandTotal,
      totalReturned,
      totalNet,
      originalGrand,
    };
  }, [previewLines, detail, extraCharges, penaltyAmount, damageCharge]);

  const returnNo = returnRecord.return_no || "Return";
  const orderNo = detail?.order_no ? String(detail.order_no) : orderId;
  const pendingReturns = hasPendingReturns(allReturns);

  const handleSubmit = async () => {
    if (pendingReturns) {
      toast.error("All return records must be received at warehouse before closing.");
      return;
    }
    if (receivedReturns.length === 0) {
      toast.error("No received returns to settle against this order.");
      return;
    }

    try {
      await closeOrder({
        id: orderId,
        body: {
          return_id: String(returnRecord._id ?? returnRecord.id ?? ""),
          extra_charges: totals.extra,
          penalty_amount: totals.penalty,
          damage_charge: totals.damage,
          remarks: closureRemarks.trim() || undefined,
        },
      }).unwrap();
      toast.success("Order settled and closed with adjusted totals.");
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-4xl rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
              Close & Settle Order
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-sans">
              Order <span className="font-mono font-semibold">{orderNo}</span>
              {" · "}
              Triggered from <span className="font-mono font-semibold">{String(returnNo)}</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              All {receivedReturns.length} received return record(s) will be applied. Order lines
              settle to net billable qty (accepted − returned) and totals are recalculated.
            </p>
            {pendingReturns && (
              <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Pending warehouse returns must be received before you can close this order.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 font-sans">
          <div className="overflow-hidden rounded-lg border border-slate-200/70 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200/60 dark:border-white/5">
                <tr>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5 text-center">Accepted</th>
                  <th className="px-3 py-2.5 text-center">Returned</th>
                  <th className="px-3 py-2.5 text-center">Settled Net</th>
                  <th className="px-3 py-2.5 text-right">Unit Price</th>
                  <th className="px-3 py-2.5 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {previewLines.map((line) => (
                  <tr key={line.lineId} className="bg-white dark:bg-slate-900">
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {line.productName}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-400">
                      {line.grossAcceptedQty}
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold text-rose-600 dark:text-rose-400">
                      {line.returnedQty}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold text-emerald-600 dark:text-emerald-400">
                      {line.netQty}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-400">
                      ₹{formatMoney(line.unitPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                      ₹{formatMoney(line.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="extra-charges" className={labelClass}>
                Extra Charges
              </label>
              <input
                id="extra-charges"
                type="number"
                min={0}
                step="0.01"
                value={extraCharges}
                onChange={(e) => setExtraCharges(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="penalty-amount" className={labelClass}>
                Penalty
              </label>
              <input
                id="penalty-amount"
                type="number"
                min={0}
                step="0.01"
                value={penaltyAmount}
                onChange={(e) => setPenaltyAmount(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="damage-charge" className={labelClass}>
                Damage Charge
              </label>
              <input
                id="damage-charge"
                type="number"
                min={0}
                step="0.01"
                value={damageCharge}
                onChange={(e) => setDamageCharge(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="closure-remarks" className={labelClass}>
              Closure Remarks
            </label>
            <textarea
              id="closure-remarks"
              rows={2}
              value={closureRemarks}
              onChange={(e) => setClosureRemarks(e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Optional notes for order closure..."
            />
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-slate-950/30">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Settlement Summary
            </h4>
            <dl className="space-y-1.5 text-sm">
              {totals.originalGrand > 0 && totals.originalGrand !== totals.grandTotal && (
                <div className="flex justify-between text-xs text-slate-500">
                  <dt>Original order total</dt>
                  <dd className="line-through">₹{formatMoney(totals.originalGrand)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal (settled net lines)</dt>
                <dd className="font-medium text-slate-800 dark:text-slate-200">₹{formatMoney(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">GST</dt>
                <dd className="font-medium text-slate-800 dark:text-slate-200">₹{formatMoney(totals.gstAmount)}</dd>
              </div>
              {totals.headerDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Header Discount</dt>
                  <dd className="font-medium text-rose-600">−₹{formatMoney(totals.headerDiscount)}</dd>
                </div>
              )}
              {totals.extra > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Extra Charges</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-200">+₹{formatMoney(totals.extra)}</dd>
                </div>
              )}
              {totals.penalty > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Penalty</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-200">+₹{formatMoney(totals.penalty)}</dd>
                </div>
              )}
              {totals.damage > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Damage Charge</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-200">+₹{formatMoney(totals.damage)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200/80 pt-2 dark:border-white/10">
                <dt className="font-semibold text-slate-800 dark:text-slate-200">Settled Grand Total</dt>
                <dd className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                  ₹{formatMoney(totals.grandTotal)}
                </dd>
              </div>
              <div className="flex justify-between text-xs text-slate-500 pt-1">
                <dt>Total returned units</dt>
                <dd>{totals.totalReturned}</dd>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <dt>Total settled net units</dt>
                <dd>{totals.totalNet}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || pendingReturns || receivedReturns.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {isLoading ? "Settling Order..." : "Confirm & Settle Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

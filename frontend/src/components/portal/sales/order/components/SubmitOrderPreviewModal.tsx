"use client";

import { useMemo } from "react";
import {
  largeModalBackdropClass,
  largeModalPanelClass,
} from "@/components/portal/shared/modalLayout";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";

type SubmitIssue = {
  kind: "submit" | "approval";
  message: string;
} | null;

type SubmitOrderPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  detail: Record<string, unknown>;
  partyLabel: string;
  submitRemarks: string;
  onSubmitRemarksChange: (value: string) => void;
  onSubmit: () => void;
  onRetry?: () => void;
  isSubmitting: boolean;
  submitIssue?: SubmitIssue;
};

function formatDate(v: unknown): string {
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
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function lineCommercials(line: Record<string, unknown>) {
  const qty = Number(line.ordered_quantity ?? line.quantity ?? 0);
  const unitPrice = Number(line.unit_price ?? 0);
  const lineGross = qty * unitPrice;
  let discount = Number(line.discount_amount || 0);
  const discountPercent = Number(line.discount_percent || 0);
  if (discountPercent > 0) discount = (lineGross * discountPercent) / 100;
  const taxable = Math.max(0, lineGross - discount);
  const gst = (taxable * Number(line.gst_percent || 0)) / 100;
  return { qty, unitPrice, discount, taxable, gst, lineTotal: taxable + gst };
}

export default function SubmitOrderPreviewModal({
  isOpen,
  onClose,
  detail,
  partyLabel,
  submitRemarks,
  onSubmitRemarksChange,
  onSubmit,
  onRetry,
  isSubmitting,
  submitIssue = null,
}: SubmitOrderPreviewModalProps) {
  const items = useMemo(() => {
    if (!Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail.order_items]);

  const subtotal = Number(detail.subtotal ?? 0);
  const gstAmount = Number(detail.gst_amount ?? 0);
  const headerDiscount = Number(detail.discount_amount ?? 0);
  const grandTotal = Number(detail.grand_total ?? 0);
  const needsRetry = Boolean(submitIssue);

  if (!isOpen) return null;

  return (
    <LargeModalPortal>
    <div className={largeModalBackdropClass}>
      <div className={largeModalPanelClass}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Review order before submit
            </h3>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Confirm the details below, then submit for admin review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-white/5"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {submitIssue ? (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-semibold">
                {submitIssue.kind === "approval"
                  ? "Order submitted, but approval was not created"
                  : "Submit failed"}
              </p>
              <p className="mt-1 text-xs opacity-90">{submitIssue.message}</p>
              <p className="mt-1.5 text-2xs opacity-80">
                Use Retry to try again without losing this form.
              </p>
            </div>
          ) : null}

          <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-medium text-slate-500">Order No</dt>
              <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                {String(detail.order_no ?? "—")}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Party</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{partyLabel}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Order Date</dt>
              <dd className="mt-0.5 text-slate-900 dark:text-slate-100">{formatDate(detail.order_date)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Expected Delivery</dt>
              <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                {formatDate(detail.expected_delivery_date)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Priority</dt>
              <dd className="mt-0.5 capitalize font-semibold text-slate-900 dark:text-slate-100">
                {typeof detail.priority === "string" ? detail.priority : "normal"}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="font-medium text-slate-500">Order remarks</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                {typeof detail.remarks === "string" && detail.remarks.trim() ? detail.remarks : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-5 overflow-x-auto rounded-lg ring-1 ring-slate-200/90 dark:ring-white/10">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Free</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Type</th>
                  <th className="px-3 py-2 font-medium text-right">Disc.</th>
                  <th className="px-3 py-2 font-medium text-right">GST %</th>
                  <th className="px-3 py-2 font-medium text-right">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      No line items on this order.
                    </td>
                  </tr>
                ) : (
                  items.map((line, idx) => {
                    const { qty, unitPrice, discount, lineTotal } = lineCommercials(line);
                    const name =
                      typeof line.product_name === "string"
                        ? line.product_name
                        : "—";
                    const key = line._id != null ? String(line._id) : `line-${idx}`;
                    return (
                      <tr key={key} className="bg-white dark:bg-slate-900">
                        <td className="max-w-[200px] px-3 py-2">
                          <span className="line-clamp-2 font-semibold text-slate-800 dark:text-slate-200">
                            {name}
                          </span>
                          {typeof line.sku === "string" && line.sku ? (
                            <span className="mt-0.5 block font-mono text-2xs text-slate-500">
                              SKU {line.sku}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{qty}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(line.free_qty ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(unitPrice)}</td>
                        <td className="px-3 py-2 text-right">
                          {typeof line.applied_rate_type === "string" ? line.applied_rate_type : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(discount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(line.gst_percent ?? 0)}%
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatMoney(lineTotal)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {formatMoney(subtotal)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">GST</dt>
                <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {formatMoney(gstAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Header discount</dt>
                <dd className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  −{formatMoney(headerDiscount)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 dark:border-white/10">
                <dt className="font-semibold text-slate-700 dark:text-slate-200">Grand total</dt>
                <dd className="tabular-nums text-base font-bold text-slate-900 dark:text-slate-50">
                  {formatMoney(grandTotal)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Submission remarks (optional)
            </label>
            <textarea
              value={submitRemarks}
              onChange={(e) => onSubmitRemarksChange(e.target.value)}
              rows={3}
              disabled={isSubmitting || submitIssue?.kind === "approval"}
              className="mt-1.5 w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 disabled:opacity-60 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              placeholder="Notes for admin review…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          {needsRetry ? (
            <button
              type="button"
              onClick={() => (onRetry ? onRetry() : onSubmit())}
              disabled={isSubmitting || items.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Retrying…
                </>
              ) : submitIssue?.kind === "approval" ? (
                "Retry create approval"
              ) : (
                "Retry submit"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || items.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Submitting…
                </>
              ) : (
                "Submit order"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
    </LargeModalPortal>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import {
  computeReleaseDispatchedByLine,
  idFromRef,
} from "./accountDispatchAvailability";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useResolvePartialDispatchReleaseMutation } from "@/store/api";

type ResolveAccountDispatchReleaseModalProps = {
  open: boolean;
  onClose: () => void;
  approval: Record<string, unknown> | null;
  dispatches: Record<string, unknown>[];
  orderItems: Record<string, unknown>[];
  releaseNo?: string;
  onResolved?: () => void;
};

const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

type PreviewRow = {
  orderItemId: string;
  productName: string;
  clearedQty: number;
  dispatchedQty: number;
  resolvedQty: number;
  removedQty: number;
};

export function ResolveAccountDispatchReleaseModal({
  open,
  onClose,
  approval,
  dispatches,
  orderItems,
  releaseNo,
  onResolved,
}: ResolveAccountDispatchReleaseModalProps) {
  const [notes, setNotes] = useState("");
  const [resolveRelease, { isLoading }] = useResolvePartialDispatchReleaseMutation();

  const approvalId = approval ? idFromRef(approval._id ?? approval.id) : "";

  const previewRows = useMemo((): PreviewRow[] => {
    if (!approval || !approvalId) return [];

    const dispatchedByLine = computeReleaseDispatchedByLine(dispatches, approvalId);
    const items = Array.isArray(approval.approval_items)
      ? (approval.approval_items as Record<string, unknown>[])
      : [];

    const rows: PreviewRow[] = [];
    for (const item of items) {
      const clearedQty = Number(item.approved_quantity || 0);
      if (clearedQty <= 0) continue;

      const orderItemId = idFromRef(item.order_item_id);
      const dispatchedQty = dispatchedByLine[orderItemId] || 0;
      const remaining = Math.max(0, clearedQty - dispatchedQty);
      if (remaining <= 0) continue;

      const orderLine = orderItems.find(
        (line) => idFromRef(line._id ?? line.id) === orderItemId,
      );
      const productRef = item.product;
      const productName =
        String(orderLine?.product_name ?? "") ||
        (typeof productRef === "object" && productRef
          ? String((productRef as Record<string, unknown>).product_name ?? "—")
          : String(item.product_name ?? "—"));

      rows.push({
        orderItemId,
        productName,
        clearedQty,
        dispatchedQty,
        resolvedQty: dispatchedQty,
        removedQty: remaining,
      });
    }

    return rows;
  }, [approval, approvalId, dispatches, orderItems]);

  const totalRemoved = previewRows.reduce((sum, row) => sum + row.removedQty, 0);

  const handleClose = () => {
    if (isLoading) return;
    setNotes("");
    onClose();
  };

  const handleResolve = async () => {
    if (!approvalId) return;
    try {
      await resolveRelease({
        id: approvalId,
        body: {
          amendment_notes:
            notes.trim() ||
            "Resolved release clearance to match dispatched quantities",
        },
      }).unwrap();
      toast.success(
        "Release resolved — approval, order, and admin clearance updated to dispatched quantities.",
      );
      setNotes("");
      onClose();
      onResolved?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  if (!open || !approval) return null;

  const batchLabel = releaseNo || String(approval.approval_no ?? "—");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Resolve release
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Release {batchLabel} — close remaining undispatched clearance and sync the finance
              approval batch, original order, and admin/sales approval to dispatched quantities.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex gap-3 rounded-lg border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This will amend the finance approval batch and reduce order line quantities to
              match dispatched amounts. Undispatched clearance ({totalRemoved} unit
              {totalRemoved === 1 ? "" : "s"}) will be removed from this release.
            </p>
          </div>

          {previewRows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No remaining clearance to resolve on this release.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200/80 dark:border-white/10">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-center">Cleared</th>
                    <th className="px-3 py-2 text-center">Dispatched</th>
                    <th className="px-3 py-2 text-center">After resolve</th>
                    <th className="px-3 py-2 text-center">Removed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {previewRows.map((row) => (
                    <tr key={row.orderItemId} className="bg-white dark:bg-slate-900">
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                        {row.productName}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.clearedQty}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-blue-600 dark:text-blue-400">
                        {row.dispatchedQty}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                        {row.resolvedQty}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-rose-600 dark:text-rose-400">
                        −{row.removedQty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Resolution notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={isLoading}
              className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              placeholder="Reason for closing remaining clearance…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-white/5 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className={btnSecondaryClass}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleResolve()}
            disabled={isLoading || previewRows.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isLoading ? "Resolving…" : "Confirm resolve"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResolveAccountDispatchReleaseModal;

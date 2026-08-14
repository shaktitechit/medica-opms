"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import {
  buildReleaseSettlePayload,
  idFromRef,
  type AccountResolvePreviewRow,
} from "../accountDispatchAvailability";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import {
  largeModalBackdropClass,
  largeModalPanelClass,
} from "@/components/portal/shared/modalLayout";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useResolvePartialDispatchReleaseMutation,
} from "@/store/api";

type SettleRestOrderModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  approval: Record<string, unknown> | null;
  dispatches: Record<string, unknown>[];
  orderItems: Record<string, unknown>[];
  releaseNo?: string;
  onSettled?: () => void;
  /** Override backdrop classes (e.g. higher z-index above nested wizards). */
  backdropClassName?: string;
};

const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function isKitHeaderRow(row: AccountResolvePreviewRow): boolean {
  return Boolean(row.isKitParent) || row.orderItemId.startsWith("__kit__");
}

function isSettlePayloadRow(row: AccountResolvePreviewRow): boolean {
  return !isKitHeaderRow(row);
}

export function SettleRestOrderModal({
  open,
  onClose,
  orderId,
  approval,
  dispatches,
  orderItems,
  releaseNo,
  onSettled,
  backdropClassName,
}: SettleRestOrderModalProps) {
  const [notes, setNotes] = useState("");
  const [settleRelease, { isLoading }] =
    useResolvePartialDispatchReleaseMutation();

  const approvalId = approval ? idFromRef(approval._id ?? approval.id) : "";

  const settlePayload = useMemo(
    () => buildReleaseSettlePayload(approval, orderItems, dispatches),
    [approval, orderItems, dispatches],
  );

  const {
    settleRows,
    approvalItems: settledApprovalItems,
    settledRestItems: settledRestUnbilledItems,
    unbilledUnits,
    hasSettleWork: canSettle,
  } = settlePayload;

  const totals = useMemo(() => {
    return settleRows.reduce(
      (acc, row) => {
        if (!isSettlePayloadRow(row)) return acc;
        acc.remainingClearance += row.remainingClearance;
        acc.settledReturnsQty += row.settledReturnsQty;
        acc.removedQty += row.removedQty;
        acc.settledQty += row.settledQty;
        acc.clearedQty += row.clearedQty;
        acc.dispatchedQty += row.dispatchedQty;
        return acc;
      },
      {
        remainingClearance: 0,
        settledReturnsQty: 0,
        removedQty: 0,
        settledQty: 0,
        clearedQty: 0,
        dispatchedQty: 0,
      },
    );
  }, [settleRows]);

  const handleClose = () => {
    if (isLoading) return;
    setNotes("");
    onClose();
  };

  const handleSettle = async () => {
    if (!approvalId || !canSettle || !orderId) return;
    try {
      await settleRelease({
        id: approvalId,
        body: {
          amendment_notes:
            notes.trim() ||
            "Settled remaining release clearance to unbilled (match dispatched quantities)",
          approval_items: settledApprovalItems,
          settled_rest_items: settledRestUnbilledItems,
        },
      }).unwrap();

      toast.success(
        unbilledUnits > 0
          ? `Settled & unbilled — approval/order updated; ${unbilledUnits} unit${unbilledUnits === 1 ? "" : "s"} moved to Unbilled Order.`
          : "Settled — approval batch and order quantities updated.",
      );
      setNotes("");
      onClose();
      onSettled?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  if (!open || !approval) return null;

  const batchLabel = releaseNo || String(approval.approval_no ?? "—");
  const hasReturns = settleRows.some(
    (row) => isSettlePayloadRow(row) && row.settledReturnsQty > 0,
  );

  return (
    <LargeModalPortal>
      <div className={backdropClassName || largeModalBackdropClass}>
        <div className={`${largeModalPanelClass} max-w-4xl`}>
          <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Settle & Unbilled Order
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Release {batchLabel} — amends this approval batch and the order to
                net settled quantities, and updates the Unbilled Order with the rest
                {hasReturns ? " (including warehouse returns)" : ""}.
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
                Confirming will amend{" "}
                <span className="font-semibold">both</span> the approval batch
                and the order. Undispatched clearance (
                {totals.remainingClearance} unit
                {totals.remainingClearance === 1 ? "" : "s"})
                {totals.settledReturnsQty > 0
                  ? ` and returned stock (${totals.settledReturnsQty} unit${totals.settledReturnsQty === 1 ? "" : "s"})`
                  : ""}{" "}
                will move to the{" "}
                <span className="font-semibold">Unbilled Order</span>
                {unbilledUnits > 0
                  ? ` (${unbilledUnits} unit${unbilledUnits === 1 ? "" : "s"}; kit buckets settle on the order only)`
                  : ""}
                . Net kept on order:{" "}
                <span className="font-semibold tabular-nums">
                  {totals.settledQty}
                </span>
                .
              </p>
            </div>

            {settleRows.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No remaining quantities to settle on this release.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200/80 dark:border-white/10">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-950">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-center">Cleared</th>
                      <th className="px-3 py-2 text-center">Dispatched</th>
                      {hasReturns ? (
                        <th className="px-3 py-2 text-center text-rose-600 dark:text-rose-400">
                          Returned
                        </th>
                      ) : null}
                      <th className="px-3 py-2 text-center">Remaining</th>
                      <th className="px-3 py-2 text-center text-emerald-700 dark:text-emerald-300">
                        After settle
                      </th>
                      <th className="px-3 py-2 text-center text-indigo-600 dark:text-indigo-400">
                        To unbilled
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {settleRows.map((row) => {
                      const isKitParent = isKitHeaderRow(row);
                      const isBucket = Boolean(row.isKitBucket);
                      return (
                        <tr
                          key={row.orderItemId}
                          className={
                            isBucket
                              ? "bg-slate-50/80 dark:bg-slate-950/60"
                              : isKitParent
                                ? "bg-violet-50/40 dark:bg-violet-950/20"
                                : "bg-white dark:bg-slate-900"
                          }
                        >
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                            <div
                              className={
                                isBucket
                                  ? "ml-3 border-l-2 border-violet-300 pl-2 dark:border-violet-700"
                                  : undefined
                              }
                            >
                              <div>
                                {row.productName}
                                {isKitParent ? (
                                  <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
                                    KIT
                                  </span>
                                ) : null}
                                {isBucket ? (
                                  <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
                                    KIT BUCKET
                                  </span>
                                ) : null}
                              </div>
                              {row.sku ? (
                                <div className="mt-0.5 font-mono text-2xs font-normal text-slate-500 dark:text-slate-400">
                                  {row.sku}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {row.clearedQty}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums text-blue-600 dark:text-blue-400">
                            {row.dispatchedQty}
                          </td>
                          {hasReturns ? (
                            <td className="px-3 py-2 text-center tabular-nums text-rose-600 dark:text-rose-400">
                              {row.settledReturnsQty > 0
                                ? row.settledReturnsQty
                                : "—"}
                            </td>
                          ) : null}
                          <td className="px-3 py-2 text-center tabular-nums text-amber-700 dark:text-amber-300">
                            {isBucket ? "—" : row.remainingClearance}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                            {row.settledQty}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
                            {isBucket ? "—" : row.removedQty}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50/80 text-xs font-semibold dark:bg-slate-950/60">
                    <tr>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        Total
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {totals.clearedQty}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-blue-600 dark:text-blue-400">
                        {totals.dispatchedQty}
                      </td>
                      {hasReturns ? (
                        <td className="px-3 py-2 text-center tabular-nums text-rose-600 dark:text-rose-400">
                          {totals.settledReturnsQty}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-center tabular-nums text-amber-700 dark:text-amber-300">
                        {totals.remainingClearance}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-emerald-700 dark:text-emerald-300">
                        {totals.settledQty}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-indigo-600 dark:text-indigo-400">
                        {unbilledUnits}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Settlement notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={isLoading}
                className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                placeholder="Reason for settling remaining clearance to unbilled…"
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
              onClick={() => void handleSettle()}
              disabled={isLoading || !canSettle}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {isLoading ? "Settling…" : "Confirm settle & unbilled"}
            </button>
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}

export default SettleRestOrderModal;

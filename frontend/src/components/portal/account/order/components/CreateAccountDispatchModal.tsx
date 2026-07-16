"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateDispatchMutation,
} from "@/store/api";
import {
  buildAccountDispatchPreviewRows,
  computeReleaseDispatchedByLine,
  isFullyClearedApproval,
  summarizeReleaseDispatchState,
} from "./accountDispatchAvailability";
import {
  largeModalBackdropClass,
  largeModalPanelClass,
} from "@/components/portal/shared/modalLayout";

type CreateAccountDispatchModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  detail: Record<string, unknown> | null;
  partyLabel?: string;
  orderItems: Record<string, unknown>[];
  dispatches: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  initialApprovalId?: string;
  onCreated?: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function approvalId(app: Record<string, unknown>): string {
  return String(app._id ?? app.id ?? "");
}

export function CreateAccountDispatchModal({
  open,
  onClose,
  orderId,
  detail,
  partyLabel = "—",
  orderItems,
  dispatches,
  approvals,
  initialApprovalId,
  onCreated,
}: CreateAccountDispatchModalProps) {
  const [createDispatch, { isLoading: isCreating }] = useCreateDispatchMutation();
  const [dispatchDate, setDispatchDate] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billingDate, setBillingDate] = useState("");
  const [billDocumentFile, setBillDocumentFile] = useState<File | null>(null);
  const [warehouseLocation, setWarehouseLocation] = useState("");
  const [dispatchRemarks, setDispatchRemarks] = useState("");
  const [dispatchItemsQuantities, setDispatchItemsQuantities] = useState<Record<string, number>>({});
  const [activeApprovalId, setActiveApprovalId] = useState("");

  const dispatchableApprovals = useMemo(
    () => approvals.filter(isFullyClearedApproval),
    [approvals],
  );

  const activeApproval = useMemo(() => {
    if (!activeApprovalId) return dispatchableApprovals[0] ?? null;
    return (
      dispatchableApprovals.find((app) => approvalId(app) === activeApprovalId) ??
      dispatchableApprovals[0] ??
      null
    );
  }, [activeApprovalId, dispatchableApprovals]);

  const activeApprovalRefId = activeApproval ? approvalId(activeApproval) : "";

  const dispatchedByLine = useMemo(
    () => computeReleaseDispatchedByLine(dispatches, activeApprovalRefId, orderItems, activeApproval),
    [dispatches, activeApprovalRefId, orderItems, activeApproval],
  );

  const previewRows = useMemo(
    () =>
      buildAccountDispatchPreviewRows(
        activeApproval,
        orderItems,
        dispatchedByLine,
      ),
    [activeApproval, orderItems, dispatchedByLine],
  );

  const buildInitialDispatchQuantities = useCallback(
    (app: Record<string, unknown> | null) => {
      const appRefId = app ? approvalId(app) : "";
      const dispatchedMap = computeReleaseDispatchedByLine(dispatches, appRefId, orderItems, app);
      const rows = buildAccountDispatchPreviewRows(app, orderItems, dispatchedMap);
      const init: Record<string, number> = {};
      for (const row of rows) {
        if (row.dispatchable > 0) init[row.orderItemId] = row.dispatchable;
      }
      return init;
    },
    [orderItems, dispatches],
  );

  useEffect(() => {
    if (!open) return;
    const preferred =
      (initialApprovalId &&
        dispatchableApprovals.find((app) => approvalId(app) === initialApprovalId)) ||
      dispatchableApprovals[0] ||
      null;
    setActiveApprovalId(preferred ? approvalId(preferred) : "");
    setDispatchItemsQuantities(buildInitialDispatchQuantities(preferred));
    setDispatchDate(new Date().toISOString().split("T")[0]);
    setBillNumber("");
    setBillingDate(new Date().toISOString().split("T")[0]);
    setBillDocumentFile(null);
    setWarehouseLocation("");
    setDispatchRemarks("");
  }, [open, dispatchableApprovals, buildInitialDispatchQuantities, initialApprovalId]);

  useEffect(() => {
    if (!open || !activeApproval) return;
    setDispatchItemsQuantities(buildInitialDispatchQuantities(activeApproval));
  }, [open, activeApproval, buildInitialDispatchQuantities]);

  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const pastedFile = new File([blob], `screenshot_${Date.now()}.png`, {
              type: "image/png",
            });
            setBillDocumentFile(pastedFile);
            toast.success("Bill document pasted successfully!");
            event.preventDefault();
            break;
          }
        }
      }
    };

    if (open) {
      window.addEventListener("paste", handleGlobalPaste);
    }
    return () => {
      window.removeEventListener("paste", handleGlobalPaste);
    };
  }, [open]);

  const modalDispatchableTotal = useMemo(
    () => previewRows.reduce((sum, row) => sum + row.dispatchable, 0),
    [previewRows],
  );

  const previewDispatchTotal = useMemo(() => {
    return Object.values(dispatchItemsQuantities).reduce((sum, qty) => sum + qty, 0);
  }, [dispatchItemsQuantities]);

  const hasDispatchQtyEntered = useMemo(
    () => Object.values(dispatchItemsQuantities).some((qty) => qty > 0),
    [dispatchItemsQuantities],
  );

  const canSubmit =
    modalDispatchableTotal > 0 &&
    hasDispatchQtyEntered &&
    !isCreating &&
    Boolean(activeApproval) &&
    billNumber.trim().length > 0 &&
    Boolean(billingDate) &&
    Boolean(billDocumentFile);

  const releaseSummary = useMemo(
    () => summarizeReleaseDispatchState(activeApproval, dispatches, orderItems),
    [activeApproval, dispatches, orderItems],
  );

  const isContinueMode = releaseSummary.hasDispatches && releaseSummary.canContinueDispatch;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderId || !activeApproval) return;

      if (!isFullyClearedApproval(activeApproval)) {
        toast.error("Dispatch requires admin, finance, and account clearance on the linked approval.");
        return;
      }

      const items = Object.entries(dispatchItemsQuantities)
        .map(([order_item_id, qty]) => {
          const orderLine = orderItems.find(
            (line) => String(line._id ?? line.id) === order_item_id,
          );
          return {
            order_item_id,
            product: orderLine?.product,
            dispatch_quantity: qty,
          };
        })
        .filter((item) => item.dispatch_quantity > 0);

      if (items.length === 0) {
        toast.error("Please enter a dispatch quantity for at least one item.");
        return;
      }

      if (!billNumber.trim()) {
        toast.error("Bill number is required.");
        return;
      }

      if (!billingDate) {
        toast.error("Billing date is required.");
        return;
      }

      if (!billDocumentFile) {
        toast.error("Bill document is required.");
        return;
      }

      try {
        const formData = new FormData();
        formData.append("order", orderId);
        formData.append("finance_approval", approvalId(activeApproval));
        formData.append(
          "dispatch_date",
          dispatchDate
            ? new Date(dispatchDate).toISOString()
            : new Date().toISOString(),
        );
        formData.append("bill_number", billNumber.trim());
        formData.append("billing_date", new Date(billingDate).toISOString());
        formData.append("items", JSON.stringify(items));
        if (warehouseLocation.trim()) {
          formData.append("warehouse_location", warehouseLocation.trim());
        }
        if (dispatchRemarks.trim()) {
          formData.append("remarks", dispatchRemarks.trim());
        }
        formData.append("bill_document", billDocumentFile);

        await createDispatch(formData).unwrap();

        toast.success("Dispatch batch created successfully.");
        handleClose();
        onCreated?.();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [
      orderId,
      activeApproval,
      dispatchItemsQuantities,
      orderItems,
      dispatchDate,
      billNumber,
      billingDate,
      billDocumentFile,
      warehouseLocation,
      dispatchRemarks,
      createDispatch,
      handleClose,
      onCreated,
    ],
  );

  if (!open) return null;

  const orderNo = String(detail?.order_no ?? detail?.order_number ?? orderId);

  return (
    <div className={largeModalBackdropClass}>
      <div className={largeModalPanelClass}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {isContinueMode ? "Continue dispatch" : "Create dispatch"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isContinueMode
                ? "Record another dispatch batch from remaining account-cleared quantities on this approval."
                : "Dispatch quantities come from the linked approval batch after admin, finance, and account clearance."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isCreating}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void handleSubmit(e)}>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-slate-950/40">
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <span className="block text-slate-500 dark:text-slate-400">Order</span>
                  <span className="mt-0.5 block font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {orderNo}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500 dark:text-slate-400">Party</span>
                  <span className="mt-0.5 block font-semibold text-slate-800 dark:text-slate-200">
                    {partyLabel}
                  </span>
                </div>
              </div>
              {activeApproval ? (
                <div className="mt-3 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <p>
                    Linked approval batch{" "}
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                      {String(activeApproval.approval_no ?? "—")}
                    </span>
                    {" "}
                    · Rev #{String(activeApproval.revision_number ?? 1)}
                  </p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Remaining clearance:{" "}
                      <span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">
                        {releaseSummary.remainingTotal}
                      </span>
                    </span>
                    <span>
                      Available to dispatch:{" "}
                      <span className="font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                        {releaseSummary.dispatchableTotal}
                      </span>
                    </span>
                  </p>
                </div>
              ) : null}
            </div>

            {dispatchableApprovals.length === 0 ? (
              <p className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                No approval batches are fully cleared (admin, finance, and account) with remaining
                quantities to dispatch.
              </p>
            ) : (
              <>
                {dispatchableApprovals.length > 1 ? (
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="account-dispatch-approval">
                      Linked approval batch
                    </label>
                    <select
                      id="account-dispatch-approval"
                      value={activeApproval ? approvalId(activeApproval) : ""}
                      onChange={(e) => setActiveApprovalId(e.target.value)}
                      className={inputClass}
                      disabled={isCreating}
                    >
                      {dispatchableApprovals.map((app) => (
                        <option key={approvalId(app)} value={approvalId(app)}>
                          {String(app.approval_no ?? approvalId(app))} · Rev #
                          {String(app.revision_number ?? 1)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="account-dispatch-date">
                      Dispatch date *
                    </label>
                    <input
                      id="account-dispatch-date"
                      type="date"
                      value={dispatchDate}
                      onChange={(e) => setDispatchDate(e.target.value)}
                      className={inputClass}
                      required
                      disabled={isCreating}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass} htmlFor="account-warehouse-location">
                      Warehouse location
                    </label>
                    <input
                      id="account-warehouse-location"
                      type="text"
                      value={warehouseLocation}
                      onChange={(e) => setWarehouseLocation(e.target.value)}
                      className={inputClass}
                      placeholder="E.g., Aisle 4, Shelf B"
                      disabled={isCreating}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 dark:border-white/10 dark:bg-slate-950/30">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Billing details
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={labelClass} htmlFor="account-bill-number">
                        Bill number *
                      </label>
                      <input
                        id="account-bill-number"
                        type="text"
                        value={billNumber}
                        onChange={(e) => setBillNumber(e.target.value)}
                        className={inputClass}
                        placeholder="E.g., INV-2026-0042"
                        required
                        disabled={isCreating}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClass} htmlFor="account-billing-date">
                        Billing date *
                      </label>
                      <input
                        id="account-billing-date"
                        type="date"
                        value={billingDate}
                        onChange={(e) => setBillingDate(e.target.value)}
                        className={inputClass}
                        required
                        disabled={isCreating}
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    <label className={labelClass} htmlFor="account-bill-document">
                      Bill document *
                    </label>
                    <input
                      id="account-bill-document"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                      onChange={(e) => {
                        setBillDocumentFile(e.target.files?.[0] ?? null);
                      }}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-100 dark:text-slate-300 dark:file:bg-blue-950/40 dark:file:text-blue-300"
                      required={!billDocumentFile}
                      disabled={isCreating}
                    />
                    {billDocumentFile ? (
                      <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-white/5 dark:bg-slate-950 mt-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {billDocumentFile.name}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {(billDocumentFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBillDocumentFile(null)}
                          className="text-xs font-semibold text-rose-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Upload invoice or bill copy (PDF, image, or Word) or paste a screenshot directly (Ctrl+V / Cmd+V).
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="account-dispatch-remarks">
                    Remarks / special instructions
                  </label>
                  <textarea
                    id="account-dispatch-remarks"
                    rows={2}
                    value={dispatchRemarks}
                    onChange={(e) => setDispatchRemarks(e.target.value)}
                    className={inputClass}
                    placeholder="E.g., Fragile items, pack with bubble wrap"
                    disabled={isCreating}
                  />
                </div>

                <div className="border-t border-slate-200/90 pt-4 dark:border-white/10">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Dispatch preview
                    </h4>
                    <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                      This batch: {previewDispatchTotal}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200/60 dark:border-white/5">
                    <table className="w-full min-w-[700px] text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
                        <tr>
                          <th className="px-4 py-2.5">Product</th>
                          <th className="px-4 py-2.5 text-center">Cleared</th>
                          <th className="px-4 py-2.5 text-center">Dispatched</th>
                          <th className="px-4 py-2.5 text-center">Remaining</th>
                          <th className="px-4 py-2.5 text-center">Available</th>
                          <th className="px-4 py-2.5 text-right w-32">Dispatch qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {previewRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400"
                            >
                              No remaining account-cleared quantities are available on this approval.
                            </td>
                          </tr>
                        ) : (
                          previewRows.map((row) => {
                            const currentVal = dispatchItemsQuantities[row.orderItemId] ?? 0;

                            return (
                              <tr key={row.orderItemId} className="bg-white dark:bg-slate-900">
                                <td className="px-4 py-3">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                    {row.productName}
                                  </span>
                                  {row.sku ? (
                                    <span className="text-[10px] text-slate-400">
                                      SKU {row.sku}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3 text-center tabular-nums text-slate-500">
                                  {row.clearedQty}
                                </td>
                                <td className="px-4 py-3 text-center tabular-nums text-slate-500">
                                  {row.alreadyDispatched}
                                </td>
                                <td className="px-4 py-3 text-center tabular-nums text-blue-600 dark:text-blue-400">
                                  {row.remaining}
                                </td>
                                <td className="px-4 py-3 text-center tabular-nums font-semibold text-indigo-700 dark:text-indigo-300">
                                  {row.dispatchable}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    max={row.dispatchable}
                                    value={currentVal || ""}
                                    onChange={(e) => {
                                      const val = Math.min(
                                        row.dispatchable,
                                        Math.max(0, parseInt(e.target.value, 10) || 0),
                                      );
                                      setDispatchItemsQuantities((prev) => ({
                                        ...prev,
                                        [row.orderItemId]: val,
                                      }));
                                    }}
                                    className="w-20 text-right rounded border border-slate-200 px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-950 text-slate-900 dark:text-slate-50 focus:border-blue-600 focus:outline-none"
                                    placeholder="0"
                                    disabled={isCreating}
                                  />
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {previewRows.length > 0 ? (
                        <tfoot className="border-t border-slate-200/80 bg-slate-50/80 text-[11px] font-semibold dark:border-white/10 dark:bg-slate-950/40">
                          <tr>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">Total</td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-400">
                              {previewRows.reduce((s, r) => s + r.clearedQty, 0)}
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-400">
                              {previewRows.reduce((s, r) => s + r.alreadyDispatched, 0)}
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-blue-600 dark:text-blue-400">
                              {previewRows.reduce((s, r) => s + r.remaining, 0)}
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-indigo-700 dark:text-indigo-300">
                              {modalDispatchableTotal}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-blue-700 dark:text-blue-300">
                              {previewDispatchTotal}
                            </td>
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-white/5 dark:bg-slate-950/40">
            <button
              type="button"
              onClick={handleClose}
              disabled={isCreating}
              className={btnSecondaryClass}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {isCreating
                ? isContinueMode
                  ? "Recording dispatch…"
                  : "Creating dispatch…"
                : isContinueMode
                  ? "Continue dispatch"
                  : "Create dispatch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateAccountDispatchModal;

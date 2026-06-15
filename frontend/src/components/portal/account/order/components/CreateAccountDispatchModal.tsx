"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateAttachmentMutation,
  useCreateDispatchMutation,
  usePatchDispatchMutation,
} from "@/store/api";
import {
  summarizeReleaseDispatchState,
} from "./accountDispatchAvailability";

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
  onResolveRelease?: (approval: Record<string, unknown>) => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function approvalId(app: Record<string, unknown>): string {
  return String(app._id ?? app.id ?? "");
}

function normalizeOrderItemId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

function isAccountClearedRelease(app: Record<string, unknown>): boolean {
  return Boolean(app.is_account_approved) && Boolean(app.is_finance_approved);
}

function recordId(rec: unknown): string {
  if (!rec || typeof rec !== "object") return "";
  const o = rec as Record<string, unknown>;
  return String(o._id ?? o.id ?? "");
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
  onResolveRelease,
}: CreateAccountDispatchModalProps) {
  const [createDispatch, { isLoading: isCreating }] = useCreateDispatchMutation();
  const [createAttachment] = useCreateAttachmentMutation();
  const [patchDispatch] = usePatchDispatchMutation();
  const [dispatchDate, setDispatchDate] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billingDate, setBillingDate] = useState("");
  const [billDocumentFile, setBillDocumentFile] = useState<File | null>(null);
  const [warehouseLocation, setWarehouseLocation] = useState("");
  const [dispatchRemarks, setDispatchRemarks] = useState("");
  const [dispatchItemsQuantities, setDispatchItemsQuantities] = useState<Record<string, number>>({});
  const [activeApprovalId, setActiveApprovalId] = useState("");

  const getReleaseDispatches = useCallback(
    (appId: string) => {
      return dispatches.filter((disp) => {
        const statusValue = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
        if (statusValue === "cancelled") return false;

        const dispApproval = disp.finance_approval;
        const dispApprovalId =
          typeof dispApproval === "object" && dispApproval !== null
            ? String(
                (dispApproval as Record<string, unknown>)._id ??
                  (dispApproval as Record<string, unknown>).id ??
                  "",
              )
            : String(dispApproval ?? "");

        return dispApprovalId === appId;
      });
    },
    [dispatches],
  );

  const isReleaseFullyDispatched = useCallback(
    (app: Record<string, unknown>) => {
      const items = Array.isArray(app.approval_items)
        ? (app.approval_items as Record<string, unknown>[])
        : [];
      if (items.length === 0) return false;

      const appId = approvalId(app);
      const releaseDispatches = getReleaseDispatches(appId);
      const dispatchedMap: Record<string, number> = {};

      releaseDispatches.forEach((disp) => {
        const rawItems = Array.isArray(disp.dispatch_items)
          ? disp.dispatch_items
          : (disp.items as unknown[]) || [];
        (rawItems as Record<string, unknown>[]).forEach((item) => {
          const lineId = normalizeOrderItemId(item.order_item_id);
          const qty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
          dispatchedMap[lineId] = (dispatchedMap[lineId] || 0) + qty;
        });
      });

      const linesWithApproval = items.filter((ai) => Number(ai.approved_quantity || 0) > 0);
      if (linesWithApproval.length === 0) return false;

      return linesWithApproval.every((ai) => {
        const approvedQty = Number(ai.approved_quantity || 0);
        const lineId = normalizeOrderItemId(ai.order_item_id);
        return (dispatchedMap[lineId] || 0) >= approvedQty;
      });
    },
    [getReleaseDispatches],
  );

  const dispatchableApprovals = useMemo(() => {
    return approvals.filter(
      (app) => isAccountClearedRelease(app) && !isReleaseFullyDispatched(app),
    );
  }, [approvals, isReleaseFullyDispatched]);

  const activeApproval = useMemo(() => {
    if (!activeApprovalId) return dispatchableApprovals[0] ?? null;
    return (
      dispatchableApprovals.find((app) => approvalId(app) === activeApprovalId) ??
      dispatchableApprovals[0] ??
      null
    );
  }, [activeApprovalId, dispatchableApprovals]);

  const dispatchedQtyByItemForActiveApproval = useMemo(() => {
    if (!activeApproval) return {};
    const map: Record<string, number> = {};
    const appId = approvalId(activeApproval);

    getReleaseDispatches(appId).forEach((disp) => {
      const items = Array.isArray(disp.dispatch_items)
        ? disp.dispatch_items
        : (disp.items as unknown[]) || [];
      (items as Record<string, unknown>[]).forEach((item) => {
        const lineId = normalizeOrderItemId(item.order_item_id);
        const qty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
        map[lineId] = (map[lineId] || 0) + qty;
      });
    });

    return map;
  }, [activeApproval, getReleaseDispatches]);

  const buildInitialDispatchQuantities = useCallback(
    (app: Record<string, unknown> | null) => {
      const init: Record<string, number> = {};
      const appId = app ? approvalId(app) : "";
      const releaseDispatches = appId ? getReleaseDispatches(appId) : [];

      orderItems.forEach((line) => {
        const lineId = String(line._id ?? line.id ?? "");
        const appItem = app?.approval_items
          ? (app.approval_items as Record<string, unknown>[]).find(
              (ai) => normalizeOrderItemId(ai.order_item_id) === lineId,
            )
          : undefined;

        const approved = appItem
          ? Number(appItem.approved_quantity || 0)
          : Number(line.approved_quantity ?? line.ordered_quantity ?? line.quantity ?? 0);

        let alreadyDispatched = 0;
        if (app) {
          releaseDispatches.forEach((disp) => {
            const items = Array.isArray(disp.dispatch_items)
              ? disp.dispatch_items
              : (disp.items as unknown[]) || [];
            (items as Record<string, unknown>[]).forEach((item) => {
              if (normalizeOrderItemId(item.order_item_id) === lineId) {
                alreadyDispatched += Number(
                  item.dispatched_quantity ?? item.dispatch_quantity ?? 0,
                );
              }
            });
          });
        } else {
          alreadyDispatched = Number(line.dispatched_quantity || 0);
        }

        const remaining = Math.max(0, approved - alreadyDispatched);
        if (remaining > 0) init[lineId] = remaining;
      });

      return init;
    },
    [orderItems, getReleaseDispatches],
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

  const modalRemainingTotal = useMemo(() => {
    if (!open) return 0;
    let total = 0;
    orderItems.forEach((line) => {
      const orderItemId = String(line._id ?? line.id ?? "");
      const appItem = activeApproval?.approval_items
        ? (activeApproval.approval_items as Record<string, unknown>[]).find(
            (ai) => normalizeOrderItemId(ai.order_item_id) === orderItemId,
          )
        : undefined;

      const approved = appItem
        ? Number(appItem.approved_quantity || 0)
        : Number(line.approved_quantity ?? line.ordered_quantity ?? line.quantity ?? 0);

      const alreadyDispatched = activeApproval
        ? (dispatchedQtyByItemForActiveApproval[orderItemId] ?? 0)
        : Number(line.dispatched_quantity || 0);

      total += Math.max(0, approved - alreadyDispatched);
    });
    return total;
  }, [open, orderItems, activeApproval, dispatchedQtyByItemForActiveApproval]);

  const previewDispatchTotal = useMemo(() => {
    return Object.values(dispatchItemsQuantities).reduce((sum, qty) => sum + qty, 0);
  }, [dispatchItemsQuantities]);

  const hasDispatchQtyEntered = useMemo(
    () => Object.values(dispatchItemsQuantities).some((qty) => qty > 0),
    [dispatchItemsQuantities],
  );

  const canSubmit =
    modalRemainingTotal > 0 &&
    hasDispatchQtyEntered &&
    !isCreating &&
    Boolean(activeApproval) &&
    billNumber.trim().length > 0 &&
    Boolean(billingDate) &&
    Boolean(billDocumentFile);

  const releaseSummary = useMemo(
    () => summarizeReleaseDispatchState(activeApproval, dispatches),
    [activeApproval, dispatches],
  );

  const isContinueMode = releaseSummary.hasDispatches && releaseSummary.canContinueDispatch;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderId || !activeApproval) return;

      const items = Object.entries(dispatchItemsQuantities)
        .map(([order_item_id, qty]) => ({
          order_item_id,
          dispatch_quantity: qty,
        }))
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
        const created = await createDispatch({
          order: orderId,
          finance_approval: approvalId(activeApproval),
          dispatch_date: dispatchDate
            ? new Date(dispatchDate).toISOString()
            : new Date().toISOString(),
          bill_number: billNumber.trim(),
          billing_date: new Date(billingDate).toISOString(),
          warehouse_location: warehouseLocation.trim() || undefined,
          remarks: dispatchRemarks.trim() || undefined,
          items,
        }).unwrap();

        const dispatchId = recordId(created);
        if (!dispatchId) {
          throw new Error("Dispatch was created but no id was returned.");
        }

        const formData = new FormData();
        formData.append("file", billDocumentFile);
        formData.append("entity_type", "dispatch");
        formData.append("entity_id", dispatchId);
        formData.append("remarks", `Bill ${billNumber.trim()}`);

        const attachment = await createAttachment(formData).unwrap();
        const attachmentId = recordId(attachment);
        if (attachmentId) {
          await patchDispatch({
            id: dispatchId,
            patch: { bill_document: attachmentId },
          }).unwrap();
        }

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
      dispatchDate,
      billNumber,
      billingDate,
      billDocumentFile,
      warehouseLocation,
      dispatchRemarks,
      createDispatch,
      createAttachment,
      patchDispatch,
      handleClose,
      onCreated,
    ],
  );

  if (!open) return null;

  const orderNo = String(detail?.order_no ?? detail?.order_number ?? orderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {isContinueMode ? "Continue dispatch" : "Create dispatch"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isContinueMode
                ? "Record another dispatch batch for remaining cleared quantities on this release."
                : "Preview and confirm dispatch quantities for account-cleared items."}
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
                <p className="mt-3 text-[11px] text-slate-600 dark:text-slate-300">
                  Linked clearance batch{" "}
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                    {String(activeApproval.approval_no ?? "—")}
                  </span>
                  {" "}
                  · Rev #{String(activeApproval.revision_number ?? 1)}
                </p>
              ) : null}
            </div>

            {dispatchableApprovals.length === 0 ? (
              <p className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                No account-cleared approval batches remain available for dispatch.
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
                      required
                      disabled={isCreating}
                    />
                    {billDocumentFile ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Selected: {billDocumentFile.name}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Upload invoice or bill copy (PDF, image, or Word).
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
                      Total units this batch: {previewDispatchTotal}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200/60 dark:border-white/5">
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
                        <tr>
                          <th className="px-4 py-2.5">Product</th>
                          <th className="px-4 py-2.5 text-center">Cleared</th>
                          <th className="px-4 py-2.5 text-center">Already dispatched</th>
                          <th className="px-4 py-2.5 text-center">Remaining</th>
                          <th className="px-4 py-2.5 text-right w-32">Dispatch qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {modalRemainingTotal === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400"
                            >
                              All cleared quantities for this batch have been dispatched.
                            </td>
                          </tr>
                        ) : null}
                        {orderItems.map((line) => {
                          const orderItemId = String(line._id ?? line.id ?? "");
                          const appItem = activeApproval?.approval_items
                            ? (activeApproval.approval_items as Record<string, unknown>[]).find(
                                (ai) =>
                                  normalizeOrderItemId(ai.order_item_id) === orderItemId,
                              )
                            : undefined;

                          const approved = appItem
                            ? Number(appItem.approved_quantity || 0)
                            : Number(
                                line.approved_quantity ??
                                  line.ordered_quantity ??
                                  line.quantity ??
                                  0,
                              );

                          const alreadyDispatched = activeApproval
                            ? (dispatchedQtyByItemForActiveApproval[orderItemId] ?? 0)
                            : Number(line.dispatched_quantity || 0);
                          const remaining = Math.max(0, approved - alreadyDispatched);
                          if (remaining <= 0) return null;

                          const currentVal = dispatchItemsQuantities[orderItemId] ?? 0;

                          return (
                            <tr key={orderItemId} className="bg-white dark:bg-slate-900">
                              <td className="px-4 py-3">
                                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                  {String(line.product_name || "—")}
                                </span>
                                {line.sku ? (
                                  <span className="text-[10px] text-slate-400">
                                    SKU {String(line.sku)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-center text-slate-500">{approved}</td>
                              <td className="px-4 py-3 text-center text-slate-500">
                                {alreadyDispatched}
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400">
                                {remaining}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  value={currentVal || ""}
                                  onChange={(e) => {
                                    const val = Math.min(
                                      remaining,
                                      Math.max(0, parseInt(e.target.value, 10) || 0),
                                    );
                                    setDispatchItemsQuantities((prev) => ({
                                      ...prev,
                                      [orderItemId]: val,
                                    }));
                                  }}
                                  className="w-20 text-right rounded border border-slate-200 px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-950 text-slate-900 dark:text-slate-50 focus:border-blue-600 focus:outline-none"
                                  placeholder="0"
                                  disabled={isCreating}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-white/5 dark:bg-slate-950/40">
            {releaseSummary.canResolveRelease && activeApproval && onResolveRelease ? (
              <button
                type="button"
                onClick={() => onResolveRelease(activeApproval)}
                disabled={isCreating}
                className="mr-auto rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
              >
                Resolve release
              </button>
            ) : null}
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

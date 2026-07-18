"use client";

import { useCallback, useMemo, useState } from "react";

import { LargeModalBackdrop } from "@/components/portal/shared/LargeModalBackdrop";
import { largeModalPanelClass } from "@/components/portal/shared/modalLayout";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useLogShipmentDeliveryMutation } from "@/store/api";

type DeliveryFormItem = {
  product: string;
  productName: string;
  dispatchedQty: number;
};

type OrderDeliveryModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  transportId: string;
  dispatchId: string;
  dispatches?: Record<string, unknown>[];
  orderItems?: Record<string, unknown>[];
  onRefetch?: () => void;
};

export function OrderDeliveryModal({
  open,
  onClose,
  orderId,
  transportId,
  dispatchId,
  dispatches = [],
  orderItems = [],
  onRefetch,
}: OrderDeliveryModalProps) {
  const [overallDeliveryRemarks, setOverallDeliveryRemarks] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [logShipmentDelivery, { isLoading: isLoggingShipment }] =
    useLogShipmentDeliveryMutation();

  const resetForm = useCallback(() => {
    setOverallDeliveryRemarks("");
    setReceivedBy("");
  }, []);

  const deliveryFormItems = useMemo<DeliveryFormItem[]>(() => {
    const selectedDispatch = dispatches.find(
      (dispatch) => String(dispatch._id ?? dispatch.id ?? "") === dispatchId,
    );
    const dispatchItems = Array.isArray(selectedDispatch?.dispatch_items)
      ? selectedDispatch.dispatch_items
      : Array.isArray(selectedDispatch?.items)
        ? selectedDispatch.items
        : [];

    return dispatchItems.map((rawItem) => {
        const item = rawItem as Record<string, unknown>;
        const orderItem = orderItems.find(
          (row) => String(row._id ?? row.id ?? "") === String(item.order_item_id),
        );
        const product =
          item.product && typeof item.product === "object"
            ? (item.product as Record<string, unknown>)
            : null;
        return {
          product:
            product
              ? String(product._id ?? product.id ?? "")
              : String(item.product ?? ""),
          productName: String(
            orderItem?.product_name ||
            item.product_name ||
            product?.product_name ||
            "—",
          ),
          dispatchedQty: Number(
            item.dispatched_quantity ?? item.dispatch_quantity ?? 0,
          ),
        };
      });
  }, [dispatchId, dispatches, orderItems]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleDeliverySubmit = async () => {
    if (!transportId || !dispatchId) return;
    if (
      deliveryFormItems.length === 0 ||
      deliveryFormItems.some((item) => item.dispatchedQty <= 0)
    ) {
      toast.error("No dispatched items are available for full delivery.");
      return;
    }

    const deliveredSummary = deliveryFormItems
      .map((item) => `${item.productName}: ${item.dispatchedQty}`)
      .join("; ");

    try {
      await logShipmentDelivery({
        order: orderId,
        dispatch: dispatchId,
        transport: transportId,
        delivery_type: "full",
        delivery_items: deliveryFormItems.map((item) => ({
          product: item.product,
          delivered_quantity: item.dispatchedQty,
          remarks: "",
        })),
        received_by: receivedBy.trim(),
        remarks: overallDeliveryRemarks.trim(),
        status_remarks: [
          "[Full delivery]",
          `Accepted: ${deliveredSummary}`,
          receivedBy.trim() ? `Received by: ${receivedBy.trim()}` : null,
          overallDeliveryRemarks.trim()
            ? `Remarks: ${overallDeliveryRemarks.trim()}`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        actual_delivery_date: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      }).unwrap();

      toast.success("Full delivery logged. Order and workflow will update shortly.");
      handleClose();
      onRefetch?.();
    } catch (error) {
      toast.error(mutationRejectedMessage(error));
    }
  };

  if (!open) return null;

  return (
    <LargeModalBackdrop>
      <div className={largeModalPanelClass}>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-emerald-50/40 px-6 py-4 dark:border-white/5 dark:bg-emerald-950/10">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Confirm Full Delivery
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              All dispatched products will be marked delivered in full.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-800/20 dark:bg-emerald-950/20 dark:text-emerald-300">
            Full delivery mode — quantities are fixed to the dispatched quantities.
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-center">Dispatched</th>
                  <th className="px-4 py-3 text-center text-emerald-700 dark:text-emerald-400">
                    Delivered
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {deliveryFormItems.map((item, index) => (
                  <tr key={`${item.product}-${index}`} className="bg-white dark:bg-slate-900">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {item.productName}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">
                      {item.dispatchedQty}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                      {item.dispatchedQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Received By</span>
              <input
                type="text"
                value={receivedBy}
                onChange={(event) => setReceivedBy(event.target.value)}
                placeholder="Name of recipient"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Delivery Remarks (optional)</span>
              <textarea
                rows={2}
                value={overallDeliveryRemarks}
                onChange={(event) => setOverallDeliveryRemarks(event.target.value)}
                placeholder="Add delivery notes"
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
            </label>
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoggingShipment}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDeliverySubmit()}
            disabled={isLoggingShipment || deliveryFormItems.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoggingShipment ? "Submitting…" : "Confirm Full Delivery"}
          </button>
        </footer>
      </div>
    </LargeModalBackdrop>
  );
}

"use client";

import { Fragment, useCallback, useMemo, useState } from "react";

import { LargeModalBackdrop } from "@/components/portal/shared/LargeModalBackdrop";
import { largeModalPanelClass } from "@/components/portal/shared/modalLayout";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useLogShipmentDeliveryMutation } from "@/store/api";
import {
  idFromRef,
  nestDispatchLinesForDisplay,
  type DispatchLineDisplay,
} from "../dispatchKitDisplay";

type DeliveryFormItem = {
  product: string;
  productName: string;
  order_item_id?: string;
  kit_parent_product?: string;
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

/** Normalize every dispatched line for display + full-delivery payload (incl. kit shells). */
function normalizeDispatchItemsForDelivery(
  dispatchItems: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  return dispatchItems
    .map((item) => {
      const orderItemId = idFromRef(item.order_item_id);
      const matchItem = orderItems.find(
        (oi) => idFromRef(oi._id ?? oi.id) === orderItemId,
      );
      const productId =
        idFromRef(item.product) || idFromRef(matchItem?.product);
      const qty = Number(
        item.dispatched_quantity ?? item.dispatch_quantity ?? 0,
      );
      return {
        ...item,
        order_item_id: orderItemId || idFromRef(matchItem?._id ?? matchItem?.id),
        product: productId,
        product_name:
          matchItem?.product_name ||
          item.product_name ||
          (typeof item.product === "object" && item.product
            ? (item.product as Record<string, unknown>).product_name
            : undefined),
        sku: matchItem?.sku ?? item.sku,
        kit_parent_product:
          idFromRef(item.kit_parent_product) ||
          idFromRef(matchItem?.kit_parent_product) ||
          undefined,
        dispatched_quantity: qty,
        delivered_quantity: qty,
      };
    })
    .filter((item) => Number(item.dispatched_quantity) > 0);
}

function DeliveryNestRow({
  line,
  isBucket,
}: {
  line: DispatchLineDisplay;
  isBucket?: boolean;
}) {
  const isKitParent = Boolean(line.isKitParent) && !isBucket;
  return (
    <tr
      className={
        isBucket
          ? "bg-slate-50/80 dark:bg-slate-950/60"
          : isKitParent
            ? "bg-violet-50/40 dark:bg-violet-950/20"
            : "bg-white dark:bg-slate-900"
      }
    >
      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
        <div
          className={
            isBucket
              ? "ml-3 border-l-2 border-violet-300 pl-2 dark:border-violet-700"
              : undefined
          }
        >
          {line.productName}
          {isKitParent ? (
            <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
              KIT
            </span>
          ) : null}
          {isBucket || line.isKitBucket ? (
            <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
              KIT BUCKET
            </span>
          ) : null}
          {line.sku ? (
            <span className="mt-0.5 block text-2xs font-normal text-slate-400">
              SKU {line.sku}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-300">
        {line.dispatchedQty}
      </td>
      <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
        {line.deliveredQty > 0 ? line.deliveredQty : line.dispatchedQty}
      </td>
    </tr>
  );
}

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

  const selectedDispatch = useMemo(
    () =>
      dispatches.find(
        (dispatch) => idFromRef(dispatch._id ?? dispatch.id) === dispatchId,
      ) ?? null,
    [dispatches, dispatchId],
  );

  const normalizedDispatchItems = useMemo(() => {
    const dispatchItems = Array.isArray(selectedDispatch?.dispatch_items)
      ? (selectedDispatch!.dispatch_items as Record<string, unknown>[])
      : Array.isArray(selectedDispatch?.items)
        ? (selectedDispatch!.items as Record<string, unknown>[])
        : [];
    return normalizeDispatchItemsForDelivery(dispatchItems, orderItems);
  }, [selectedDispatch, orderItems]);

  const displayGroups = useMemo(
    () => nestDispatchLinesForDisplay(normalizedDispatchItems, orderItems),
    [normalizedDispatchItems, orderItems],
  );

  /** Every dispatched product with qty > 0 (kit shells, buckets, individuals). */
  const deliveryFormItems = useMemo<DeliveryFormItem[]>(() => {
    return normalizedDispatchItems
      .map((item) => ({
        product: idFromRef(item.product),
        productName: String(item.product_name ?? "—"),
        order_item_id: idFromRef(item.order_item_id) || undefined,
        kit_parent_product: idFromRef(item.kit_parent_product) || undefined,
        dispatchedQty: Number(item.dispatched_quantity ?? 0),
      }))
      .filter((item) => Boolean(item.product) && item.dispatchedQty > 0);
  }, [normalizedDispatchItems]);

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
        // Full delivery mirrors every dispatched product (kit shells + buckets + individuals).
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
              Full delivery includes every product on the linked dispatch.
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
                {displayGroups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      No dispatched items are available for full delivery.
                    </td>
                  </tr>
                ) : (
                  displayGroups.map((group, gIdx) => {
                    if (group.line) {
                      return (
                        <DeliveryNestRow key={group.line.key} line={group.line} />
                      );
                    }

                    const headerLine: DispatchLineDisplay | null = group.parent
                      ? {
                          ...group.parent,
                          isKitParent:
                            group.parent.isKitParent || group.buckets.length > 0,
                        }
                      : group.kitHeader
                        ? {
                            key: `kit-header-${group.kitHeader.productId}-${gIdx}`,
                            item: {},
                            productName: group.kitHeader.productName,
                            sku: group.kitHeader.sku,
                            orderedQty: group.kitHeader.orderedQty,
                            dispatchedQty: group.kitHeader.dispatchedQty,
                            deliveredQty: group.kitHeader.deliveredQty,
                            returnedQty: group.kitHeader.returnedQty,
                            remainingQty: group.kitHeader.remainingQty,
                            productId: group.kitHeader.productId,
                            kitParentProduct: "",
                            isKitBucket: false,
                            isKitParent: true,
                          }
                        : null;

                    return (
                      <Fragment key={headerLine?.key ?? `group-${gIdx}`}>
                        {headerLine ? (
                          <DeliveryNestRow line={headerLine} />
                        ) : null}
                        {group.buckets.map((bucket) => (
                          <DeliveryNestRow
                            key={bucket.key}
                            line={bucket}
                            isBucket
                          />
                        ))}
                      </Fragment>
                    );
                  })
                )}
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

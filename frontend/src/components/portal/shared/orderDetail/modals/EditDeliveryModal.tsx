"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { LargeModalBackdrop } from "@/components/portal/shared/LargeModalBackdrop";
import { largeModalPanelClass } from "@/components/portal/shared/modalLayout";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useGetDispatchQuery,
  usePatchOrderDeliveryMutation,
} from "@/store/api";
import {
  applyKitDispatchQtyToBuckets,
  type AccountDispatchPreviewRow,
} from "../accountDispatchAvailability";
import {
  idFromRef,
  isKitShellDispatchSource,
  nestDispatchLinesForDisplay,
  type DispatchLineDisplay,
} from "../dispatchKitDisplay";

type EditDeliveryModalProps = {
  open: boolean;
  onClose: () => void;
  delivery: Record<string, unknown> | null;
  /** Order dispatches — delivery is created from a dispatch batch. */
  dispatches?: Record<string, unknown>[];
  orderItems?: Record<string, unknown>[];
  onSuccess?: () => void;
};

type DeliveryItemDraft = {
  key: string;
  product: string;
  productName: string;
  sku?: string;
  order_item_id?: string;
  kit_parent_product?: string;
  is_kit_parent?: boolean;
  is_kit_bucket?: boolean;
  /** Kit / bucket cleared qty used for BOM % cascade. */
  cleared_qty: number;
  deliveredQty: number;
  remarks: string;
};

function toDateInput(v: unknown): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function matchOrderLine(
  item: Record<string, unknown>,
  orderItems: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const orderItemId = idFromRef(item.order_item_id);
  if (orderItemId) {
    const byId = orderItems.find(
      (oi) => idFromRef(oi._id ?? oi.id) === orderItemId,
    );
    if (byId) return byId;
  }

  const productId = idFromRef(item.product);
  if (!productId) return undefined;

  const kitParent = idFromRef(item.kit_parent_product);
  const matches = orderItems.filter(
    (oi) => idFromRef(oi.product) === productId,
  );
  if (matches.length === 0) return undefined;

  if (kitParent) {
    return (
      matches.find((oi) => idFromRef(oi.kit_parent_product) === kitParent) ||
      matches[0]
    );
  }

  // Delivery rows only store product id — prefer kit-bucket order lines so
  // components nest under KIT instead of looking like missing/flat rows.
  const buckets = matches.filter((oi) => idFromRef(oi.kit_parent_product));
  if (buckets.length > 0) return buckets[0];
  return matches.find((oi) => !idFromRef(oi.kit_parent_product)) || matches[0];
}

function deliveryHasBucketsForKit(
  items: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
  kitProductId: string,
): boolean {
  if (!kitProductId) return false;
  return items.some((other) => {
    if (idFromRef(other.kit_parent_product) === kitProductId) return true;
    const match = matchOrderLine(other, orderItems);
    return idFromRef(match?.kit_parent_product) === kitProductId;
  });
}

function dispatchItemsOf(
  disp: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  if (!disp) return [];
  if (Array.isArray(disp.dispatch_items)) {
    return disp.dispatch_items as Record<string, unknown>[];
  }
  if (Array.isArray(disp.items)) {
    return disp.items as Record<string, unknown>[];
  }
  return [];
}

/**
 * Seed edit rows from the linked order dispatch (authoritative kit structure),
 * overlaying delivered qty / remarks from the delivery record by product.
 */
function normalizeFromLinkedDispatch(
  deliveryItems: Record<string, unknown>[],
  dispatchItems: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  const deliveredByProduct = new Map<
    string,
    { qty: number; remarks: string }
  >();
  for (const item of deliveryItems) {
    const productId = idFromRef(item.product);
    if (!productId) continue;
    const prev = deliveredByProduct.get(productId) || { qty: 0, remarks: "" };
    deliveredByProduct.set(productId, {
      qty: prev.qty + Number(item.delivered_quantity ?? 0),
      remarks: String(item.remarks || prev.remarks || ""),
    });
  }

  return dispatchItems
    .filter(
      (item) => !isKitShellDispatchSource(item, dispatchItems, orderItems),
    )
    .map((item) => {
      const orderItemId = idFromRef(item.order_item_id);
      const matchItem =
        orderItems.find((oi) => idFromRef(oi._id ?? oi.id) === orderItemId) ||
        matchOrderLine(item, orderItems);
      const productId =
        idFromRef(item.product) || idFromRef(matchItem?.product);
      const dispatchedQty = Number(
        item.dispatched_quantity ?? item.dispatch_quantity ?? 0,
      );
      const delivered = productId
        ? deliveredByProduct.get(productId)
        : undefined;
      return {
        ...item,
        order_item_id:
          orderItemId || idFromRef(matchItem?._id ?? matchItem?.id),
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
        dispatched_quantity: dispatchedQty,
        delivered_quantity:
          delivered != null ? delivered.qty : dispatchedQty,
        remarks: delivered?.remarks ?? item.remarks ?? "",
      };
    })
    .filter(
      (item) =>
        Number(item.dispatched_quantity) > 0 ||
        Number(item.delivered_quantity) > 0,
    );
}

/** Fallback when linked dispatch items are unavailable. */
function normalizeDeliveryItems(
  items: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  const visible = items.filter((item) => {
    if (!isKitShellDispatchSource(item, items, orderItems)) return true;
    const kitProductId = idFromRef(item.product);
    return !deliveryHasBucketsForKit(items, orderItems, kitProductId);
  });

  return visible.map((item) => {
    const matchItem = matchOrderLine(item, orderItems);
    const deliveredQty = Number(item.delivered_quantity ?? 0);
    return {
      ...item,
      order_item_id:
        idFromRef(item.order_item_id) ||
        idFromRef(matchItem?._id ?? matchItem?.id) ||
        item.order_item_id,
      product:
        idFromRef(item.product) ||
        idFromRef(matchItem?.product) ||
        item.product,
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
      dispatched_quantity: deliveredQty,
      delivered_quantity: deliveredQty,
      remarks: item.remarks,
    };
  });
}

function clearedQtyOf(line: DispatchLineDisplay): number {
  return Math.max(
    0,
    Number(
      line.matchItem?.approved_quantity ??
        line.matchItem?.ordered_quantity ??
        line.matchItem?.quantity ??
        line.orderedQty ??
        0,
    ) || 0,
  );
}

/** Flatten nested kit display groups into editable drafts (kit header + buckets). */
function draftsFromNestedGroups(
  groups: ReturnType<typeof nestDispatchLinesForDisplay>,
  orderItems: Record<string, unknown>[],
): DeliveryItemDraft[] {
  const out: DeliveryItemDraft[] = [];

  for (const [gIdx, group] of groups.entries()) {
    if (group.line) {
      out.push({
        key: group.line.key,
        product: group.line.productId,
        productName: group.line.productName,
        sku: group.line.sku || undefined,
        order_item_id:
          idFromRef(group.line.item.order_item_id) || group.line.key,
        deliveredQty: Number(group.line.deliveredQty) || 0,
        cleared_qty: clearedQtyOf(group.line),
        remarks: String(group.line.item.remarks ?? ""),
      });
      continue;
    }

    const kitProductId =
      group.parent?.productId || group.kitHeader?.productId || "";
    if (!kitProductId) {
      for (const bucket of group.buckets) {
        out.push({
          key: bucket.key,
          product: bucket.productId,
          productName: bucket.productName,
          sku: bucket.sku || undefined,
          order_item_id: idFromRef(bucket.item.order_item_id) || bucket.key,
          kit_parent_product: bucket.kitParentProduct || undefined,
          is_kit_bucket: true,
          deliveredQty: Number(bucket.deliveredQty) || 0,
          cleared_qty: clearedQtyOf(bucket),
          remarks: String(bucket.item.remarks ?? ""),
        });
      }
      continue;
    }

    const kitLine = orderItems.find(
      (oi) =>
        idFromRef(oi.product) === kitProductId &&
        !idFromRef(oi.kit_parent_product),
    );
    const kitCleared = Math.max(
      0,
      Number(
        kitLine?.approved_quantity ??
          kitLine?.ordered_quantity ??
          kitLine?.quantity ??
          group.kitHeader?.orderedQty ??
          group.parent?.orderedQty ??
          0,
      ) || 0,
    );
    const kitDelivered = Number(
      group.parent?.deliveredQty ?? group.kitHeader?.deliveredQty ?? 0,
    );

    out.push({
      key: `__kit__${kitProductId}-${gIdx}`,
      product: kitProductId,
      productName: String(
        group.parent?.productName ||
          group.kitHeader?.productName ||
          kitLine?.product_name ||
          "Kit",
      ),
      sku: String(group.parent?.sku || group.kitHeader?.sku || kitLine?.sku || ""),
      is_kit_parent: true,
      deliveredQty: kitDelivered,
      cleared_qty: kitCleared,
      remarks: "",
    });

    for (const bucket of group.buckets) {
      out.push({
        key: bucket.key,
        product: bucket.productId,
        productName: bucket.productName,
        sku: bucket.sku || undefined,
        order_item_id: idFromRef(bucket.item.order_item_id) || bucket.key,
        kit_parent_product: kitProductId,
        is_kit_bucket: true,
        deliveredQty: Number(bucket.deliveredQty) || 0,
        cleared_qty: clearedQtyOf(bucket),
        remarks: String(bucket.item.remarks ?? ""),
      });
    }
  }

  return out;
}

function bucketPreviewRows(buckets: DeliveryItemDraft[]): AccountDispatchPreviewRow[] {
  return buckets.map((bucket) => {
    const orderItemId = bucket.order_item_id || bucket.key;
    const cleared = Math.max(0, Number(bucket.cleared_qty) || 0);
    return {
      orderItemId,
      productId: bucket.product || undefined,
      productName: bucket.productName,
      clearedQty: cleared,
      alreadyDispatched: 0,
      remaining: cleared,
      atWarehouseQty: 0,
      // Allow full BOM scale up to kit cleared qty.
      dispatchable: cleared > 0 ? cleared : Number.MAX_SAFE_INTEGER,
      kitParentProduct: bucket.kit_parent_product,
      isKitBucket: true,
      isKitParent: false,
    };
  });
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";

export function EditDeliveryModal({
  open,
  onClose,
  delivery,
  dispatches = [],
  orderItems = [],
  onSuccess,
}: EditDeliveryModalProps) {
  const [receivedBy, setReceivedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [items, setItems] = useState<DeliveryItemDraft[]>([]);
  const [patchDelivery, { isLoading }] = usePatchOrderDeliveryMutation();

  const deliveryId = delivery
    ? String(delivery._id ?? delivery.id ?? "")
    : "";
  const deliveryNo = String(delivery?.delivery_no ?? "Delivery");

  const linkedDispatchId = delivery ? idFromRef(delivery.dispatch) : "";

  const dispatchFromList = useMemo(() => {
    if (!linkedDispatchId) return null;
    const fromProp =
      typeof delivery?.dispatch === "object" && delivery.dispatch !== null
        ? (delivery.dispatch as Record<string, unknown>)
        : null;
    if (dispatchItemsOf(fromProp).length > 0) return fromProp;
    return (
      dispatches.find(
        (d) => idFromRef(d._id ?? d.id) === linkedDispatchId,
      ) ?? fromProp
    );
  }, [delivery, dispatches, linkedDispatchId]);

  const needsDispatchFetch =
    open &&
    Boolean(linkedDispatchId) &&
    dispatchItemsOf(dispatchFromList).length === 0;

  const dispatchQ = useGetDispatchQuery(linkedDispatchId, {
    skip: !needsDispatchFetch,
  });

  const linkedDispatch = useMemo(() => {
    if (dispatchItemsOf(dispatchFromList).length > 0) return dispatchFromList;
    const fetched =
      dispatchQ.data && typeof dispatchQ.data === "object"
        ? (dispatchQ.data as Record<string, unknown>)
        : null;
    return fetched || dispatchFromList;
  }, [dispatchFromList, dispatchQ.data]);

  const seedFromDelivery = useCallback(
    (
      row: Record<string, unknown>,
      dispatchDoc: Record<string, unknown> | null,
    ) => {
      setReceivedBy(String(row.received_by ?? ""));
      setRemarks(String(row.remarks ?? ""));
      setDeliveryDate(
        toDateInput(row.actual_delivery_date ?? row.delivered_at),
      );
      const rawDeliveryItems = Array.isArray(row.delivery_items)
        ? (row.delivery_items as Record<string, unknown>[])
        : [];
      const rawDispatchItems = dispatchItemsOf(dispatchDoc);

      // Prefer linked dispatch structure (kit buckets + order_item_ids).
      const normalized =
        rawDispatchItems.length > 0
          ? normalizeFromLinkedDispatch(
              rawDeliveryItems,
              rawDispatchItems,
              orderItems,
            )
          : normalizeDeliveryItems(rawDeliveryItems, orderItems);

      const groups = nestDispatchLinesForDisplay(normalized, orderItems);
      const nestedDrafts = draftsFromNestedGroups(groups, orderItems);
      if (nestedDrafts.length > 0) {
        setItems(nestedDrafts);
        return;
      }
      setItems(
        normalized.map((item, idx) => ({
          key: String(item._id ?? item.id ?? `line-${idx}`),
          product: idFromRef(item.product),
          productName: String(item.product_name ?? "—"),
          order_item_id: idFromRef(item.order_item_id) || undefined,
          kit_parent_product: idFromRef(item.kit_parent_product) || undefined,
          is_kit_bucket: Boolean(idFromRef(item.kit_parent_product)),
          deliveredQty: Number(item.delivered_quantity ?? 0),
          cleared_qty: Number(item.dispatched_quantity ?? 0),
          remarks: String(item.remarks ?? ""),
        })),
      );
    },
    [orderItems],
  );

  useEffect(() => {
    if (!open || !delivery) return;
    if (needsDispatchFetch && dispatchQ.isFetching) return;
    seedFromDelivery(delivery, linkedDispatch);
  }, [
    open,
    delivery,
    linkedDispatch,
    needsDispatchFetch,
    dispatchQ.isFetching,
    seedFromDelivery,
  ]);

  const physicalItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !item.is_kit_parent && !item.key.startsWith("__kit__"),
      ),
    [items],
  );

  const canSubmit = useMemo(
    () =>
      Boolean(deliveryId) &&
      !isLoading &&
      physicalItems.length > 0 &&
      physicalItems.every((item) => item.product),
    [deliveryId, isLoading, physicalItems],
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleKitQtyChange = useCallback(
    (kitLine: DeliveryItemDraft, nextKitQty: number) => {
      const kitProductId = kitLine.product || "";
      const kitCleared = Math.max(0, Number(kitLine.cleared_qty) || 0);
      const maxQty = kitCleared > 0 ? kitCleared : Number.MAX_SAFE_INTEGER;
      const kitQty = Math.min(maxQty, Math.max(0, Number(nextKitQty) || 0));

      setItems((prev) => {
        const buckets = prev.filter(
          (row) =>
            row.is_kit_bucket && row.kit_parent_product === kitProductId,
        );

        // Without a kit cleared base we cannot compute BOM % — only update header.
        if (!(kitCleared > 0) || buckets.length === 0) {
          return prev.map((row) =>
            row.key === kitLine.key ? { ...row, deliveredQty: kitQty } : row,
          );
        }

        const bucketQtys = applyKitDispatchQtyToBuckets(
          kitQty,
          kitCleared,
          bucketPreviewRows(buckets),
        );

        return prev.map((row) => {
          if (row.key === kitLine.key) {
            return { ...row, deliveredQty: kitQty };
          }
          const lineId = row.order_item_id || row.key;
          if (row.is_kit_bucket && lineId in bucketQtys) {
            return {
              ...row,
              deliveredQty: bucketQtys[lineId] ?? 0,
            };
          }
          return row;
        });
      });
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!deliveryId) return;
    try {
      const isoDate = deliveryDate
        ? new Date(`${deliveryDate}T12:00:00`).toISOString()
        : undefined;
      await patchDelivery({
        id: deliveryId,
        patch: {
          received_by: receivedBy.trim() || undefined,
          remarks: remarks.trim() || undefined,
          actual_delivery_date: isoDate,
          delivered_at: isoDate,
          // Kit headers are UI-only — persist buckets / individuals only.
          delivery_items: physicalItems.map((item) => ({
            product: item.product,
            ...(item.order_item_id && !item.order_item_id.startsWith("__kit__")
              ? { order_item_id: item.order_item_id }
              : {}),
            ...(item.kit_parent_product
              ? { kit_parent_product: item.kit_parent_product }
              : {}),
            delivered_quantity: Math.max(0, Number(item.deliveredQty) || 0),
            remarks: item.remarks.trim() || undefined,
          })),
        },
      }).unwrap();
      toast.success("Delivery updated successfully.");
      onSuccess?.();
      handleClose();
    } catch (error) {
      toast.error(mutationRejectedMessage(error));
    }
  }, [
    deliveryId,
    deliveryDate,
    receivedBy,
    remarks,
    physicalItems,
    patchDelivery,
    onSuccess,
    handleClose,
  ]);

  if (!open || !delivery) return null;

  return (
    <LargeModalBackdrop>
      <div className={largeModalPanelClass}>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-emerald-50/40 px-6 py-4 dark:border-white/5 dark:bg-emerald-950/10">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Edit delivery
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {deliveryNo} — items from the linked dispatch. Kit qty cascades to
              bucket lines.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-center w-32">Delivered Qty</th>
                  <th className="px-4 py-3">Line remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No delivery items on this record.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const isBucket = Boolean(item.is_kit_bucket);
                    const isKitParent = Boolean(item.is_kit_parent);
                    return (
                      <tr
                        key={item.key}
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
                            {item.productName}
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
                            {isKitParent ? (
                              <span className="mt-0.5 block text-2xs font-normal text-violet-600/80 dark:text-violet-300/80">
                                Edit kit qty — buckets update automatically
                              </span>
                            ) : null}
                            {item.sku ? (
                              <span className="mt-0.5 block text-2xs font-normal text-slate-400">
                                SKU {item.sku}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isBucket ? (
                            <span className="block text-center tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                              {item.deliveredQty}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={
                                isKitParent && item.cleared_qty > 0
                                  ? item.cleared_qty
                                  : undefined
                              }
                              step={1}
                              value={item.deliveredQty}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                const qty = Number.isFinite(next) ? next : 0;
                                if (isKitParent) {
                                  handleKitQtyChange(item, qty);
                                  return;
                                }
                                setItems((prev) =>
                                  prev.map((row) =>
                                    row.key === item.key
                                      ? {
                                          ...row,
                                          deliveredQty: Math.max(0, qty),
                                        }
                                      : row,
                                  ),
                                );
                              }}
                              disabled={isLoading}
                              className={`${inputClass} text-center tabular-nums ${
                                isKitParent
                                  ? "border-violet-300 dark:border-violet-700"
                                  : ""
                              }`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isKitParent ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <input
                              type="text"
                              value={item.remarks}
                              onChange={(event) => {
                                const next = event.target.value;
                                setItems((prev) =>
                                  prev.map((row) =>
                                    row.key === item.key
                                      ? { ...row, remarks: next }
                                      : row,
                                  ),
                                );
                              }}
                              disabled={isLoading || isBucket}
                              className={inputClass}
                            />
                          )}
                        </td>
                      </tr>
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
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Actual delivery date</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 md:col-span-2">
              <span>Delivery Remarks</span>
              <textarea
                rows={2}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Add delivery notes"
                className={`${inputClass} resize-none`}
              />
            </label>
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Saving…" : "Save delivery"}
          </button>
        </footer>
      </div>
    </LargeModalBackdrop>
  );
}

export default EditDeliveryModal;

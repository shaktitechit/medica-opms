"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { LargeModalBackdrop } from "@/components/portal/shared/LargeModalBackdrop";
import { largeModalPanelClass } from "@/components/portal/shared/modalLayout";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useGetDispatchQuery,
  usePatchOrderReturnMutation,
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

type EditReturnModalProps = {
  open: boolean;
  onClose: () => void;
  returnRecord: Record<string, unknown> | null;
  /** Order dispatches — returns are created against a dispatch batch. */
  dispatches?: Record<string, unknown>[];
  orderItems?: Record<string, unknown>[];
  onSuccess?: () => void;
};

type ReturnItemDraft = {
  key: string;
  product: string;
  productName: string;
  sku?: string;
  order_item_id?: string;
  kit_parent_product?: string;
  is_kit_parent?: boolean;
  is_kit_bucket?: boolean;
  cleared_qty: number;
  max_return_qty: number;
  returnedQty: number;
  returnReason: string;
  remarks: string;
  expiryType: "expiry" | "other";
  expiryDate: string;
};

const COMMON_REASONS = [
  "Customer Rejected / Refused Delivery",
  "Damaged Goods",
  "Incorrect Product Sent",
  "Expired Stock",
  "Shortage / Missing Items",
  "Quality Defect",
  "Other",
];

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

  const buckets = matches.filter((oi) => idFromRef(oi.kit_parent_product));
  if (buckets.length > 0) return buckets[0];
  return matches.find((oi) => !idFromRef(oi.kit_parent_product)) || matches[0];
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

function normalizeFromLinkedDispatch(
  returnItems: Record<string, unknown>[],
  dispatchItems: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  const returnedByProduct = new Map<
    string,
    {
      qty: number;
      reason: string;
      remarks: string;
      expiryType: string;
      expiryDate: unknown;
    }
  >();
  for (const item of returnItems) {
    const productId = idFromRef(item.product);
    if (!productId) continue;
    const prev = returnedByProduct.get(productId);
    returnedByProduct.set(productId, {
      qty: (prev?.qty || 0) + Number(item.returned_quantity ?? 0),
      reason: String(item.return_reason || prev?.reason || COMMON_REASONS[0]),
      remarks: String(item.remarks || prev?.remarks || ""),
      expiryType: String(item.expiry_type || prev?.expiryType || "other"),
      expiryDate: item.expiry_date ?? prev?.expiryDate,
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
      const saved = productId ? returnedByProduct.get(productId) : undefined;
      const returnedQty = saved != null ? saved.qty : 0;
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
        // Nest helper uses deliveredQty for kit inference — map returned qty there.
        delivered_quantity: returnedQty,
        returned_quantity: returnedQty,
        return_reason: saved?.reason ?? COMMON_REASONS[0],
        remarks: saved?.remarks ?? "",
        expiry_type: saved?.expiryType ?? "other",
        expiry_date: saved?.expiryDate,
      };
    })
    .filter((item) => Number(item.dispatched_quantity) > 0);
}

function normalizeReturnItemsOnly(
  items: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  return items.map((item) => {
    const matchItem = matchOrderLine(item, orderItems);
    const returnedQty = Number(item.returned_quantity ?? 0);
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
      dispatched_quantity: returnedQty,
      delivered_quantity: returnedQty,
      returned_quantity: returnedQty,
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

function draftsFromNestedGroups(
  groups: ReturnType<typeof nestDispatchLinesForDisplay>,
  orderItems: Record<string, unknown>[],
): ReturnItemDraft[] {
  const out: ReturnItemDraft[] = [];

  for (const [gIdx, group] of groups.entries()) {
    if (group.line) {
      const returnedQty = Number(
        group.line.deliveredQty ||
          group.line.item.returned_quantity ||
          0,
      );
      const dispatchedQty = Number(group.line.dispatchedQty || 0);
      out.push({
        key: group.line.key,
        product: group.line.productId,
        productName: group.line.productName,
        sku: group.line.sku || undefined,
        order_item_id:
          idFromRef(group.line.item.order_item_id) || group.line.key,
        returnedQty,
        cleared_qty: clearedQtyOf(group.line),
        max_return_qty: Math.max(dispatchedQty, returnedQty),
        returnReason: String(
          group.line.item.return_reason ?? COMMON_REASONS[0],
        ),
        remarks: String(group.line.item.remarks ?? ""),
        expiryType:
          group.line.item.expiry_type === "expiry" ? "expiry" : "other",
        expiryDate: toDateInput(group.line.item.expiry_date),
      });
      continue;
    }

    const kitProductId =
      group.parent?.productId || group.kitHeader?.productId || "";
    if (!kitProductId) {
      for (const bucket of group.buckets) {
        const returnedQty = Number(
          bucket.deliveredQty || bucket.item.returned_quantity || 0,
        );
        const dispatchedQty = Number(bucket.dispatchedQty || 0);
        out.push({
          key: bucket.key,
          product: bucket.productId,
          productName: bucket.productName,
          sku: bucket.sku || undefined,
          order_item_id: idFromRef(bucket.item.order_item_id) || bucket.key,
          kit_parent_product: bucket.kitParentProduct || undefined,
          is_kit_bucket: true,
          returnedQty,
          cleared_qty: clearedQtyOf(bucket),
          max_return_qty: Math.max(dispatchedQty, returnedQty),
          returnReason: String(bucket.item.return_reason ?? COMMON_REASONS[0]),
          remarks: String(bucket.item.remarks ?? ""),
          expiryType: bucket.item.expiry_type === "expiry" ? "expiry" : "other",
          expiryDate: toDateInput(bucket.item.expiry_date),
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
    const kitReturned = Number(
      group.parent?.deliveredQty ?? group.kitHeader?.deliveredQty ?? 0,
    );
    const kitDispatched = Number(
      group.parent?.dispatchedQty ?? group.kitHeader?.dispatchedQty ?? 0,
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
      sku: String(
        group.parent?.sku || group.kitHeader?.sku || kitLine?.sku || "",
      ),
      is_kit_parent: true,
      returnedQty: kitReturned,
      cleared_qty: kitCleared,
      max_return_qty: Math.max(kitDispatched, kitReturned, kitCleared),
      returnReason: COMMON_REASONS[0],
      remarks: "",
      expiryType: "other",
      expiryDate: "",
    });

    for (const bucket of group.buckets) {
      const returnedQty = Number(
        bucket.deliveredQty || bucket.item.returned_quantity || 0,
      );
      const dispatchedQty = Number(bucket.dispatchedQty || 0);
      out.push({
        key: bucket.key,
        product: bucket.productId,
        productName: bucket.productName,
        sku: bucket.sku || undefined,
        order_item_id: idFromRef(bucket.item.order_item_id) || bucket.key,
        kit_parent_product: kitProductId,
        is_kit_bucket: true,
        returnedQty,
        cleared_qty: clearedQtyOf(bucket),
        max_return_qty: Math.max(dispatchedQty, returnedQty),
        returnReason: String(bucket.item.return_reason ?? COMMON_REASONS[0]),
        remarks: String(bucket.item.remarks ?? ""),
        expiryType: bucket.item.expiry_type === "expiry" ? "expiry" : "other",
        expiryDate: toDateInput(bucket.item.expiry_date),
      });
    }
  }

  return out;
}

function bucketPreviewRows(
  buckets: ReturnItemDraft[],
): AccountDispatchPreviewRow[] {
  return buckets.map((bucket) => {
    const orderItemId = bucket.order_item_id || bucket.key;
    const cleared = Math.max(0, Number(bucket.cleared_qty) || 0);
    const maxQty = Math.max(cleared, Number(bucket.max_return_qty) || 0);
    return {
      orderItemId,
      productId: bucket.product || undefined,
      productName: bucket.productName,
      clearedQty: cleared > 0 ? cleared : maxQty,
      alreadyDispatched: 0,
      remaining: maxQty,
      atWarehouseQty: 0,
      dispatchable: maxQty > 0 ? maxQty : Number.MAX_SAFE_INTEGER,
      kitParentProduct: bucket.kit_parent_product,
      isKitBucket: true,
      isKitParent: false,
    };
  });
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";

export function EditReturnModal({
  open,
  onClose,
  returnRecord,
  dispatches = [],
  orderItems = [],
  onSuccess,
}: EditReturnModalProps) {
  const [returnedBy, setReturnedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [items, setItems] = useState<ReturnItemDraft[]>([]);
  const [patchReturn, { isLoading }] = usePatchOrderReturnMutation();

  const returnId = returnRecord
    ? String(returnRecord._id ?? returnRecord.id ?? "")
    : "";
  const returnNo = String(returnRecord?.return_no ?? "Return");

  const linkedDispatchId = returnRecord
    ? idFromRef(returnRecord.dispatch)
    : "";

  const dispatchFromList = useMemo(() => {
    if (!linkedDispatchId) return null;
    const fromProp =
      typeof returnRecord?.dispatch === "object" &&
      returnRecord.dispatch !== null
        ? (returnRecord.dispatch as Record<string, unknown>)
        : null;
    if (dispatchItemsOf(fromProp).length > 0) return fromProp;
    return (
      dispatches.find(
        (d) => idFromRef(d._id ?? d.id) === linkedDispatchId,
      ) ?? fromProp
    );
  }, [returnRecord, dispatches, linkedDispatchId]);

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

  const seedFromReturn = useCallback(
    (
      row: Record<string, unknown>,
      dispatchDoc: Record<string, unknown> | null,
    ) => {
      setReturnedBy(String(row.returned_by ?? ""));
      setRemarks(String(row.remarks ?? ""));
      setReceivedAt(toDateInput(row.received_at));
      const rawReturnItems = Array.isArray(row.return_items)
        ? (row.return_items as Record<string, unknown>[])
        : [];
      const rawDispatchItems = dispatchItemsOf(dispatchDoc);

      const normalized =
        rawDispatchItems.length > 0
          ? normalizeFromLinkedDispatch(
              rawReturnItems,
              rawDispatchItems,
              orderItems,
            )
          : normalizeReturnItemsOnly(rawReturnItems, orderItems);

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
          returnedQty: Number(item.returned_quantity ?? 0),
          cleared_qty: Number(item.dispatched_quantity ?? 0),
          max_return_qty: Number(item.dispatched_quantity ?? 0),
          returnReason: String(item.return_reason ?? COMMON_REASONS[0]),
          remarks: String(item.remarks ?? ""),
          expiryType: item.expiry_type === "expiry" ? "expiry" : "other",
          expiryDate: toDateInput(item.expiry_date),
        })),
      );
    },
    [orderItems],
  );

  useEffect(() => {
    if (!open || !returnRecord) return;
    if (needsDispatchFetch && dispatchQ.isFetching) return;
    seedFromReturn(returnRecord, linkedDispatch);
  }, [
    open,
    returnRecord,
    linkedDispatch,
    needsDispatchFetch,
    dispatchQ.isFetching,
    seedFromReturn,
  ]);

  const physicalItems = useMemo(
    () =>
      items.filter(
        (item) => !item.is_kit_parent && !item.key.startsWith("__kit__"),
      ),
    [items],
  );

  const payloadItems = useMemo(
    () =>
      physicalItems.filter(
        (item) => item.product && Number(item.returnedQty) >= 1,
      ),
    [physicalItems],
  );

  const canSubmit = useMemo(
    () => Boolean(returnId) && !isLoading && payloadItems.length > 0,
    [returnId, isLoading, payloadItems.length],
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const updateItem = useCallback(
    (key: string, patch: Partial<ReturnItemDraft>) => {
      setItems((prev) =>
        prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const handleKitQtyChange = useCallback(
    (kitLine: ReturnItemDraft, nextKitQty: number) => {
      const kitProductId = kitLine.product || "";
      const kitCleared = Math.max(0, Number(kitLine.cleared_qty) || 0);
      const maxQty =
        kitLine.max_return_qty > 0
          ? kitLine.max_return_qty
          : kitCleared > 0
            ? kitCleared
            : Number.MAX_SAFE_INTEGER;
      const kitQty = Math.min(maxQty, Math.max(0, Number(nextKitQty) || 0));

      setItems((prev) => {
        const buckets = prev.filter(
          (row) =>
            row.is_kit_bucket && row.kit_parent_product === kitProductId,
        );
        if (!(kitCleared > 0) || buckets.length === 0) {
          return prev.map((row) =>
            row.key === kitLine.key ? { ...row, returnedQty: kitQty } : row,
          );
        }

        const bucketQtys = applyKitDispatchQtyToBuckets(
          kitQty,
          kitCleared,
          bucketPreviewRows(buckets),
        );

        // Cascade reason/expiry from kit header onto buckets when kit qty set.
        return prev.map((row) => {
          if (row.key === kitLine.key) {
            return { ...row, returnedQty: kitQty };
          }
          const lineId = row.order_item_id || row.key;
          if (row.is_kit_bucket && lineId in bucketQtys) {
            return {
              ...row,
              returnedQty: bucketQtys[lineId] ?? 0,
              returnReason: kitLine.returnReason || row.returnReason,
              expiryType: kitLine.expiryType,
              expiryDate: kitLine.expiryDate,
            };
          }
          return row;
        });
      });
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!returnId) return;
    if (payloadItems.length === 0) {
      toast.error("Keep at least one return line with quantity 1 or more.");
      return;
    }
    const missingExpiry = payloadItems.find(
      (item) => item.expiryType === "expiry" && !item.expiryDate,
    );
    if (missingExpiry) {
      toast.error(`Please select an expiry date for ${missingExpiry.productName}.`);
      return;
    }
    try {
      const isoReceived = receivedAt
        ? new Date(`${receivedAt}T12:00:00`).toISOString()
        : undefined;
      await patchReturn({
        id: returnId,
        patch: {
          returned_by: returnedBy.trim() || undefined,
          remarks: remarks.trim() || undefined,
          received_at: isoReceived,
          // Kit headers are UI-only — persist buckets / individuals only.
          return_items: payloadItems.map((item) => ({
            product: item.product,
            returned_quantity: Math.max(1, Number(item.returnedQty) || 1),
            return_reason: item.returnReason.trim() || undefined,
            remarks: item.remarks.trim() || undefined,
            expiry_type: item.expiryType,
            expiry_date:
              item.expiryType === "expiry" && item.expiryDate
                ? new Date(`${item.expiryDate}T12:00:00`).toISOString()
                : undefined,
          })),
        },
      }).unwrap();
      toast.success("Return updated successfully.");
      onSuccess?.();
      handleClose();
    } catch (error) {
      toast.error(mutationRejectedMessage(error));
    }
  }, [
    returnId,
    payloadItems,
    receivedAt,
    returnedBy,
    remarks,
    patchReturn,
    onSuccess,
    handleClose,
  ]);

  if (!open || !returnRecord) return null;

  return (
    <LargeModalBackdrop>
      <div className={largeModalPanelClass}>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-rose-50/40 px-6 py-4 dark:border-white/5 dark:bg-rose-950/10">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Edit return
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {returnNo} — items from the linked dispatch. Kit qty cascades to
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
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-center w-28">Returned Qty</th>
                  <th className="px-4 py-3 w-48">Return reason</th>
                  <th className="px-4 py-3 w-32">Expiry / other</th>
                  <th className="px-4 py-3 w-36">Expiry date</th>
                  <th className="px-4 py-3">Line remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No return items on this record.
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
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isBucket ? (
                            <span className="block text-center tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                              {item.returnedQty}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={
                                item.max_return_qty > 0
                                  ? item.max_return_qty
                                  : undefined
                              }
                              step={1}
                              value={item.returnedQty}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                const qty = Number.isFinite(next) ? next : 0;
                                if (isKitParent) {
                                  handleKitQtyChange(item, qty);
                                  return;
                                }
                                updateItem(item.key, {
                                  returnedQty: Math.max(0, qty),
                                });
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
                          {isKitParent || isBucket ? (
                            isKitParent ? (
                              <select
                                value={item.returnReason}
                                onChange={(event) => {
                                  const reason = event.target.value;
                                  setItems((prev) =>
                                    prev.map((row) => {
                                      if (row.key === item.key) {
                                        return { ...row, returnReason: reason };
                                      }
                                      if (
                                        row.is_kit_bucket &&
                                        row.kit_parent_product === item.product
                                      ) {
                                        return { ...row, returnReason: reason };
                                      }
                                      return row;
                                    }),
                                  );
                                }}
                                className={inputClass}
                              >
                                {!COMMON_REASONS.includes(item.returnReason) ? (
                                  <option value={item.returnReason}>
                                    {item.returnReason}
                                  </option>
                                ) : null}
                                {COMMON_REASONS.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {reason}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-slate-500">
                                {item.returnReason}
                              </span>
                            )
                          ) : (
                            <select
                              value={item.returnReason}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  returnReason: event.target.value,
                                })
                              }
                              className={inputClass}
                            >
                              {!COMMON_REASONS.includes(item.returnReason) ? (
                                <option value={item.returnReason}>
                                  {item.returnReason}
                                </option>
                              ) : null}
                              {COMMON_REASONS.map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isBucket ? (
                            <span className="text-slate-500">
                              {item.expiryType === "expiry" ? "Expiry" : "Other"}
                            </span>
                          ) : (
                            <select
                              value={item.expiryType}
                              onChange={(event) => {
                                const type =
                                  event.target.value === "expiry"
                                    ? "expiry"
                                    : "other";
                                if (isKitParent) {
                                  setItems((prev) =>
                                    prev.map((row) => {
                                      if (
                                        row.key === item.key ||
                                        (row.is_kit_bucket &&
                                          row.kit_parent_product ===
                                            item.product)
                                      ) {
                                        return {
                                          ...row,
                                          expiryType: type,
                                          expiryDate:
                                            type === "other"
                                              ? ""
                                              : row.expiryDate,
                                        };
                                      }
                                      return row;
                                    }),
                                  );
                                  return;
                                }
                                updateItem(item.key, {
                                  expiryType: type,
                                  expiryDate:
                                    type === "other" ? "" : item.expiryDate,
                                });
                              }}
                              className={inputClass}
                            >
                              <option value="other">Other</option>
                              <option value="expiry">Expiry</option>
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isBucket ? (
                            <span className="text-slate-500">
                              {item.expiryDate || "—"}
                            </span>
                          ) : (
                            <input
                              type="date"
                              disabled={item.expiryType !== "expiry"}
                              value={item.expiryDate}
                              onChange={(event) => {
                                const date = event.target.value;
                                if (isKitParent) {
                                  setItems((prev) =>
                                    prev.map((row) => {
                                      if (
                                        row.key === item.key ||
                                        (row.is_kit_bucket &&
                                          row.kit_parent_product ===
                                            item.product)
                                      ) {
                                        return { ...row, expiryDate: date };
                                      }
                                      return row;
                                    }),
                                  );
                                  return;
                                }
                                updateItem(item.key, { expiryDate: date });
                              }}
                              className={`${inputClass} disabled:opacity-50`}
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
                              onChange={(event) =>
                                updateItem(item.key, {
                                  remarks: event.target.value,
                                })
                              }
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
              <span>Returned By</span>
              <input
                type="text"
                value={returnedBy}
                onChange={(event) => setReturnedBy(event.target.value)}
                placeholder="Driver, agent, or client representative"
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Received at warehouse</span>
              <input
                type="date"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 md:col-span-2">
              <span>Overall return remarks</span>
              <textarea
                rows={2}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Comments regarding this return"
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
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Saving…" : "Save return"}
          </button>
        </footer>
      </div>
    </LargeModalBackdrop>
  );
}

export default EditReturnModal;

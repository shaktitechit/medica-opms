"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useListDispatchesQuery,
  useListTransportsQuery,
  useListOrderDeliveriesQuery,
  useCreateOrderReturnMutation,
} from "@/store/api";
import { ORDER_RETURN_STATUS } from "@/constants/orderReturnStatus";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import { LargeModalBackdrop } from "@/components/portal/shared/LargeModalBackdrop";
import { largeModalPanelClass } from "@/components/portal/shared/modalLayout";
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

interface CreateReturnModalProps {
  open: boolean;
  onClose: () => void;
  orderId?: string;
  orderItems?: Record<string, unknown>[];
  formatDate: (v: unknown) => string;
  onCreated?: () => void;
}

type ReturnDraft = {
  key: string;
  product: string;
  productName: string;
  sku?: string;
  order_item_id?: string;
  kit_parent_product?: string;
  is_kit_parent?: boolean;
  is_kit_bucket?: boolean;
  dispatchedQty: number;
  deliveredQty: number | null;
  prevReturnedQty: number;
  maxNewReturn: number;
  cleared_qty: number;
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

function pickList(raw: unknown): Record<string, any>[] {
  if (Array.isArray(raw)) return raw as Record<string, any>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, any>;
    if (Array.isArray(o.items)) return o.items as Record<string, any>[];
    if (Array.isArray(o.data)) return o.data as Record<string, any>[];
  }
  return [];
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

function normalizeDispatchForReturn(
  dispatchItems: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
  deliveryItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  const deliveredByProduct = new Map<string, number>();
  for (const di of deliveryItems) {
    const pid = idFromRef(di.product);
    if (!pid) continue;
    deliveredByProduct.set(
      pid,
      (deliveredByProduct.get(pid) || 0) + Number(di.delivered_quantity ?? 0),
    );
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
      const prevReturned = Number(item.returned_quantity ?? 0);
      const delivered =
        productId && deliveredByProduct.has(productId)
          ? deliveredByProduct.get(productId)!
          : null;
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
        delivered_quantity: delivered ?? 0,
        returned_quantity: prevReturned,
        _delivered_known: delivered !== null,
      };
    })
    .filter((item) => Number(item.dispatched_quantity) > 0);
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
): ReturnDraft[] {
  const out: ReturnDraft[] = [];

  for (const [gIdx, group] of groups.entries()) {
    if (group.line) {
      const dispatchedQty = Number(group.line.dispatchedQty || 0);
      const prevReturned = Number(group.line.returnedQty || 0);
      const maxNew = Math.max(0, dispatchedQty - prevReturned);
      const deliveredKnown = group.line.item._delivered_known === true;
      out.push({
        key: group.line.key,
        product: group.line.productId,
        productName: group.line.productName,
        sku: group.line.sku || undefined,
        order_item_id:
          idFromRef(group.line.item.order_item_id) || group.line.key,
        dispatchedQty,
        deliveredQty: deliveredKnown ? Number(group.line.deliveredQty || 0) : null,
        prevReturnedQty: prevReturned,
        maxNewReturn: maxNew,
        cleared_qty: clearedQtyOf(group.line),
        returnedQty: 0,
        returnReason: COMMON_REASONS[0],
        remarks: "",
        expiryType: "other",
        expiryDate: "",
      });
      continue;
    }

    const kitProductId =
      group.parent?.productId || group.kitHeader?.productId || "";
    if (!kitProductId) {
      for (const bucket of group.buckets) {
        const dispatchedQty = Number(bucket.dispatchedQty || 0);
        const prevReturned = Number(bucket.returnedQty || 0);
        const maxNew = Math.max(0, dispatchedQty - prevReturned);
        const deliveredKnown = bucket.item._delivered_known === true;
        out.push({
          key: bucket.key,
          product: bucket.productId,
          productName: bucket.productName,
          sku: bucket.sku || undefined,
          order_item_id: idFromRef(bucket.item.order_item_id) || bucket.key,
          kit_parent_product: bucket.kitParentProduct || undefined,
          is_kit_bucket: true,
          dispatchedQty,
          deliveredQty: deliveredKnown
            ? Number(bucket.deliveredQty || 0)
            : null,
          prevReturnedQty: prevReturned,
          maxNewReturn: maxNew,
          cleared_qty: clearedQtyOf(bucket),
          returnedQty: 0,
          returnReason: COMMON_REASONS[0],
          remarks: "",
          expiryType: "other",
          expiryDate: "",
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
    const kitDispatched = Number(
      group.parent?.dispatchedQty ?? group.kitHeader?.dispatchedQty ?? 0,
    );
    const kitPrevReturned = Number(
      group.parent?.returnedQty ?? group.kitHeader?.returnedQty ?? 0,
    );
    const kitDelivered = Number(
      group.parent?.deliveredQty ?? group.kitHeader?.deliveredQty ?? 0,
    );
    const kitMax = Math.max(0, kitDispatched - kitPrevReturned);

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
      dispatchedQty: kitDispatched,
      deliveredQty: kitDelivered > 0 ? kitDelivered : null,
      prevReturnedQty: kitPrevReturned,
      maxNewReturn: kitMax,
      cleared_qty: kitCleared,
      returnedQty: 0,
      returnReason: COMMON_REASONS[0],
      remarks: "",
      expiryType: "other",
      expiryDate: "",
    });

    for (const bucket of group.buckets) {
      const dispatchedQty = Number(bucket.dispatchedQty || 0);
      const prevReturned = Number(bucket.returnedQty || 0);
      const maxNew = Math.max(0, dispatchedQty - prevReturned);
      const deliveredKnown = bucket.item._delivered_known === true;
      out.push({
        key: bucket.key,
        product: bucket.productId,
        productName: bucket.productName,
        sku: bucket.sku || undefined,
        order_item_id: idFromRef(bucket.item.order_item_id) || bucket.key,
        kit_parent_product: kitProductId,
        is_kit_bucket: true,
        dispatchedQty,
        deliveredQty: deliveredKnown
          ? Number(bucket.deliveredQty || 0)
          : null,
        prevReturnedQty: prevReturned,
        maxNewReturn: maxNew,
        cleared_qty: clearedQtyOf(bucket),
        returnedQty: 0,
        returnReason: COMMON_REASONS[0],
        remarks: "",
        expiryType: "other",
        expiryDate: "",
      });
    }
  }

  return out;
}

function bucketPreviewRows(buckets: ReturnDraft[]): AccountDispatchPreviewRow[] {
  return buckets.map((bucket) => {
    const orderItemId = bucket.order_item_id || bucket.key;
    const cleared = Math.max(0, Number(bucket.cleared_qty) || 0);
    const maxQty = Math.max(cleared, Number(bucket.maxNewReturn) || 0);
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

export function CreateReturnModal({
  open,
  onClose,
  orderId,
  orderItems = [],
  formatDate,
  onCreated,
}: CreateReturnModalProps) {
  const [createOrderReturn, { isLoading: isCreating }] =
    useCreateOrderReturnMutation();
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = String(currentUser?._id ?? currentUser?.id ?? "");

  const [selectedDispatchId, setSelectedDispatchId] = useState("");
  const [returnedByPerson, setReturnedByPerson] = useState("");
  const [overallRemarks, setOverallRemarks] = useState("");
  const [items, setItems] = useState<ReturnDraft[]>([]);

  const dispatchesQ = useListDispatchesQuery(
    orderId ? { order: orderId } : undefined,
    { skip: !orderId || !open },
  );
  const dispatchesList = pickList(dispatchesQ?.data);

  const transportsQ = useListTransportsQuery(
    selectedDispatchId ? { dispatch: selectedDispatchId } : undefined,
    { skip: !selectedDispatchId || !open },
  );
  const transportsList = pickList(transportsQ?.data);
  const activeTransport =
    transportsList.find((tr) => tr.shipment_status !== "returned") ||
    transportsList[0];
  const transportId = activeTransport
    ? String(activeTransport._id ?? activeTransport.id ?? "")
    : "";

  const deliveriesQ = useListOrderDeliveriesQuery(
    transportId ? { transport: transportId } : undefined,
    { skip: !transportId || !open },
  );
  const deliveriesList = pickList(deliveriesQ?.data);
  const activeDelivery = deliveriesList[0];

  const selectedDispatch = dispatchesList.find(
    (d) => String(d._id ?? d.id ?? "") === selectedDispatchId,
  );

  useEffect(() => {
    if (!open) {
      setSelectedDispatchId("");
      setReturnedByPerson("");
      setOverallRemarks("");
      setItems([]);
    }
  }, [open]);

  useEffect(() => {
    if (!selectedDispatchId || !selectedDispatch) {
      setItems([]);
      return;
    }
    const dispatchItems = Array.isArray(selectedDispatch.dispatch_items)
      ? (selectedDispatch.dispatch_items as Record<string, unknown>[])
      : Array.isArray(selectedDispatch.items)
        ? (selectedDispatch.items as Record<string, unknown>[])
        : [];
    const deliveryItems =
      activeDelivery && Array.isArray(activeDelivery.delivery_items)
        ? (activeDelivery.delivery_items as Record<string, unknown>[])
        : [];
    const normalized = normalizeDispatchForReturn(
      dispatchItems,
      orderItems,
      deliveryItems,
    );
    const groups = nestDispatchLinesForDisplay(normalized, orderItems);
    setItems(draftsFromNestedGroups(groups, orderItems));
  }, [selectedDispatchId, selectedDispatch, orderItems, activeDelivery]);

  const updateItem = useCallback(
    (key: string, patch: Partial<ReturnDraft>) => {
      setItems((prev) =>
        prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const handleKitQtyChange = useCallback(
    (kitLine: ReturnDraft, nextKitQty: number) => {
      const kitProductId = kitLine.product || "";
      const kitCleared = Math.max(0, Number(kitLine.cleared_qty) || 0);
      const maxQty =
        kitLine.maxNewReturn > 0
          ? kitLine.maxNewReturn
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

        return prev.map((row) => {
          if (row.key === kitLine.key) {
            return { ...row, returnedQty: kitQty };
          }
          const lineId = row.order_item_id || row.key;
          if (row.is_kit_bucket && lineId in bucketQtys) {
            return {
              ...row,
              returnedQty: Math.min(
                row.maxNewReturn,
                bucketQtys[lineId] ?? 0,
              ),
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

  const physicalItems = useMemo(
    () =>
      items.filter(
        (item) => !item.is_kit_parent && !item.key.startsWith("__kit__"),
      ),
    [items],
  );

  const handleCreateReturnSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!selectedDispatchId) {
      toast.error("Please select a dispatch batch.");
      return;
    }
    if (!returnedByPerson.trim()) {
      toast.error("Please specify the returning person's name.");
      return;
    }

    const payloadItems: Record<string, unknown>[] = [];
    let validationFailed = false;

    for (const item of physicalItems) {
      if (!(item.returnedQty > 0)) continue;
      if (item.expiryType === "expiry" && !item.expiryDate) {
        toast.error(
          `Please select an expiry date for product: ${item.productName}`,
        );
        validationFailed = true;
        break;
      }
      payloadItems.push({
        product: item.product,
        returned_quantity: item.returnedQty,
        return_reason: item.returnReason,
        remarks: item.remarks.trim(),
        expiry_type: item.expiryType,
        expiry_date: item.expiryDate || undefined,
      });
    }

    if (validationFailed) return;

    if (payloadItems.length === 0) {
      toast.error(
        "Please select at least one item with a return quantity greater than 0.",
      );
      return;
    }

    const payload = {
      order: orderId,
      dispatch: selectedDispatchId,
      transport: transportId || undefined,
      delivery: activeDelivery?._id || activeDelivery?.id || undefined,
      return_items: payloadItems,
      returned_by: returnedByPerson.trim(),
      remarks: overallRemarks.trim() || undefined,
      return_status: ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE,
      received_at: new Date().toISOString(),
      ...(currentUserId ? { received_by: currentUserId } : {}),
    };

    try {
      await createOrderReturn(payload).unwrap();
      toast.success("Product return registered and received at warehouse.");
      onClose();
      onCreated?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  if (!open) return null;

  return (
    <LargeModalBackdrop>
      <div className={largeModalPanelClass}>
        <header className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-sans">
              Record Product Return
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              Select a dispatch, then enter return qtys. Kit qty cascades to
              bucket lines.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <form
          onSubmit={handleCreateReturnSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-6 text-xs font-sans"
        >
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Select Order Dispatch *
              </label>
              {dispatchesQ.isLoading ? (
                <p className="text-slate-500 italic">Loading dispatches...</p>
              ) : dispatchesList.length === 0 ? (
                <p className="text-rose-500 font-medium">
                  No dispatches found for this order.
                </p>
              ) : (
                <select
                  required
                  value={selectedDispatchId}
                  onChange={(e) => setSelectedDispatchId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                >
                  <option value="">-- Choose Dispatch --</option>
                  {dispatchesList
                    .filter(
                      (d) =>
                        d.dispatch_status !== "cancelled" &&
                        d.status !== "cancelled",
                    )
                    .map((d) => (
                      <option key={d._id ?? d.id} value={d._id ?? d.id}>
                        {d.dispatch_no || "Batch"} (Dispatched:{" "}
                        {formatDate(d.dispatched_at ?? d.dispatch_date)})
                      </option>
                    ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Returned By / Returning Person Name *
              </label>
              <input
                type="text"
                required
                value={returnedByPerson}
                onChange={(e) => setReturnedByPerson(e.target.value)}
                placeholder="E.g., Delivery Driver, Agent, Client Rep..."
                className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Overall Return Remarks
              </label>
              <input
                type="text"
                value={overallRemarks}
                onChange={(e) => setOverallRemarks(e.target.value)}
                placeholder="Comments regarding this return transaction..."
                className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>
          </div>

          {selectedDispatchId && (
            <div className="rounded-lg bg-slate-50/50 p-4 border border-slate-200/60 dark:bg-slate-950/20 dark:border-white/5 space-y-2.5">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-2xs">
                Auto-Fetched Logistics References
              </h4>
              {transportsQ.isFetching || deliveriesQ.isFetching ? (
                <div className="flex items-center gap-2 text-slate-500 italic">
                  Loading transport shipment and order delivery details...
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 text-slate-700 dark:text-slate-300">
                  <div>
                    <span className="font-bold text-2xs text-slate-400 block uppercase">
                      Transport Shipment
                    </span>
                    {activeTransport ? (
                      <div className="mt-1 space-y-0.5">
                        <div>
                          <span className="text-slate-500">Shipment No:</span>{" "}
                          <span className="font-mono font-semibold">
                            {activeTransport.shipment_no}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">
                            Transporter/Agent:
                          </span>{" "}
                          <span className="font-semibold">
                            {activeTransport.transporter_name ||
                              (activeTransport.transport_agent &&
                              typeof activeTransport.transport_agent ===
                                "object"
                                ? activeTransport.transport_agent.agent_name ||
                                  activeTransport.transport_agent.agent_code
                                : activeTransport.transport_agent) ||
                              "—"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic block mt-1">
                        No active transport linked to this dispatch.
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-2xs text-slate-400 block uppercase">
                      Order Delivery
                    </span>
                    {activeDelivery ? (
                      <div className="mt-1 space-y-0.5">
                        <div>
                          <span className="text-slate-500">Delivery No:</span>{" "}
                          <span className="font-mono font-semibold">
                            {activeDelivery.delivery_no}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Delivered At:</span>{" "}
                          <span className="font-semibold">
                            {formatDate(
                              activeDelivery.delivered_at ||
                                activeDelivery.actual_delivery_date,
                            )}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic block mt-1">
                        No delivery record for the linked transport yet.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedDispatchId && (
            <div className="space-y-2.5">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-2xs">
                Returned Quantity & Expiry/Rejection Registry
              </h4>
              {items.length === 0 ? (
                <p className="text-slate-500 italic text-center py-4">
                  This dispatch batch contains no products.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white dark:border-white/5 dark:bg-slate-950">
                  <table className="w-full text-left text-xs min-w-[960px]">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200/80 dark:border-white/5">
                      <tr>
                        <th className="px-4 py-3 min-w-[200px]">Product Name</th>
                        <th className="px-4 py-3 text-center w-26">Dispatched</th>
                        <th className="px-4 py-3 text-center w-26 text-emerald-600 dark:text-emerald-400">
                          Delivered
                        </th>
                        <th className="px-4 py-3 text-center w-28 text-rose-600 dark:text-rose-400">
                          Prev. Returned
                        </th>
                        <th className="px-4 py-3 text-center w-32">
                          New Return Qty *
                        </th>
                        <th className="px-4 py-3 w-36">Expiry/Other</th>
                        <th className="px-4 py-3 w-40">Expiry Date</th>
                        <th className="px-4 py-3 w-48">Return Reason</th>
                        <th className="px-4 py-3 min-w-[150px]">
                          Remarks / Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 dark:divide-white/5">
                      {items.map((item) => {
                        const isBucket = Boolean(item.is_kit_bucket);
                        const isKitParent = Boolean(item.is_kit_parent);
                        const fullyReturned =
                          item.prevReturnedQty >= item.dispatchedQty &&
                          item.dispatchedQty > 0;
                        const qtyReadOnly = isBucket;
                        const fieldsDisabled =
                          item.returnedQty === 0 || fullyReturned;

                        return (
                          <tr
                            key={item.key}
                            className={
                              fullyReturned
                                ? "bg-rose-50/30 dark:bg-rose-950/10 opacity-60"
                                : isBucket
                                  ? "bg-slate-50/80 dark:bg-slate-950/60"
                                  : isKitParent
                                    ? "bg-violet-50/40 dark:bg-violet-950/20"
                                    : "hover:bg-slate-50/30 dark:hover:bg-white/5"
                            }
                          >
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
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
                                {fullyReturned ? (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                                    Fully Returned
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-600 dark:text-slate-400">
                              {item.dispatchedQty}
                            </td>
                            <td className="px-4 py-3 text-center font-bold">
                              {item.deliveredQty !== null ? (
                                <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                  {item.deliveredQty}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {item.prevReturnedQty > 0 ? (
                                <span className="inline-flex items-center justify-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                                  {item.prevReturnedQty}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center">
                                {fullyReturned ? (
                                  <span className="text-2xs text-rose-500 italic font-medium">
                                    All returned
                                  </span>
                                ) : qtyReadOnly ? (
                                  <span className="font-bold text-rose-600 dark:text-rose-400">
                                    {item.returnedQty}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    max={item.maxNewReturn}
                                    value={item.returnedQty}
                                    onChange={(e) => {
                                      const parsed = parseInt(
                                        e.target.value,
                                        10,
                                      );
                                      const val = Math.min(
                                        item.maxNewReturn,
                                        Math.max(
                                          0,
                                          Number.isNaN(parsed) ? 0 : parsed,
                                        ),
                                      );
                                      if (isKitParent) {
                                        handleKitQtyChange(item, val);
                                      } else {
                                        updateItem(item.key, {
                                          returnedQty: val,
                                        });
                                      }
                                    }}
                                    className="w-20 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-50"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {isKitParent || !qtyReadOnly ? (
                                <select
                                  disabled={fieldsDisabled && !isKitParent}
                                  value={item.expiryType}
                                  onChange={(e) => {
                                    const type = e.target.value as
                                      | "expiry"
                                      | "other";
                                    const patch: Partial<ReturnDraft> = {
                                      expiryType: type,
                                      ...(type === "other"
                                        ? { expiryDate: "" }
                                        : {}),
                                    };
                                    if (isKitParent) {
                                      setItems((prev) =>
                                        prev.map((row) => {
                                          if (row.key === item.key) {
                                            return { ...row, ...patch };
                                          }
                                          if (
                                            row.is_kit_bucket &&
                                            row.kit_parent_product ===
                                              item.product
                                          ) {
                                            return { ...row, ...patch };
                                          }
                                          return row;
                                        }),
                                      );
                                    } else {
                                      updateItem(item.key, patch);
                                    }
                                  }}
                                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-50 disabled:opacity-50"
                                >
                                  <option value="other">Other</option>
                                  <option value="expiry">Expiry</option>
                                </select>
                              ) : (
                                <span className="text-slate-500">
                                  {item.expiryType === "expiry"
                                    ? "Expiry"
                                    : "Other"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {isKitParent || !qtyReadOnly ? (
                                <input
                                  type="date"
                                  disabled={
                                    (fieldsDisabled && !isKitParent) ||
                                    item.expiryType !== "expiry"
                                  }
                                  value={item.expiryDate || ""}
                                  onChange={(e) => {
                                    const expiryDate = e.target.value;
                                    if (isKitParent) {
                                      setItems((prev) =>
                                        prev.map((row) => {
                                          if (row.key === item.key) {
                                            return { ...row, expiryDate };
                                          }
                                          if (
                                            row.is_kit_bucket &&
                                            row.kit_parent_product ===
                                              item.product
                                          ) {
                                            return { ...row, expiryDate };
                                          }
                                          return row;
                                        }),
                                      );
                                    } else {
                                      updateItem(item.key, { expiryDate });
                                    }
                                  }}
                                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-50 disabled:opacity-40"
                                />
                              ) : (
                                <span className="text-slate-500">
                                  {item.expiryDate || "—"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {isKitParent || !qtyReadOnly ? (
                                <select
                                  disabled={fieldsDisabled && !isKitParent}
                                  value={item.returnReason}
                                  onChange={(e) => {
                                    const returnReason = e.target.value;
                                    if (isKitParent) {
                                      setItems((prev) =>
                                        prev.map((row) => {
                                          if (row.key === item.key) {
                                            return { ...row, returnReason };
                                          }
                                          if (
                                            row.is_kit_bucket &&
                                            row.kit_parent_product ===
                                              item.product
                                          ) {
                                            return { ...row, returnReason };
                                          }
                                          return row;
                                        }),
                                      );
                                    } else {
                                      updateItem(item.key, { returnReason });
                                    }
                                  }}
                                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-50 disabled:opacity-50"
                                >
                                  {COMMON_REASONS.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-slate-600 dark:text-slate-300">
                                  {item.returnReason}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {isKitParent ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <input
                                  type="text"
                                  disabled={fieldsDisabled}
                                  placeholder="Enter batch/expiry remarks..."
                                  value={item.remarks}
                                  onChange={(e) =>
                                    updateItem(item.key, {
                                      remarks: e.target.value,
                                    })
                                  }
                                  className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-50 disabled:opacity-50"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </form>

        <footer className="px-6 py-4 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 bg-slate-50 dark:bg-slate-950/20 font-sans">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isCreating}
            onClick={() => void handleCreateReturnSubmit()}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isCreating ? "Recording..." : "Record Return"}
          </button>
        </footer>
      </div>
    </LargeModalBackdrop>
  );
}

"use client";

import { Fragment, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  useListDispatchesQuery,
  useListOrderDeliveriesQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { EditDeliveryModal } from "../modals/EditDeliveryModal";
import {
  idFromRef,
  isKitShellDispatchSource,
  nestDispatchLinesForDisplay,
  type DispatchLineDisplay,
} from "../dispatchKitDisplay";

type DeliveriesTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
};

function pickList(raw: unknown): Record<string, any>[] {
  if (Array.isArray(raw)) return raw as Record<string, any>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, any>[];
    if (Array.isArray(o.data)) return o.data as Record<string, any>[];
  }
  return [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
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
  // components nest under KIT in the registry / edit form.
  const buckets = matches.filter((oi) => idFromRef(oi.kit_parent_product));
  if (buckets.length > 0) return buckets[0];
  return matches.find((oi) => !idFromRef(oi.kit_parent_product)) || matches[0];
}

/** True when delivery payload already has physical bucket lines for this kit. */
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

/** Normalize delivery lines so kit nesting / delivered inference works. */
function normalizeDeliveryItems(
  items: Record<string, unknown>[],
  orderItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  // Hide kit shells only when bucket lines for that kit are also present.
  // Legacy deliveries that stored kit shell products must still render.
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
      product: idFromRef(item.product) || idFromRef(matchItem?.product) || item.product,
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
      // Treat this delivery batch qty as the "dispatched" field for kit BOM reverse math.
      dispatched_quantity: deliveredQty,
      delivered_quantity: deliveredQty,
      remarks: item.remarks,
    };
  });
}

function ProductCell({
  name,
  sku,
  isKitParent,
  isKitBucket,
}: {
  name: string;
  sku?: string;
  isKitParent?: boolean;
  isKitBucket?: boolean;
}) {
  return (
    <div
      className={
        isKitBucket
          ? "ml-3 border-l-2 border-violet-300 pl-2 dark:border-violet-700"
          : undefined
      }
    >
      <span className="font-medium text-slate-900 dark:text-slate-100">{name}</span>
      {isKitParent ? (
        <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
          KIT
        </span>
      ) : null}
      {isKitBucket ? (
        <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
          KIT BUCKET
        </span>
      ) : null}
      {sku ? (
        <span className="mt-0.5 block text-2xs text-slate-400">SKU {sku}</span>
      ) : null}
    </div>
  );
}

function DeliveryLineRow({
  line,
  isBucket,
  remarks,
}: {
  line: DispatchLineDisplay;
  isBucket?: boolean;
  remarks?: string;
}) {
  const isKitParent = Boolean(line.isKitParent) && !isBucket;
  return (
    <tr
      className={
        isBucket
          ? "bg-slate-50/80 dark:bg-slate-950/60"
          : isKitParent
            ? "bg-violet-50/40 dark:bg-violet-950/20"
            : "hover:bg-slate-50/20 dark:hover:bg-white/5 transition bg-white dark:bg-slate-900"
      }
    >
      <td className="px-3 py-2">
        <ProductCell
          name={line.productName}
          sku={line.sku || undefined}
          isKitParent={isKitParent}
          isKitBucket={isBucket}
        />
      </td>
      <td className="px-3 py-2 text-center font-bold text-emerald-600 dark:text-emerald-400">
        {line.deliveredQty > 0 ? line.deliveredQty : "—"}
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        {isKitParent ? "—" : remarks || "—"}
      </td>
    </tr>
  );
}

export function DeliveriesTab({ orderId, detail, refetchOrder }: DeliveriesTabProps) {
  const deliveriesQ = useListOrderDeliveriesQuery({ order: orderId });
  const dispatchesQ = useListDispatchesQuery({ order: orderId });
  const deliveries = useMemo(() => pickList(deliveriesQ.data), [deliveriesQ.data]);
  const dispatches = useMemo(
    () => pickList(dispatchesQ.data) as Record<string, unknown>[],
    [dispatchesQ.data],
  );
  const isSuperAdmin = useAppSelector(
    (state) => state.auth.user?.department === "super_admin",
  );
  const [editingDelivery, setEditingDelivery] = useState<Record<string, any> | null>(
    null,
  );

  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Shipment Deliveries"
        description="View logged delivery completions, recipient details, and linked dispatch and transport references."
      >
        {deliveriesQ.isFetching ? (
          <p className="text-sm text-slate-500 font-sans">Loading deliveries...</p>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">
            No delivery records compiled for this order yet.
          </p>
        ) : (
          <div className="space-y-8 font-sans">
            {deliveries.map((del: Record<string, any>) => {
              const delId = String(del._id ?? del.id ?? "");
              const deliveryNo = del.delivery_no || "Delivery Record";
              const status = del.delivery_status || "pending";
              const items = Array.isArray(del.delivery_items)
                ? (del.delivery_items as Record<string, unknown>[])
                : [];
              const groups = nestDispatchLinesForDisplay(
                normalizeDeliveryItems(items, orderItems),
                orderItems,
              );

              const dispatchNo =
                del.dispatch && typeof del.dispatch === "object"
                  ? del.dispatch.dispatch_no
                  : "—";

              const transportNo =
                del.transport && typeof del.transport === "object"
                  ? del.transport.shipment_no || del.transport.vehicle_number
                  : "—";

              return (
                <div
                  key={delId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 hover:shadow-md transition duration-200"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {deliveryNo}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            status === "delivered"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          }`}
                        >
                          {String(status).replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Recorded: {formatDate(del.createdAt)}
                      </p>
                    </div>
                    {isSuperAdmin ? (
                      <button
                        type="button"
                        onClick={() => setEditingDelivery(del)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
                      >
                        Edit delivery
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-6 mt-4 sm:grid-cols-3">
                    <div className="sm:col-span-2 space-y-3">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Delivered Products Registry
                      </h5>
                      <div className="overflow-hidden rounded-lg border border-slate-200/60 dark:border-white/5">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200/60 dark:border-white/5">
                            <tr>
                              <th className="px-3 py-2">Product Name</th>
                              <th className="px-3 py-2 text-center w-28">Delivered Qty</th>
                              <th className="px-3 py-2">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                            {groups.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={3}
                                  className="px-3 py-4 text-center text-slate-500"
                                >
                                  No delivery items on this record.
                                </td>
                              </tr>
                            ) : (
                              groups.map((group, gIdx) => {
                                if (group.line) {
                                  return (
                                    <DeliveryLineRow
                                      key={group.line.key}
                                      line={group.line}
                                      remarks={String(
                                        group.line.item.remarks ?? "",
                                      )}
                                    />
                                  );
                                }

                                const headerLine: DispatchLineDisplay | null =
                                  group.parent
                                    ? {
                                        ...group.parent,
                                        isKitParent:
                                          group.parent.isKitParent ||
                                          group.buckets.length > 0,
                                      }
                                    : group.kitHeader
                                      ? {
                                          key: `kit-header-${group.kitHeader.productId}-${gIdx}`,
                                          item: {},
                                          productName: group.kitHeader.productName,
                                          sku: group.kitHeader.sku,
                                          orderedQty: group.kitHeader.orderedQty,
                                          dispatchedQty:
                                            group.kitHeader.dispatchedQty,
                                          deliveredQty:
                                            group.kitHeader.deliveredQty,
                                          returnedQty:
                                            group.kitHeader.returnedQty,
                                          remainingQty:
                                            group.kitHeader.remainingQty,
                                          productId: group.kitHeader.productId,
                                          kitParentProduct: "",
                                          isKitBucket: false,
                                          isKitParent: true,
                                        }
                                      : null;

                                return (
                                  <Fragment
                                    key={headerLine?.key ?? `group-${gIdx}`}
                                  >
                                    {headerLine ? (
                                      <DeliveryLineRow line={headerLine} />
                                    ) : null}
                                    {group.buckets.map((bucket) => (
                                      <DeliveryLineRow
                                        key={bucket.key}
                                        line={bucket}
                                        isBucket
                                        remarks={String(
                                          bucket.item.remarks ?? "",
                                        )}
                                      />
                                    ))}
                                  </Fragment>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-950/10 dark:border-white/5 text-xs">
                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Recipient Information
                        </span>
                        <div className="space-y-0.5">
                          <div>
                            <span className="text-slate-400">Received By: </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {del.received_by || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Actual Date: </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {formatDate(del.actual_delivery_date || del.delivered_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Linked References
                        </span>
                        <div className="space-y-0.5">
                          <div>
                            <span className="text-slate-400">Dispatch Batch: </span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {dispatchNo}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Transport: </span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {transportNo}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Overall Remarks
                        </span>
                        <p className="italic text-slate-700 dark:text-slate-300">
                          {del.remarks || "No overall remarks provided."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      <EditDeliveryModal
        open={editingDelivery !== null}
        onClose={() => setEditingDelivery(null)}
        delivery={editingDelivery}
        dispatches={dispatches}
        orderItems={orderItems}
        onSuccess={() => {
          void deliveriesQ.refetch();
          refetchOrder?.();
        }}
      />
    </div>
  );
}

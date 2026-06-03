import React, { useCallback, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  MapOrderLinePriceModal,
  type MapOrderLinePriceSuccess,
  type MapOrderLinePriceTarget,
} from "@/components/portal/shared/MapOrderLinePriceModal";
import {
  LineRateStatusBadge,
  rateLookupKey,
  resolveRateDisplayStatus,
} from "@/components/portal/shared/orderLineRateDisplay";
import {
  useCheckOrderRatesQuery,
  usePatchOrderMutation,
  useTransitionOrderMutation,
} from "@/store/api";
import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id ?? "").trim();
  }
  if (ref && typeof ref === "object" && "id" in ref) {
    return String((ref as { id: unknown }).id ?? "").trim();
  }
  return "";
}

interface OrderTabProps {
  detail: Record<string, unknown> | null;
  status: string;
  formatMoney: (v: unknown) => string;
  readOnlyItems: unknown[];
  refetchOrder?: () => void;
}

export function OrderTab({
  detail,
  status,
  formatMoney,
  readOnlyItems,
  refetchOrder,
}: OrderTabProps) {
  const orderId = String(detail?._id ?? detail?.id ?? "");
  const partyId = idFromRef(detail?.party);

  const rateCheckQ = useCheckOrderRatesQuery(orderId, { skip: !orderId });
  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();
  const [transitionOrder, { isLoading: isTransitioning }] =
    useTransitionOrderMutation();

  const [mapTarget, setMapTarget] = useState<MapOrderLinePriceTarget | null>(
    null,
  );
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const canMapPrice = status === "submitted" && Boolean(partyId);
  const canApprove = status === "submitted";

  const rateItemByLine = useMemo(() => {
    const map = new Map<string, CheckOrderRatesItem>();
    for (const item of rateCheckQ.data?.items ?? []) {
      map.set(rateLookupKey(item.product, item.applied_rate_type), item);
    }
    return map;
  }, [rateCheckQ.data]);

  const openMapModal = useCallback(
    (line: Record<string, unknown>) => {
      if (!canMapPrice) return;
      const productId = idFromRef(line.product);
      if (!productId) {
        toast.error("This line has no product reference.");
        return;
      }
      const appliedRateType = String(line.applied_rate_type ?? "SR");
      const rateItem = rateItemByLine.get(
        rateLookupKey(productId, appliedRateType),
      );
      setMapTarget({
        productId,
        productName: String(line.product_name ?? "Product"),
        sku: typeof line.sku === "string" ? line.sku : undefined,
        appliedRateType,
        unitPrice: Number(line.unit_price ?? 0),
        mappingId: rateItem?.mappingId ?? null,
        isMapped: Boolean(rateItem?.isMapped),
        hasRate: Boolean(rateItem?.hasRate),
      });
      setMapModalOpen(true);
    },
    [canMapPrice, rateItemByLine],
  );

  const closeMapModal = useCallback(() => {
    setMapModalOpen(false);
    setMapTarget(null);
  }, []);

  const handleMapPriceSuccess = useCallback(
    async (result: MapOrderLinePriceSuccess) => {
      if (!orderId || !detail || !Array.isArray(detail.order_items)) return;

      const orderItems = (detail.order_items as Record<string, unknown>[]).map(
        (item) => {
          const pid = idFromRef(item.product);
          const rt = String(item.applied_rate_type ?? "MANUAL");
          if (
            pid === result.productId &&
            rt === result.appliedRateType
          ) {
            return { ...item, unit_price: result.negotiatedRate };
          }
          return item;
        },
      );

      try {
        await patchOrder({
          id: orderId,
          patch: { order_items: orderItems },
        }).unwrap();
        toast.success("Line price updated to negotiated rate.");
        void rateCheckQ.refetch();
        refetchOrder?.();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [detail, orderId, patchOrder, rateCheckQ, refetchOrder],
  );

  const handleApprove = useCallback(async () => {
    if (!orderId) return;
    try {
      await transitionOrder({
        id: orderId,
        body: {
          next_status: "sales_approved",
          remarks: "Approved by admin after rate review.",
        },
      }).unwrap();
      toast.success("Order approved.");
      refetchOrder?.();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [orderId, transitionOrder, refetchOrder]);

  const financialBreakdown = useMemo(
    () => ({
      grandTotal: detail?.grand_total,
      subtotal: detail?.subtotal,
      gst: detail?.gst_amount,
      discount: detail?.discount_amount,
    }),
    [detail],
  );

  if (!detail) return null;

  const hasItems = readOnlyItems.length > 0;
  const busy = isPatching || isTransitioning;

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Order Items"
        description="Catalog lines, negotiated pricing status, map rates, and financial totals."
      >
        <div className="space-y-5 text-sm">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Line items
              </h3>
              {canApprove ? (
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                >
                  {isTransitioning ? "Approving…" : "Approve"}
                </button>
              ) : null}
            </div>

            {!hasItems ? (
              <p className="text-slate-500 dark:text-slate-400">No lines.</p>
            ) : (
              <div className="overflow-x-auto rounded-md ring-1 ring-slate-200/90 dark:ring-white/10">
                <table className="w-full min-w-[1020px] text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950">
                    <tr>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">Free</th>
                      <th className="px-3 py-2 font-medium">Rate type</th>
                      <th className="px-3 py-2 font-medium">Rate status</th>
                      <th className="px-3 py-2 font-medium text-right">
                        Price
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        Disc
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        GST
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        Line total
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        Pricing
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                    {readOnlyItems.map((lineRaw, idx) => {
                      const line = lineRaw as Record<string, unknown>;
                      const name =
                        typeof line.product_name === "string"
                          ? line.product_name
                          : "—";
                      const qty = line.ordered_quantity ?? line.quantity;
                      const price = line.unit_price;
                      const lt = line.total_amount;
                      const productId = idFromRef(line.product);
                      const rateType = String(
                        line.applied_rate_type ?? "MANUAL",
                      );
                      const rateItem = rateItemByLine.get(
                        rateLookupKey(productId, rateType),
                      );
                      const displayStatus = resolveRateDisplayStatus(rateItem);
                      const latestNegotiated =
                        rateItem?.hasRate &&
                        rateItem.currentMappedRate != null &&
                        Number.isFinite(Number(rateItem.currentMappedRate))
                          ? Number(rateItem.currentMappedRate)
                          : null;
                      const displayPrice =
                        latestNegotiated ?? price;
                      const key =
                        line._id != null ? String(line._id) : `line-${idx}`;

                      return (
                        <tr
                          key={key}
                          className="bg-white dark:bg-slate-900"
                        >
                          <td className="max-w-[200px] px-3 py-2">
                            <span className="line-clamp-2 font-medium">
                              {name}
                            </span>
                            {typeof line.sku === "string" && line.sku ? (
                              <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                                SKU {line.sku}
                              </span>
                            ) : null}
                            {typeof line.remarks === "string" &&
                            line.remarks.trim() ? (
                              <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                                {line.remarks}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {String(qty ?? "—")}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {String(
                              line.free_quantity ?? line.free_qty ?? "0",
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {rateType}
                          </td>
                          <td className="px-3 py-2">
                            <LineRateStatusBadge
                              status={displayStatus}
                              rateItem={rateItem}
                              formatMoney={formatMoney}
                            />
                          </td>
                          <td
                            className="px-3 py-2 text-right tabular-nums"
                            title={
                              latestNegotiated != null &&
                              Number(price) !== latestNegotiated
                                ? `Order line: ${formatMoney(price)} · Latest negotiated: ${formatMoney(latestNegotiated)}`
                                : undefined
                            }
                          >
                            {formatMoney(displayPrice)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {Number(line.discount_percent ?? 0) > 0
                              ? `${String(line.discount_percent)}%`
                              : formatMoney(line.discount_amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(line.gst_amount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono">
                            {formatMoney(lt)}
                          </td>
                          <td className="px-3 py-2 text-right">
                             {canMapPrice && productId ? (
                               <button
                                 type="button"
                                 onClick={() => openMapModal(line)}
                                 disabled={busy}
                                 className="inline-flex items-center justify-center rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer transition-colors"
                               >
                                 Map
                               </button>
                            ) : (
                              <span
                                className="text-[10px] text-slate-400 dark:text-slate-500"
                                title={
                                  status !== "submitted"
                                    ? "Mapping is locked after admin approval"
                                    : "Link a party to map prices"
                                }
                              >
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {status === "submitted" && !partyId ? (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                No party linked — map price requires a party on the order.
              </p>
            ) : null}
          </div>

          <div className="border-t border-slate-200/90 pt-5 dark:border-white/10">
            <div className="mb-3">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Financial Breakdown
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Aggregated totals and payment state.
              </p>
            </div>

            <div className="grid gap-3 text-sm font-normal font-sans sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Grand Total
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
                  {formatMoney(financialBreakdown.grandTotal)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Subtotal
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
                  {formatMoney(financialBreakdown.subtotal)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  GST
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
                  {formatMoney(financialBreakdown.gst)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Header Discount
                </span>
                <span className="mt-1 block font-mono text-base font-semibold text-rose-700 dark:text-rose-300">
                  -{formatMoney(financialBreakdown.discount)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DashboardCard>

      <MapOrderLinePriceModal
        open={mapModalOpen}
        onClose={closeMapModal}
        partyId={partyId}
        target={mapTarget}
        onSuccess={(result) => void handleMapPriceSuccess(result)}
      />
    </div>
  );
}

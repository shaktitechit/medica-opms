import React, { useCallback, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  MapOrderLinePriceModal,
  type MapOrderLinePriceSuccess,
  type MapOrderLinePriceTarget,
} from "@/components/portal/shared/MapOrderLinePriceModal";
import {
  useCheckOrderRatesQuery,
  usePatchOrderMutation,
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

function rateLookupKey(productId: string, rateType: string): string {
  return `${productId}:${rateType || "MANUAL"}`;
}

type RateDisplayStatus = "negotiated" | "expired" | "not_negotiated";

function resolveRateDisplayStatus(
  item: CheckOrderRatesItem | undefined,
): RateDisplayStatus {
  if (!item) return "not_negotiated";
  if (item.hasRate && item.isMapped) return "negotiated";
  if (item.isRateExpired) return "expired";
  return "not_negotiated";
}

function formatValidityDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function LineRateStatusBadge({
  status,
  rateItem,
  formatMoney,
}: {
  status: RateDisplayStatus;
  rateItem: CheckOrderRatesItem | undefined;
  formatMoney: (v: unknown) => string;
}) {
  const mappedRate =
    rateItem?.currentMappedRate != null
      ? formatMoney(rateItem.currentMappedRate)
      : null;
  const validityEnd = formatValidityDate(rateItem?.validityEnd);

  if (status === "negotiated") {
    return (
      <span
        className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20"
        title={
          mappedRate
            ? `Negotiated at ${mappedRate}${validityEnd ? ` · valid until ${validityEnd}` : ""}`
            : "Mapped with an active negotiated rate"
        }
      >
        Negotiated
      </span>
    );
  }

  if (status === "expired") {
    return (
      <span
        className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/25"
        title={
          validityEnd
            ? `Negotiated period expired${mappedRate ? ` · last rate ${mappedRate}` : ""} · ended ${validityEnd}`
            : "Mapped rate exists but the negotiated period has expired"
        }
      >
        Expired
      </span>
    );
  }

  return (
    <span
      className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-500/20"
      title="No active mapped rate for this party, product, and rate type"
    >
      Not negotiated
    </span>
  );
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

  const [mapTarget, setMapTarget] = useState<MapOrderLinePriceTarget | null>(
    null,
  );
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const canMapPrice = status === "finance_review" && Boolean(partyId);

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
          if (pid === result.productId && rt === result.appliedRateType) {
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
  const busy = isPatching;

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Order Items"
        description="Catalog lines, negotiated pricing status, map rates, and financial totals."
      >
        <div className="space-y-5 text-sm">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Line items
            </h3>

            {!hasItems ? (
              <p className="text-slate-500 dark:text-slate-400">No lines.</p>
            ) : (
              <>
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
                        const displayStatus =
                          resolveRateDisplayStatus(rateItem);
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
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatMoney(price)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatMoney(line.discount_amount)}
                              {Number(line.discount_percent || 0) > 0 ? (
                                <span className="block text-[10px] text-slate-500">
                                  ({String(line.discount_percent)}%)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatMoney(line.gst_amount)}
                              <span className="block text-[10px] text-slate-500">
                                ({String(line.gst_percent ?? "—")}%)
                              </span>
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
                                  className="text-blue-600 underline decoration-blue-600/40 underline-offset-2 hover:decoration-blue-600 disabled:opacity-40 dark:text-blue-400"
                                >
                                  Map price
                                </button>
                              ) : (
                                <span
                                  className="text-[10px] text-slate-400 dark:text-slate-500"
                                  title={
                                    status !== "finance_review"
                                      ? "Mapping is locked after finance review"
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

                {status === "finance_review" && !partyId ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    No party linked — map price requires a party on the order.
                  </p>
                ) : null}

                <div className="mt-4">
                  <div className="w-full rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-slate-900/50">
                    <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Financial Summary
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-xs font-sans font-normal sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-200/50 bg-white p-3 dark:border-white/5 dark:bg-slate-950">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Subtotal
                        </span>
                        <span className="mt-1 block font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatMoney(financialBreakdown.subtotal)}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200/50 bg-white p-3 dark:border-white/5 dark:bg-slate-950">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          GST
                        </span>
                        <span className="mt-1 block font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatMoney(financialBreakdown.gst)}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200/50 bg-white p-3 dark:border-white/5 dark:bg-slate-950">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Discount
                        </span>
                        <span className="mt-1 block font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">
                          -{formatMoney(financialBreakdown.discount)}
                        </span>
                      </div>
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-900/30 dark:bg-indigo-950/20">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                          Grand Total
                        </span>
                        <span className="mt-1 block font-mono text-sm font-bold text-indigo-900 dark:text-indigo-100">
                          {formatMoney(financialBreakdown.grandTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
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

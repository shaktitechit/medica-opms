"use client";

import { useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import { useListOrderReturnsQuery, useListUsersQuery } from "@/store/api";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import { CloseAccountOrderModal } from "./CloseAccountOrderModal";
import { hasPendingReturns } from "@/components/portal/shared/returnSettlement";

type ReturnsTabProps = {
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

function productIdFromRef(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

export function ReturnsTab({ orderId, detail, refetchOrder }: ReturnsTabProps) {
  const returnsQ = useListOrderReturnsQuery({ order: orderId });
  const usersQ = useListUsersQuery({});
  const [closeReturnTarget, setCloseReturnTarget] = useState<Record<string, any> | null>(null);

  const returns = useMemo(() => pickList(returnsQ.data), [returnsQ.data]);
  const userNameById = useMemo(() => buildUserNameById(usersQ.data), [usersQ.data]);

  /** Account closure after returns — not the same as delivery "fulfilled". */
  const orderIsAccountClosed = useMemo(() => {
    const lifecycle = String(detail?.lifecycle_status ?? "").toLowerCase();
    return lifecycle === "closed" || Boolean(detail?.closed_at);
  }, [detail]);

  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const receivedReturns = useMemo(
    () => returns.filter((r) => String(r.return_status || "") === "received"),
    [returns],
  );

  const canSettleOrder =
    !orderIsAccountClosed &&
    receivedReturns.length > 0 &&
    !hasPendingReturns(returns);

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Product Returns"
        description="View logged customer rejections, returned product counts, return reasons, and warehouse processing status."
      >
        {canSettleOrder && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setCloseReturnTarget(receivedReturns[0])}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-[0.98] cursor-pointer"
            >
              Close & Settle Order
            </button>
          </div>
        )}
        {returnsQ.isFetching ? (
          <p className="text-sm text-slate-500 font-sans">Loading returns...</p>
        ) : returns.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">
            No return logs compiled for this order yet.
          </p>
        ) : (
          <div className="space-y-8 font-sans">
            {returns.map((ret: Record<string, any>) => {
              const retId = String(ret._id ?? ret.id ?? "");
              const returnNo = ret.return_no || "Return Record";
              const status = ret.return_status || "pending";
              const items = Array.isArray(ret.return_items) ? ret.return_items : [];

              const dispatchNo =
                ret.dispatch && typeof ret.dispatch === "object"
                  ? ret.dispatch.dispatch_no
                  : "—";

              const deliveryNo =
                ret.delivery && typeof ret.delivery === "object"
                  ? ret.delivery.delivery_no
                  : "—";

              const receivedByStaff =
                typeof ret.received_by === "object" && ret.received_by !== null
                  ? String(
                      (ret.received_by as Record<string, unknown>).name ??
                        (ret.received_by as Record<string, unknown>).username ??
                        "—",
                    )
                  : ret.received_by
                    ? userNameById[String(ret.received_by)] || "Staff"
                    : "—";

              return (
                <div
                  key={retId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 hover:shadow-md transition duration-200"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {returnNo}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            status === "received"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : status === "cancelled"
                                ? "bg-slate-50 text-slate-500 dark:bg-slate-900/20 dark:text-slate-400"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                          }`}
                        >
                          {String(status).replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Recorded: {formatDate(ret.createdAt)}
                      </p>
                    </div>

                    {status === "received" && !orderIsAccountClosed && hasPendingReturns(returns) && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        Awaiting other returns
                      </span>
                    )}

                    {(ret.order_closed_at || orderIsAccountClosed) && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Order closed
                      </span>
                    )}
                  </div>

                  <div className="grid gap-6 mt-4 sm:grid-cols-3">
                    <div className="sm:col-span-2 space-y-3">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Returned Products Registry
                      </h5>
                      <div className="overflow-hidden rounded-lg border border-slate-200/60 dark:border-white/5">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200/60 dark:border-white/5">
                            <tr>
                              <th className="px-3 py-2">Product Name</th>
                              <th className="px-3 py-2 text-center w-28">Returned Qty</th>
                              <th className="px-3 py-2">Reason & Inline Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                            {items.map((item: Record<string, any>, idx: number) => {
                              const itemProductId = productIdFromRef(item.product);
                              const matchItem = orderItems.find((oi) => {
                                const oiProductId = productIdFromRef(oi.product);
                                const lineId = String(oi._id ?? oi.id ?? "");
                                return (
                                  oiProductId === itemProductId ||
                                  lineId === String(item.order_item_id ?? "")
                                );
                              });
                              const productName =
                                matchItem?.product_name ||
                                (typeof item.product === "object"
                                  ? item.product?.product_name
                                  : null) ||
                                "—";

                              return (
                                <tr
                                  key={idx}
                                  className="hover:bg-slate-50/20 dark:hover:bg-white/5 transition"
                                >
                                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                                    {String(productName)}
                                  </td>
                                  <td className="px-3 py-2 text-center font-bold text-rose-600 dark:text-rose-400">
                                    {item.returned_quantity}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                    <div className="font-semibold text-slate-700 dark:text-slate-300">
                                      {item.return_reason || "Rejection"}
                                    </div>
                                    {item.remarks ? (
                                      <div className="text-[10px] italic mt-0.5">
                                        Note: {item.remarks}
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-950/10 dark:border-white/5 text-xs">
                      {status === "received" && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            Warehouse Receipt Info
                          </span>
                          <div className="space-y-0.5 mb-3">
                            <div>
                              <span className="text-slate-400">Returned By: </span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {ret.returned_by || "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">Received At: </span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {formatDate(ret.received_at)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">Received By: </span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {receivedByStaff}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Linked References
                        </span>
                        <div className="space-y-0.5">
                          <div>
                            <span className="text-slate-400">Dispatch No: </span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {dispatchNo}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Delivery Receipt: </span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {deliveryNo}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Overall Return Comments
                        </span>
                        <p className="italic text-slate-700 dark:text-slate-300">
                          {ret.remarks || "No overall comments provided."}
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

      {closeReturnTarget && (
        <CloseAccountOrderModal
          orderId={orderId}
          returnRecord={closeReturnTarget}
          detail={detail}
          allReturns={returns}
          onClose={() => setCloseReturnTarget(null)}
          onSuccess={refetchOrder}
        />
      )}
    </div>
  );
}

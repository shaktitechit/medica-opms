"use client";

import { useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  useListOrderReturnsQuery,
  useListUsersQuery,
  usePatchOrderReturnMutation,
} from "@/store/api";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import {
  ORDER_RETURN_STATUS,
  isReturnPending,
  isReturnReceivedAtWarehouse,
  normalizeReturnStatus,
  returnStatusBadgeClass,
  returnStatusLabel,
} from "@/constants/orderReturnStatus";
import { isOrderClosed } from "@/components/portal/sales/orderUtils";
import { useAppSelector } from "@/store/hooks";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";

type ReturnsTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
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

export function ReturnsTab({ orderId, detail }: ReturnsTabProps) {
  const returnsQ = useListOrderReturnsQuery({ order: orderId });
  const usersQ = useListUsersQuery({});
  const [patchOrderReturn, { isLoading: isPatching }] = usePatchOrderReturnMutation();
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = String(currentUser?._id ?? currentUser?.id ?? "");

  const [confirmReturnId, setConfirmReturnId] = useState<string | null>(null);
  const [returningPerson, setReturningPerson] = useState("");
  const [returnRemarks, setReturnRemarks] = useState("");

  const returns = useMemo(() => pickList(returnsQ.data), [returnsQ.data]);
  const userNameById = useMemo(() => buildUserNameById(usersQ.data), [usersQ.data]);

  const orderIsAccountClosed = useMemo(() => isOrderClosed(detail), [detail]);

  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const handleRefetch = () => {
    if (!returnsQ.isUninitialized) void returnsQ.refetch();
  };

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Product Returns"
        description="View logged customer rejections, returned product counts, return reasons, and warehouse processing status."
      >
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
              const status = normalizeReturnStatus(ret.return_status);
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
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${returnStatusBadgeClass(status)}`}
                        >
                          {returnStatusLabel(status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Recorded: {formatDate(ret.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isReturnPending(status) && !orderIsAccountClosed && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmReturnId(retId);
                            setReturningPerson(String(ret.returned_by || ""));
                            setReturnRemarks("");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-[0.98] cursor-pointer"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Receive at Warehouse
                        </button>
                      )}

                      {(ret.order_closed_at || orderIsAccountClosed) && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Order closed
                        </span>
                      )}
                    </div>
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
                      {isReturnReceivedAtWarehouse(status) && (
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

      {confirmReturnId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-sans">
              Receive Products in Warehouse
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-sans">
              Confirm receipt of the returned items back into warehouse inventory.
            </p>

            <div className="mt-4 space-y-4 font-sans text-xs">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Returned By / Returning Person Name *
                </label>
                <input
                  type="text"
                  required
                  value={returningPerson}
                  onChange={(e) => setReturningPerson(e.target.value)}
                  placeholder="E.g., Driver Name, Transport Agent, Client Rep..."
                  className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Overall Comments / Remarks{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  placeholder="Any warehouse entry notes..."
                  className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 resize-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 font-sans text-xs font-medium">
              <button
                type="button"
                onClick={() => setConfirmReturnId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPatching}
                onClick={async () => {
                  if (!returningPerson.trim()) {
                    toast.error("Please enter the name of the returning person.");
                    return;
                  }
                  try {
                    await patchOrderReturn({
                      id: confirmReturnId,
                      patch: {
                        return_status: ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE,
                        returned_by: returningPerson.trim(),
                        received_at: new Date().toISOString(),
                        received_by: currentUserId,
                        remarks: returnRemarks.trim() || undefined,
                      },
                    }).unwrap();
                    toast.success("Return marked as received at warehouse.");
                    setConfirmReturnId(null);
                    handleRefetch();
                  } catch (err) {
                    toast.error(mutationRejectedMessage(err));
                  }
                }}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isPatching ? "Updating..." : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

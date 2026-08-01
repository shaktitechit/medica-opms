"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  refId,
  toDateInput,
  formatDateOnly,
} from "./utils";

type OrderReturnsFormProps = {
  order: any;
  dispatches: any[];
  returns: any[];
  saving: boolean;
  onClose: () => void;
  onCreateReturn: (payload: Record<string, any>) => Promise<void>;
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

type ReturnItemDraft = {
  key: string;
  product: string;
  productName: string;
  dispatchedQty: number;
  returnedQty: number;
  returnReason: string;
  remarks: string;
  expiryType: "expiry" | "other";
  expiryDate: string;
};

export function OrderReturnsForm({
  order,
  dispatches,
  returns,
  saving,
  onClose,
  onCreateReturn,
}: OrderReturnsFormProps) {
  const orderId = refId(order._id || order.id);
  const sortedReturns = useMemo(
    () =>
      [...returns].sort((a, b) => {
        return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
      }),
    [returns],
  );

  const [selectedId, setSelectedId] = useState(() =>
    sortedReturns[0] ? refId(sortedReturns[0]._id || sortedReturns[0].id) : "new"
  );

  const selectedReturn = useMemo(
    () =>
      selectedId !== "new"
        ? sortedReturns.find((r) => refId(r._id || r.id) === selectedId) || null
        : null,
    [sortedReturns, selectedId],
  );

  // New return states
  const [dispatchId, setDispatchId] = useState("");
  const [returnedByPerson, setReturnedByPerson] = useState("");
  const [overallRemarks, setOverallRemarks] = useState("");
  const [newItems, setNewItems] = useState<ReturnItemDraft[]>([]);

  const selectedDispatchObj = useMemo(() => {
    if (!dispatchId) return null;
    return dispatches.find((d) => refId(d._id || d.id) === dispatchId) || null;
  }, [dispatchId, dispatches]);

  // Load dispatch items when selection changes
  useEffect(() => {
    if (selectedId !== "new") return;
    if (!selectedDispatchObj) {
      setNewItems([]);
      return;
    }

    const dispatchItems = Array.isArray(selectedDispatchObj.dispatch_items)
      ? selectedDispatchObj.dispatch_items
      : Array.isArray(selectedDispatchObj.items)
        ? selectedDispatchObj.items
        : [];

    const orderItems = order.order_items || [];

    const draftItems = dispatchItems.map((item: any, idx: number) => {
      const matchOrderItem = orderItems.find(
        (oi: any) => refId(oi._id || oi.id) === refId(item.order_item_id)
      );
      const prodName = matchOrderItem?.product_name || item.product_name || "—";
      const pId = refId(item.product || matchOrderItem?.product);
      const dispQty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
      const key = item.order_item_id || `${pId}-${idx}`;
      return {
        key,
        product: pId,
        productName: prodName,
        dispatchedQty: dispQty,
        returnedQty: 0,
        returnReason: "Customer Rejected / Refused Delivery",
        remarks: "",
        expiryType: "other" as const,
        expiryDate: "",
      };
    });
    setNewItems(draftItems);
  }, [selectedDispatchObj, selectedId, order.order_items]);

  const resetForm = useCallback(() => {
    setDispatchId(dispatches[0] ? refId(dispatches[0]._id || dispatches[0].id) : "");
    setReturnedByPerson("");
    setOverallRemarks("");
    setNewItems([]);
  }, [dispatches]);

  useEffect(() => {
    if (selectedId === "new") {
      resetForm();
    }
  }, [selectedId, resetForm]);

  const updateItemField = (key: string, field: keyof ReturnItemDraft, val: any) => {
    setNewItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: val } : item))
    );
  };

  const handleSave = async () => {
    if (selectedId !== "new") {
      toast.error("Editing existing logged returns is not supported.");
      return;
    }
    if (!dispatchId) {
      toast.error("Please select a dispatch batch.");
      return;
    }
    if (!returnedByPerson.trim()) {
      toast.error("Please specify who is returning the goods.");
      return;
    }

    const payloadItems = newItems
      .filter((item) => item.returnedQty > 0)
      .map((item) => {
        if (item.expiryType === "expiry" && !item.expiryDate) {
          throw new Error(`Expiry date is required for returned item: ${item.productName}`);
        }
        return {
          product: item.product,
          returned_quantity: item.returnedQty,
          return_reason: item.returnReason,
          remarks: item.remarks.trim(),
          expiry_type: item.expiryType,
          expiry_date: item.expiryDate || undefined,
        };
      });

    if (payloadItems.length === 0) {
      toast.error("Please enter a return quantity for at least one item.");
      return;
    }

    try {
      const payload = {
        order: orderId,
        dispatch: dispatchId,
        return_items: payloadItems,
        returned_by_person: returnedByPerson.trim(),
        remarks: overallRemarks.trim(),
      };
      await onCreateReturn(payload);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit return.");
    }
  };

  const inputClass =
    "w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs outline-none focus:border-amber-500";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/40">
          <div>
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
              Order Returns — {order.order_no || orderId}
            </h3>
            <p className="text-2xs text-amber-800/80 dark:text-amber-200/70">
              Log new returns or view history. Super-admin bypass submits return transactions directly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4 font-sans">
          <div className="flex flex-wrap gap-2 items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div className="flex flex-wrap gap-2">
              {sortedReturns.map((r) => {
                const id = refId(r._id || r.id);
                const active = id === selectedId;
                const label =
                  String(r.return_no || "").trim() ||
                  `Return ${formatDateOnly(r.createdAt)}`;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedId(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-amber-600 text-white shadow"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setSelectedId("new")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                selectedId === "new"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
              }`}
            >
              + Create New Return
            </button>
          </div>

          {selectedId === "new" ? (
            <>
              {dispatches.length === 0 ? (
                <div className="rounded-lg border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-amber-800 bg-amber-50/50">
                  No dispatch batches available to return from. Please create a dispatch batch first.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-200 p-4 space-y-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                          Select Dispatch Batch *
                        </label>
                        <select
                          value={dispatchId}
                          onChange={(e) => setDispatchId(e.target.value)}
                          className={inputClass}
                          required
                        >
                          <option value="">— Select Dispatch —</option>
                          {dispatches.map((d) => (
                            <option key={refId(d._id || d.id)} value={refId(d._id || d.id)}>
                              {d.dispatch_no || d.bill_number || "Draft"}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                          Returned By Person *
                        </label>
                        <input
                          type="text"
                          value={returnedByPerson}
                          onChange={(e) => setReturnedByPerson(e.target.value)}
                          className={inputClass}
                          placeholder="Returning agent or driver"
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                          Overall Remarks
                        </label>
                        <input
                          type="text"
                          value={overallRemarks}
                          onChange={(e) => setOverallRemarks(e.target.value)}
                          className={inputClass}
                          placeholder="Remarks / notes"
                        />
                      </div>
                    </div>
                  </div>

                  {newItems.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Select items and enter return details
                      </h4>
                      {newItems.map((item) => (
                        <div
                          key={item.key}
                          className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {item.productName}
                            </span>
                            <span className="text-2xs text-slate-400">
                              Dispatched Qty: <span className="font-semibold">{item.dispatchedQty}</span>
                            </span>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-5">
                            <div>
                              <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase">
                                Return Qty
                              </label>
                              <input
                                type="number"
                                value={item.returnedQty}
                                onChange={(e) =>
                                  updateItemField(
                                    item.key,
                                    "returnedQty",
                                    Math.max(0, Math.min(item.dispatchedQty, Number(e.target.value) || 0))
                                  )
                                }
                                className={inputClass}
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase">
                                Reason
                              </label>
                              <select
                                value={item.returnReason}
                                onChange={(e) => updateItemField(item.key, "returnReason", e.target.value)}
                                className={inputClass}
                              >
                                {COMMON_REASONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase">
                                Expiry Type
                              </label>
                              <select
                                value={item.expiryType}
                                onChange={(e) => updateItemField(item.key, "expiryType", e.target.value)}
                                className={inputClass}
                              >
                                <option value="other">other (non-expiry)</option>
                                <option value="expiry">expiry / shelf life</option>
                              </select>
                            </div>

                            <div>
                              <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase">
                                Expiry Date
                              </label>
                              <input
                                type="date"
                                value={item.expiryDate}
                                onChange={(e) => updateItemField(item.key, "expiryDate", e.target.value)}
                                className={inputClass}
                                disabled={item.expiryType !== "expiry"}
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-[10px] font-semibold text-slate-400 uppercase">
                                Item Remarks
                              </label>
                              <input
                                type="text"
                                value={item.remarks}
                                onChange={(e) => updateItemField(item.key, "remarks", e.target.value)}
                                className={inputClass}
                                placeholder="Notes for this item"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            selectedReturn && (
              <div className="rounded-xl border border-slate-200 p-4 space-y-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase block">Return No</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{selectedReturn.return_no || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase block">Logged At</span>
                    <span className="text-slate-800 dark:text-slate-200">{formatDateOnly(selectedReturn.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase block">Returned By</span>
                    <span className="text-slate-800 dark:text-slate-200">{selectedReturn.returned_by_person || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase block">Remarks</span>
                    <span className="text-slate-800 dark:text-slate-200">{selectedReturn.remarks || "—"}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Returned Items
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950 font-medium">
                        <tr>
                          <th className="px-3 py-2">Product Name</th>
                          <th className="px-3 py-2 text-center w-28">Returned Qty</th>
                          <th className="px-3 py-2">Reason</th>
                          <th className="px-3 py-2">Expiry Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {(selectedReturn.return_items || []).map((item: any, i: number) => (
                          <tr key={i} className="bg-white dark:bg-slate-900">
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                              {String(
                                item.product_name ||
                                (typeof item.product === "object" && item.product !== null
                                  ? (item.product as any).product_name || (item.product as any).name || ""
                                  : String(item.product ?? ""))
                              ) || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-center font-bold text-rose-600 dark:text-rose-400">
                              {item.returned_quantity}
                            </td>
                            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                              {item.return_reason || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                              {item.expiry_date ? formatDateOnly(item.expiry_date) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 shrink-0 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-950 dark:text-slate-355 dark:hover:bg-white/5"
          >
            Close
          </button>
          {selectedId === "new" ? (
            dispatches.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Submit Return
                </button>
              </div>
            )
          ) : (
            <span className="text-xs text-slate-500 italic">View Only (Logged)</span>
          )}
        </div>
      </div>
    </div>
  );
}

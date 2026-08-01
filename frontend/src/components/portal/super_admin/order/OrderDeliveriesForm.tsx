"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  refId,
  toDateInput,
  formatDateOnly,
} from "./utils";

type OrderDeliveriesFormProps = {
  order: any;
  dispatches: any[];
  transports: any[];
  deliveries: any[];
  saving: boolean;
  onClose: () => void;
  onLogDelivery: (payload: Record<string, any>) => Promise<void>;
};

type DeliveryItemDraft = {
  product: string;
  productName: string;
  dispatchedQty: number;
  deliveredQty: number;
  remarks: string;
};

export function OrderDeliveriesForm({
  order,
  dispatches,
  transports,
  deliveries,
  saving,
  onClose,
  onLogDelivery,
}: OrderDeliveriesFormProps) {
  const orderId = refId(order._id || order.id);
  const sortedDeliveries = useMemo(
    () =>
      [...deliveries].sort((a, b) => {
        return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
      }),
    [deliveries],
  );

  const [selectedId, setSelectedId] = useState(() =>
    sortedDeliveries[0] ? refId(sortedDeliveries[0]._id || sortedDeliveries[0].id) : "new"
  );

  const selectedDelivery = useMemo(
    () =>
      selectedId !== "new"
        ? sortedDeliveries.find((d) => refId(d._id || d.id) === selectedId) || null
        : null,
    [sortedDeliveries, selectedId],
  );

  // For new delivery logging
  const [transportId, setTransportId] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [overallRemarks, setOverallRemarks] = useState("");
  const [newItems, setNewItems] = useState<DeliveryItemDraft[]>([]);

  // Find dispatch linked to the selected transport
  const selectedTransportObj = useMemo(() => {
    if (!transportId) return null;
    return transports.find((t) => refId(t._id || t.id) === transportId) || null;
  }, [transportId, transports]);

  const linkedDispatchId = useMemo(() => {
    if (!selectedTransportObj) return "";
    return refId(selectedTransportObj.dispatch);
  }, [selectedTransportObj]);

  const linkedDispatchObj = useMemo(() => {
    if (!linkedDispatchId) return null;
    return dispatches.find((d) => refId(d._id || d.id) === linkedDispatchId) || null;
  }, [linkedDispatchId, dispatches]);

  // Load items from dispatch when transport changes
  useEffect(() => {
    if (selectedId !== "new") return;
    if (!linkedDispatchObj) {
      setNewItems([]);
      return;
    }
    const dispatchItems = Array.isArray(linkedDispatchObj.dispatch_items)
      ? linkedDispatchObj.dispatch_items
      : Array.isArray(linkedDispatchObj.items)
        ? linkedDispatchObj.items
        : [];

    const orderItems = order.order_items || [];

    const draftItems = dispatchItems.map((item: any) => {
      const matchOrderItem = orderItems.find(
        (oi: any) => refId(oi._id || oi.id) === refId(item.order_item_id)
      );
      const prodName = matchOrderItem?.product_name || item.product_name || "—";
      const pId = refId(item.product || matchOrderItem?.product);
      const dispQty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
      return {
        product: pId,
        productName: prodName,
        dispatchedQty: dispQty,
        deliveredQty: dispQty, // Default to full delivery
        remarks: "",
      };
    });
    setNewItems(draftItems);
  }, [linkedDispatchObj, selectedId, order.order_items]);

  const resetForm = useCallback(() => {
    const defaultTransport = transports.find((t) => t.shipment_status !== "delivered") || transports[0];
    setTransportId(defaultTransport ? refId(defaultTransport._id || defaultTransport.id) : "");
    setReceivedBy("");
    setOverallRemarks("");
    setNewItems([]);
  }, [transports]);

  useEffect(() => {
    if (selectedId === "new") {
      resetForm();
    }
  }, [selectedId, resetForm]);

  const updateItemQty = (prodId: string, val: number) => {
    setNewItems((prev) =>
      prev.map((item) => (item.product === prodId ? { ...item, deliveredQty: val } : item))
    );
  };

  const updateItemRemarks = (prodId: string, val: string) => {
    setNewItems((prev) =>
      prev.map((item) => (item.product === prodId ? { ...item, remarks: val } : item))
    );
  };

  const handleSave = async () => {
    if (selectedId !== "new") {
      toast.error("Editing existing logged deliveries is not supported.");
      return;
    }
    if (!transportId) {
      toast.error("Please select a transport shipment.");
      return;
    }
    if (!linkedDispatchId) {
      toast.error("No linked dispatch found for this transport.");
      return;
    }
    if (newItems.length === 0) {
      toast.error("No items available to deliver.");
      return;
    }

    const deliveredSummary = newItems
      .map((item) => `${item.productName}: ${item.deliveredQty}`)
      .join("; ");

    const payload = {
      order: orderId,
      dispatch: linkedDispatchId,
      transport: transportId,
      delivery_type: "full",
      delivery_items: newItems.map((item) => ({
        product: item.product,
        delivered_quantity: item.deliveredQty,
        remarks: item.remarks.trim(),
      })),
      received_by: receivedBy.trim(),
      remarks: overallRemarks.trim(),
      status_remarks: [
        "[Super-Admin bypass delivery log]",
        `Accepted: ${deliveredSummary}`,
        receivedBy.trim() ? `Received by: ${receivedBy.trim()}` : null,
        overallRemarks.trim() ? `Remarks: ${overallRemarks.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      actual_delivery_date: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    };

    await onLogDelivery(payload);
  };

  const inputClass =
    "w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs outline-none focus:border-amber-500";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/40">
          <div>
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
              Order Deliveries — {order.order_no || orderId}
            </h3>
            <p className="text-2xs text-amber-800/80 dark:text-amber-200/70">
              Log new deliveries or view history. Super-admin bypass logs delivery status directly.
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
              {sortedDeliveries.map((d) => {
                const id = refId(d._id || d.id);
                const label =
                  String(d.delivery_no || "").trim() ||
                  `Delivery ${formatDateOnly(d.createdAt)}`;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedId(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      selectedId === id
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
              + Log New Delivery
            </button>
          </div>

          {selectedId === "new" ? (
            <>
              {transports.length === 0 ? (
                <div className="rounded-lg border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-amber-800 bg-amber-50/50">
                  No transport shipments available to deliver. Please create a transport shipment first.
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-200 p-4 space-y-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                          Select Shipment (LR Number) *
                        </label>
                        <select
                          value={transportId}
                          onChange={(e) => setTransportId(e.target.value)}
                          className={inputClass}
                          required
                        >
                          <option value="">— Select Transport —</option>
                          {transports.map((t) => (
                            <option key={refId(t._id || t.id)} value={refId(t._id || t.id)}>
                              {t.lr_number || "Shipment"} &middot; {t.transporter_name || "Agent"}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                          Received By Name
                        </label>
                        <input
                          type="text"
                          value={receivedBy}
                          onChange={(e) => setReceivedBy(e.target.value)}
                          className={inputClass}
                          placeholder="Staff or Customer name"
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
                          placeholder="e.g. Received intact"
                        />
                      </div>
                    </div>
                  </div>

                  {newItems.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Items being delivered
                      </h4>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950 font-medium">
                            <tr>
                              <th className="px-3 py-2">Product Name</th>
                              <th className="px-3 py-2 text-center w-28">Dispatched Qty</th>
                              <th className="px-3 py-2 text-center w-28">Delivered Qty</th>
                              <th className="px-3 py-2">Item Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {newItems.map((item) => (
                              <tr key={item.product} className="bg-white dark:bg-slate-900">
                                <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                                  {item.productName}
                                </td>
                                <td className="px-3 py-1.5 text-center font-semibold text-slate-500 dark:text-slate-400">
                                  {item.dispatchedQty}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  <input
                                    type="number"
                                    value={item.deliveredQty}
                                    onChange={(e) =>
                                      updateItemQty(
                                        item.product,
                                        Math.max(0, Math.min(item.dispatchedQty, Number(e.target.value) || 0))
                                      )
                                    }
                                    className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-center font-semibold text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  <input
                                    type="text"
                                    value={item.remarks}
                                    onChange={(e) => updateItemRemarks(item.product, e.target.value)}
                                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950 text-xs"
                                    placeholder="Remarks for this line"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            selectedDelivery && (
              <div className="rounded-xl border border-slate-200 p-4 space-y-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase block">Delivery No</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{selectedDelivery.delivery_no || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase block">Logged At</span>
                    <span className="text-slate-800 dark:text-slate-200">{formatDateOnly(selectedDelivery.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase block">Received By</span>
                    <span className="text-slate-800 dark:text-slate-200">{selectedDelivery.received_by || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase block">Remarks</span>
                    <span className="text-slate-800 dark:text-slate-200">{selectedDelivery.remarks || "—"}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Delivered Items
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950 font-medium">
                        <tr>
                          <th className="px-3 py-2">Product Name</th>
                          <th className="px-3 py-2 text-center w-28">Delivered Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {(selectedDelivery.delivery_items || []).map((item: any, i: number) => (
                          <tr key={i} className="bg-white dark:bg-slate-900">
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                              {String(
                                item.product_name ||
                                (typeof item.product === "object" && item.product !== null
                                  ? (item.product as any).product_name || (item.product as any).name || ""
                                  : String(item.product ?? ""))
                              ) || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300">
                              {item.delivered_quantity}
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
            transports.length > 0 && (
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
                  Log delivery
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

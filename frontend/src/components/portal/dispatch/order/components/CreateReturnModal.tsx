"use client";

import { useState, useEffect } from "react";
import {
  useListDispatchesQuery,
  useListTransportsQuery,
  useListOrderDeliveriesQuery,
  useCreateOrderReturnMutation,
} from "@/store/api";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";

interface CreateReturnModalProps {
  open: boolean;
  onClose: () => void;
  orderId?: string;
  orderItems?: any[];
  formatDate: (v: unknown) => string;
  onCreated?: () => void;
}

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

export function CreateReturnModal({
  open,
  onClose,
  orderId,
  orderItems = [],
  formatDate,
  onCreated,
}: CreateReturnModalProps) {
  const [createOrderReturn, { isLoading: isCreating }] = useCreateOrderReturnMutation();

  const [selectedDispatchId, setSelectedDispatchId] = useState("");
  const [returnedByPerson, setReturnedByPerson] = useState("");
  const [overallRemarks, setOverallRemarks] = useState("");

  // Keyed by order_item_id or prodId-idx
  const [itemsFields, setItemsFields] = useState<
    Record<
      string,
      {
        returned_quantity: number;
        return_reason: string;
        remarks: string;
        expiry_type: "expiry" | "other";
        expiry_date: string;
      }
    >
  >({});

  // Fetch dispatches for this order
  const dispatchesQ = useListDispatchesQuery(
    orderId ? { order: orderId } : undefined,
    { skip: !orderId || !open }
  );
  const dispatchesList = pickList(dispatchesQ?.data);

  // Fetch transports for the selected dispatch
  const transportsQ = useListTransportsQuery(
    selectedDispatchId ? { dispatch: selectedDispatchId } : undefined,
    { skip: !selectedDispatchId || !open }
  );
  const transportsList = pickList(transportsQ?.data);
  const activeTransport = transportsList.find((tr) => tr.shipment_status !== "returned") || transportsList[0];
  const transportId = activeTransport ? String(activeTransport._id ?? activeTransport.id ?? "") : "";

  // Fetch delivery for that transport
  const deliveriesQ = useListOrderDeliveriesQuery(
    transportId ? { transport: transportId } : undefined,
    { skip: !transportId || !open }
  );
  const deliveriesList = pickList(deliveriesQ?.data);
  const activeDelivery = deliveriesList[0];

  const selectedDispatch = dispatchesList.find(
    (d) => String(d._id ?? d.id ?? "") === selectedDispatchId
  );
  const dispatchItems = selectedDispatch
    ? Array.isArray(selectedDispatch.dispatch_items)
      ? selectedDispatch.dispatch_items
      : selectedDispatch.items || []
    : [];

  // Reset modal state on close or open
  useEffect(() => {
    if (!open) {
      setSelectedDispatchId("");
      setReturnedByPerson("");
      setOverallRemarks("");
      setItemsFields({});
    }
  }, [open]);

  // Initialize fields on selected dispatch change
  useEffect(() => {
    if (!selectedDispatchId || dispatchItems.length === 0) {
      setItemsFields({});
      return;
    }

    const initialFields: typeof itemsFields = {};
    dispatchItems.forEach((item: any, idx: number) => {
      const matchItem = orderItems.find(
        (oi: any) => String(oi._id ?? oi.id ?? "") === String(item.order_item_id)
      );
      const prodId = typeof matchItem?.product === "object" && matchItem?.product !== null
        ? String(matchItem.product._id ?? matchItem.product.id ?? "")
        : String(matchItem?.product ?? item.product ?? "");

      const key = item.order_item_id || `${prodId}-${idx}`;
      initialFields[key] = {
        returned_quantity: 0,
        return_reason: "Customer Rejected / Refused Delivery",
        remarks: "",
        expiry_type: "other",
        expiry_date: "",
      };
    });
    setItemsFields(initialFields);
  }, [selectedDispatchId, selectedDispatch, orderItems]);

  const updateItemField = (key: string, field: string, value: any) => {
    setItemsFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const handleCreateReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDispatchId) {
      toast.error("Please select a dispatch batch.");
      return;
    }

    if (!returnedByPerson.trim()) {
      toast.error("Please specify the returning person's name.");
      return;
    }

    // Map fields to API return_items structure
    const payloadItems: any[] = [];
    let hasReturnedQty = false;
    let validationFailed = false;

    dispatchItems.forEach((item: any, idx: number) => {
      const matchItem = orderItems.find(
        (oi: any) => String(oi._id ?? oi.id ?? "") === String(item.order_item_id)
      );
      const prodId = typeof matchItem?.product === "object" && matchItem?.product !== null
        ? String(matchItem.product._id ?? matchItem.product.id ?? "")
        : String(matchItem?.product ?? item.product ?? "");

      const key = item.order_item_id || `${prodId}-${idx}`;
      const fields = itemsFields[key];

      if (fields && fields.returned_quantity > 0) {
        hasReturnedQty = true;

        if (fields.expiry_type === "expiry" && !fields.expiry_date) {
          toast.error(`Please select an expiry date for product: ${matchItem?.product_name || item.product_name || "item"}`);
          validationFailed = true;
          return;
        }

        payloadItems.push({
          product: prodId,
          returned_quantity: fields.returned_quantity,
          return_reason: fields.return_reason,
          remarks: fields.remarks.trim(),
          expiry_type: fields.expiry_type,
          expiry_date: fields.expiry_date || undefined,
        });
      }
    });

    if (validationFailed) return;

    if (!hasReturnedQty) {
      toast.error("Please select at least one item with a return quantity greater than 0.");
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
    };

    try {
      await createOrderReturn(payload).unwrap();
      toast.success("Product return logged successfully.");
      onClose();
      onCreated?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1.5px]">
      <div className="w-full max-w-5xl rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 flex flex-col max-h-[90vh]">
        <header className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-550 dark:text-slate-50 font-sans">
              Record Product Return
            </h3>
            <p className="text-xs text-slate-505 dark:text-slate-400 font-sans mt-0.5">
              Select a dispatch to fetch reference logistics/delivery details, then input return items.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form onSubmit={handleCreateReturnSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs font-sans">
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Select Dispatch Dropdown */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-355">
                Select Order Dispatch *
              </label>
              {dispatchesQ.isLoading ? (
                <p className="text-slate-500 italic">Loading dispatches...</p>
              ) : dispatchesList.length === 0 ? (
                <p className="text-rose-500 font-medium">No dispatches found for this order.</p>
              ) : (
                <select
                  required
                  value={selectedDispatchId}
                  onChange={(e) => setSelectedDispatchId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-50"
                >
                  <option value="">-- Choose Dispatch --</option>
                  {dispatchesList
                    .filter((d) => d.dispatch_status !== "cancelled" && d.status !== "cancelled")
                    .map((d) => (
                      <option key={d._id ?? d.id} value={d._id ?? d.id}>
                        {d.dispatch_no || "Batch"} (Dispatched: {formatDate(d.dispatched_at ?? d.dispatch_date)})
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* Returning Person */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-355">
                Returned By / Returning Person Name *
              </label>
              <input
                type="text"
                required
                value={returnedByPerson}
                onChange={(e) => setReturnedByPerson(e.target.value)}
                placeholder="E.g., Delivery Driver, Agent, Client Rep..."
                className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-50"
              />
            </div>

            {/* Overall Comments */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 dark:text-slate-355">
                Overall Return Remarks
              </label>
              <input
                type="text"
                value={overallRemarks}
                onChange={(e) => setOverallRemarks(e.target.value)}
                placeholder="Comments regarding this return transaction..."
                className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-50"
              />
            </div>
          </div>

          {/* Reference Info Card */}
          {selectedDispatchId && (
            <div className="rounded-lg bg-slate-50/50 p-4 border border-slate-200/60 dark:bg-slate-955/20 dark:border-white/5 space-y-2.5">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                Auto-Fetched Logistics References
              </h4>
              {transportsQ.isFetching || deliveriesQ.isFetching ? (
                <div className="flex items-center gap-2 text-slate-500 italic">
                  <svg className="animate-spin h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading transport shipment and order delivery details...
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 text-slate-700 dark:text-slate-300">
                  <div>
                    <span className="font-bold text-[10px] text-slate-400 block uppercase">Transport Shipment</span>
                    {activeTransport ? (
                      <div className="mt-1 space-y-0.5">
                        <div>
                          <span className="text-slate-500">Shipment No:</span>{" "}
                          <span className="font-mono font-semibold text-slate-850 dark:text-slate-100">{activeTransport.shipment_no}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Transporter/Agent:</span>{" "}
                          <span className="font-semibold text-slate-850 dark:text-slate-100">
                            {activeTransport.transporter_name ||
                              (activeTransport.transport_agent && typeof activeTransport.transport_agent === "object"
                                ? activeTransport.transport_agent.agent_name || activeTransport.transport_agent.agent_code
                                : activeTransport.transport_agent) || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Vehicle & Driver:</span>{" "}
                          <span className="font-semibold text-slate-850 dark:text-slate-100">
                            {activeTransport.vehicle_number || activeTransport.vehicle_no || "—"} ({activeTransport.driver_name || "—"})
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic block mt-1">No active transport shipment record linked to this dispatch.</span>
                    )}
                  </div>

                  <div>
                    <span className="font-bold text-[10px] text-slate-400 block uppercase">Order Delivery</span>
                    {activeDelivery ? (
                      <div className="mt-1 space-y-0.5">
                        <div>
                          <span className="text-slate-500">Delivery No:</span>{" "}
                          <span className="font-mono font-semibold text-slate-850 dark:text-slate-100">{activeDelivery.delivery_no}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Status:</span>{" "}
                          <span className="font-semibold text-slate-850 dark:text-slate-100 capitalize">{activeDelivery.delivery_status}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Delivered At:</span>{" "}
                          <span className="font-semibold text-slate-850 dark:text-slate-100">
                            {formatDate(activeDelivery.delivered_at || activeDelivery.actual_delivery_date)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic block mt-1">No delivery record logged yet for the corresponding transport shipment.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dynamic Items Table */}
          {selectedDispatchId && (
            <div className="space-y-2.5">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                Returned Quantity & Expiry/Rejection Registry
              </h4>
              {dispatchItems.length === 0 ? (
                <p className="text-slate-550 italic text-center py-4">This dispatch batch contains no products.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white dark:border-white/5 dark:bg-slate-955">
                  <table className="w-full text-left text-xs min-w-[960px]">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200/80 dark:border-white/5">
                      <tr>
                        <th className="px-4 py-3 min-w-[200px]">Product Name</th>
                        <th className="px-4 py-3 text-center w-26">Dispatched</th>
                        <th className="px-4 py-3 text-center w-26 text-emerald-600 dark:text-emerald-400">Delivered</th>
                        <th className="px-4 py-3 text-center w-28 text-rose-600 dark:text-rose-400">Prev. Returned</th>
                        <th className="px-4 py-3 text-center w-32">New Return Qty *</th>
                        <th className="px-4 py-3 w-36">Expiry/Other</th>
                        <th className="px-4 py-3 w-40">Expiry Date</th>
                        <th className="px-4 py-3 w-48">Return Reason</th>
                        <th className="px-4 py-3 min-w-[150px]">Remarks / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 dark:divide-white/5">
                      {dispatchItems.map((item: any, idx: number) => {
                        const matchItem = orderItems.find(
                          (oi: any) => String(oi._id ?? oi.id ?? "") === String(item.order_item_id)
                        );
                        const productName = matchItem?.product_name || item.product_name || item.product?.product_name || "—";
                        const dispatchedQty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
                        const prevReturnedQty = Number(item.returned_quantity ?? 0);
                        // Maximum new return = what's left after already-returned units
                        const maxNewReturn = Math.max(0, dispatchedQty - prevReturnedQty);
                        const fullyReturned = prevReturnedQty >= dispatchedQty && dispatchedQty > 0;

                        const prodId = typeof matchItem?.product === "object" && matchItem?.product !== null
                          ? String(matchItem.product._id ?? matchItem.product.id ?? "")
                          : String(matchItem?.product ?? item.product ?? "");
                        const key = item.order_item_id || `${prodId}-${idx}`;
                        const fields = itemsFields[key] || {
                          returned_quantity: 0,
                          return_reason: "Customer Rejected / Refused Delivery",
                          remarks: "",
                          expiry_type: "other",
                          expiry_date: "",
                        };

                        const deliveryItems = activeDelivery && Array.isArray(activeDelivery.delivery_items)
                          ? activeDelivery.delivery_items
                          : [];
                        const matchDeliveryItem = deliveryItems.find(
                          (di: any) => String(di.product?._id ?? di.product ?? "") === prodId
                        );
                        const deliveredQty = matchDeliveryItem ? matchDeliveryItem.delivered_quantity : null;

                        return (
                          <tr
                            key={key}
                            className={`transition duration-150 ${fullyReturned ? "bg-rose-50/30 dark:bg-rose-950/10 opacity-60" : "hover:bg-slate-50/30 dark:hover:bg-white/5"}`}
                          >
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                              {productName}
                              {fullyReturned && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                                  Fully Returned
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-600 dark:text-slate-400">
                              {dispatchedQty}
                            </td>
                            <td className="px-4 py-3 text-center font-bold">
                              {deliveredQty !== null ? (
                                <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                  {deliveredQty}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {prevReturnedQty > 0 ? (
                                <span className="inline-flex items-center justify-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                  {prevReturnedQty}
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center">
                                {fullyReturned ? (
                                  <span className="text-[10px] text-rose-500 dark:text-rose-400 italic font-medium">All returned</span>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    max={maxNewReturn}
                                    value={fields.returned_quantity}
                                    onChange={(e) => {
                                      const parsed = parseInt(e.target.value, 10);
                                      const val = Math.min(maxNewReturn, Math.max(0, isNaN(parsed) ? 0 : parsed));
                                      updateItemField(key, "returned_quantity", val);
                                    }}
                                    className="w-20 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-905 dark:text-slate-50"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                disabled={fields.returned_quantity === 0 || fullyReturned}
                                value={fields.expiry_type}
                                onChange={(e) => {
                                  const type = e.target.value as "expiry" | "other";
                                  updateItemField(key, "expiry_type", type);
                                  if (type === "other") {
                                    updateItemField(key, "expiry_date", "");
                                  }
                                }}
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-905 dark:text-slate-50 disabled:opacity-50"
                              >
                                <option value="other">Other</option>
                                <option value="expiry">Expiry</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="date"
                                disabled={fields.returned_quantity === 0 || fields.expiry_type !== "expiry" || fullyReturned}
                                value={fields.expiry_date || ""}
                                onChange={(e) => updateItemField(key, "expiry_date", e.target.value)}
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-905 dark:text-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                disabled={fields.returned_quantity === 0 || fullyReturned}
                                value={fields.return_reason}
                                onChange={(e) => updateItemField(key, "return_reason", e.target.value)}
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-905 dark:text-slate-50 disabled:opacity-50"
                              >
                                {COMMON_REASONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                disabled={fields.returned_quantity === 0 || fullyReturned}
                                placeholder="Enter batch/expiry remarks..."
                                value={fields.remarks}
                                onChange={(e) => updateItemField(key, "remarks", e.target.value)}
                                className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-905 dark:text-slate-50 disabled:opacity-50"
                              />
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
            className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-150 dark:border-white/15 dark:text-slate-250 dark:hover:bg-white/5 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isCreating}
            onClick={handleCreateReturnSubmit}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isCreating ? "Recording..." : "Record Return"}
          </button>
        </footer>
      </div>
    </div>
  );
}

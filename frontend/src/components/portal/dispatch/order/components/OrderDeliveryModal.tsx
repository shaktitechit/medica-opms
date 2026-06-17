"use client";

import { useCallback, useEffect, useState } from "react";
import { useLogShipmentDeliveryMutation } from "@/store/api";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";

type DeliveryFormItem = {
  product: string;
  productName: string;
  dispatchedQty: number;
  deliveredQty: number;
  returnedQty: number;
  remarks: string;
};

type OrderDeliveryModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  transportId: string;
  dispatchId: string;
  dispatches?: any[];
  orderItems?: any[];
  onRefetch?: () => void;
};

export function OrderDeliveryModal({
  open,
  onClose,
  orderId,
  transportId,
  dispatchId,
  dispatches = [],
  orderItems = [],
  onRefetch,
}: OrderDeliveryModalProps) {
  const [deliveryStep, setDeliveryStep] = useState<1 | 2>(1);
  const [deliveryType, setDeliveryType] = useState<"full" | "partial" | null>(null);
  const [deliveryFormItems, setDeliveryFormItems] = useState<DeliveryFormItem[]>([]);
  const [overallDeliveryRemarks, setOverallDeliveryRemarks] = useState("");
  const [receivedBy, setReceivedBy] = useState("");

  const [logShipmentDelivery, { isLoading: isLoggingShipment }] = useLogShipmentDeliveryMutation();

  const resetForm = useCallback(() => {
    setDeliveryStep(1);
    setDeliveryType(null);
    setDeliveryFormItems([]);
    setOverallDeliveryRemarks("");
    setReceivedBy("");
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  const handleSelectDeliveryType = (type: "full" | "partial") => {
    setDeliveryType(type);

    const selectedDispatch = dispatches.find(
      (d: any) => String(d._id ?? d.id ?? "") === dispatchId,
    );
    const dispatchItems = selectedDispatch
      ? Array.isArray(selectedDispatch.dispatch_items)
        ? selectedDispatch.dispatch_items
        : selectedDispatch.items || []
      : [];

    const items = dispatchItems.map((item: any) => {
      const matchItem = orderItems.find(
        (oi: any) => String(oi._id ?? oi.id ?? "") === String(item.order_item_id),
      );
      const productName =
        matchItem?.product_name || item.product_name || item.product?.product_name || "—";
      const dispatchedQty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);

      return {
        product:
          typeof item.product === "object" && item.product !== null
            ? String(item.product._id ?? item.product.id ?? "")
            : String(item.product ?? ""),
        productName,
        dispatchedQty,
        deliveredQty: type === "full" ? dispatchedQty : 0,
        returnedQty: 0,
        remarks: "",
      };
    });

    setDeliveryFormItems(items);
    setDeliveryStep(2);
  };

  const handleDeliverySubmit = async () => {
    if (!transportId || !dispatchId) return;

    for (const item of deliveryFormItems) {
      if (item.deliveredQty < 0 || item.returnedQty < 0) {
        toast.error("Quantities cannot be negative.");
        return;
      }
      if (item.deliveredQty + item.returnedQty > item.dispatchedQty) {
        toast.error(
          `Delivered + Returned quantity for "${item.productName}" cannot exceed dispatched quantity (${item.dispatchedQty}).`,
        );
        return;
      }
      if (deliveryType === "partial" && item.deliveredQty + item.returnedQty !== item.dispatchedQty) {
        toast.error(
          `For partial delivery, delivered + returned must equal dispatched quantity for "${item.productName}".`,
        );
        return;
      }
    }

    const deliveredLines = deliveryFormItems.filter((item) => Number(item.deliveredQty) > 0);
    const returnedLines = deliveryFormItems.filter((item) => Number(item.returnedQty) > 0);

    if (deliveryType === "partial") {
      if (deliveredLines.length === 0 && returnedLines.length === 0) {
        toast.error("Enter delivered and/or returned quantities for at least one product.");
        return;
      }
      for (const item of returnedLines) {
        if (!item.remarks?.trim()) {
          toast.error(`Add a return reason/remark for "${item.productName}".`);
          return;
        }
      }
    }

    try {
      const deliveredSummary = deliveredLines
        .map((item) => `${item.productName}: ${item.deliveredQty}`)
        .join("; ");
      const returnedSummary = returnedLines
        .map((item) => `${item.productName}: ${item.returnedQty}`)
        .join("; ");
      const statusRemarks = [
        deliveryType === "partial" ? "[Partial delivery]" : "[Delivered]",
        deliveredLines.length > 0 ? `Accepted: ${deliveredSummary}` : null,
        returnedLines.length > 0 ? `Returned: ${returnedSummary}` : null,
        receivedBy.trim() ? `Received by: ${receivedBy.trim()}` : null,
        overallDeliveryRemarks.trim() ? `Remarks: ${overallDeliveryRemarks.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      await logShipmentDelivery({
        order: orderId,
        dispatch: dispatchId,
        transport: transportId,
        delivery_type: deliveryType,
        delivery_items: deliveredLines.map((item) => ({
          product: item.product,
          delivered_quantity: Number(item.deliveredQty),
          remarks: item.remarks.trim(),
        })),
        return_items: returnedLines.map((item) => ({
          product: item.product,
          returned_quantity: Number(item.returnedQty),
          return_reason: item.remarks.trim() || "Customer rejection / Partial delivery",
          remarks: item.remarks.trim(),
        })),
        received_by: receivedBy.trim(),
        remarks:
          deliveryType === "partial" && returnedLines.length > 0
            ? `[Partial delivery] ${overallDeliveryRemarks.trim()}`.trim()
            : overallDeliveryRemarks.trim(),
        return_remarks: `Returns from partial delivery. Overall remarks: ${overallDeliveryRemarks.trim() || "None"}`,
        status_remarks: statusRemarks,
        actual_delivery_date: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      }).unwrap();

      if (returnedLines.length > 0) {
        toast.success("Partial delivery logged. Order and workflow will update shortly.");
      } else if (deliveryType === "full") {
        toast.success("Full delivery logged. Order and workflow will update shortly.");
      } else {
        toast.success("Delivery logged. Order and workflow will update shortly.");
      }

      handleClose();
      onRefetch?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px] overflow-y-auto animate-fade-in">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 overflow-hidden my-8 transition-all duration-300 transform scale-100">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-emerald-50/40 dark:bg-emerald-950/10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
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
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-sans">
                Log Shipment Delivery
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Step {deliveryStep} of 2:{" "}
                {deliveryStep === 1 ? "Select Delivery Type" : "Order Delivery Preview"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-500 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {deliveryStep === 1 && (
          <div className="p-8 space-y-6 font-sans">
            <div className="text-center max-w-md mx-auto space-y-2">
              <h4 className="text-base font-semibold text-slate-805 dark:text-slate-200">
                How was the order received by the customer?
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose an option below to load the preview form. You will be able to review items,
                quantities, and input remarks before finalizing.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 max-w-2xl mx-auto pt-2">
              <button
                type="button"
                onClick={() => handleSelectDeliveryType("full")}
                className="flex flex-col items-center text-center p-6 rounded-2xl border-2 border-slate-200 hover:border-emerald-500 dark:border-slate-800 dark:hover:border-emerald-500 bg-white hover:bg-emerald-50/5 dark:bg-slate-950 dark:hover:bg-emerald-950/5 transition group cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-955/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition duration-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                  Full Delivery
                </span>
                <span className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  All products in this shipment were successfully accepted in full by the customer.
                  No returns, damages, or rejections.
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDeliveryType("partial")}
                className="flex flex-col items-center text-center p-6 rounded-2xl border-2 border-slate-200 hover:border-amber-500 dark:border-slate-800 dark:hover:border-amber-500 bg-white hover:bg-amber-50/5 dark:bg-slate-950 dark:hover:bg-amber-950/5 transition group cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-955/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition duration-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
                  Partial Delivery / Returns
                </span>
                <span className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Some items were returned, rejected, or missing. Lets you edit actual delivered
                  quantities and log return amounts with remarks.
                </span>
              </button>
            </div>
          </div>
        )}

        {deliveryStep === 2 && (
          <div className="p-6 space-y-6 font-sans">
            <div
              className={`rounded-xl px-4 py-3 flex items-center justify-between text-xs ${
                deliveryType === "full"
                  ? "bg-emerald-50/80 border border-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800/20 dark:text-emerald-300"
                  : "bg-amber-50/80 border border-amber-100 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800/20 dark:text-amber-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                  {deliveryType === "full" ? "Full Delivery Mode" : "Partial Delivery Mode"}
                </span>
                <span>
                  Review accepted vs returned quantities. Returned units are not counted as
                  delivered.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDeliveryStep(1)}
                className="text-xs font-bold underline hover:no-underline text-blue-600 dark:text-blue-400"
              >
                Change Mode
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Product Dispatch & Delivery Registry
              </h4>
              <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-white/5 bg-slate-50/30 dark:bg-slate-950/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-550 dark:text-slate-400 font-semibold border-b border-slate-200/60 dark:border-white/5">
                      <tr>
                        <th className="px-4 py-3">Product Name</th>
                        <th className="px-4 py-3 text-center w-28">Dispatched Qty</th>
                        <th className="px-4 py-3 text-center w-36 text-emerald-700 dark:text-emerald-400">
                          Accepted Qty
                        </th>
                        <th className="px-4 py-3 text-center w-36 text-rose-700 dark:text-rose-400">
                          Returned Qty
                        </th>
                        <th className="px-4 py-3">Inline Remarks / Return Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                      {deliveryFormItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                            {item.productName}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-600 dark:text-slate-400">
                            {item.dispatchedQty}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {deliveryType === "full" ? (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {item.deliveredQty}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={item.dispatchedQty}
                                value={item.deliveredQty}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(item.dispatchedQty, Number(e.target.value)),
                                  );
                                  const updated = [...deliveryFormItems];
                                  updated[idx] = {
                                    ...item,
                                    deliveredQty: val,
                                    returnedQty: Math.max(0, item.dispatchedQty - val),
                                  };
                                  setDeliveryFormItems(updated);
                                }}
                                className="w-20 rounded border border-slate-205 px-2 py-1 text-center text-xs font-semibold focus:border-blue-600 focus:ring-1 focus:ring-blue-500/25 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
                              />
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {deliveryType === "full" ? (
                              <span className="text-slate-400 font-medium">—</span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={item.dispatchedQty}
                                value={item.returnedQty}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(item.dispatchedQty, Number(e.target.value)),
                                  );
                                  const updated = [...deliveryFormItems];
                                  updated[idx] = {
                                    ...item,
                                    returnedQty: val,
                                    deliveredQty: Math.max(0, item.dispatchedQty - val),
                                  };
                                  setDeliveryFormItems(updated);
                                }}
                                className="w-20 rounded border border-slate-205 px-2 py-1 text-center text-xs font-semibold focus:border-blue-600 focus:ring-1 focus:ring-blue-500/25 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
                              />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              placeholder="E.g., damaged cap, wrong size..."
                              value={item.remarks}
                              onChange={(e) => {
                                const updated = [...deliveryFormItems];
                                updated[idx] = { ...item, remarks: e.target.value };
                                setDeliveryFormItems(updated);
                              }}
                              className="w-full rounded border border-slate-205 px-3 py-1 text-xs focus:border-blue-600 focus:ring-1 focus:ring-blue-500/25 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Received By{" "}
                  <span className="text-slate-400 font-normal">
                    (Signature/Name of person receiving order)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Enter name of recipient…"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Overall Delivery Remarks{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="E.g., Delivered to receptionist, parcel box, etc."
                  value={overallDeliveryRemarks}
                  onChange={(e) => setOverallDeliveryRemarks(e.target.value)}
                  className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 flex justify-between gap-3 font-sans">
          <div>
            {deliveryStep === 2 && (
              <button
                type="button"
                onClick={() => setDeliveryStep(1)}
                className="rounded-lg border border-slate-200/95 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition cursor-pointer"
              >
                Back to Step 1
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-slate-200/95 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition cursor-pointer"
            >
              Cancel
            </button>
            {deliveryStep === 2 && (
              <button
                type="button"
                disabled={isLoggingShipment}
                onClick={() => void handleDeliverySubmit()}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoggingShipment ? "Submitting..." : "Submit Delivery Details"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

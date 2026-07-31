"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { summarizeReleaseDispatchState } from "@/components/portal/account/order/components/accountDispatchAvailability";
import {
  NamedOption,
  refId,
  toDateInput,
  formatDateOnly,
} from "./utils";

type DispatchItemDraft = {
  key: string;
  order_item_id: string;
  product: string;
  product_label: string;
  ordered_quantity: number;
  dispatched_quantity: number;
  delivered_quantity: number;
  returned_quantity: number;
};

type DispatchHeaderDraft = {
  finance_approval: string;
  dispatch_status: string;
  bill_number: string;
  billing_date: string;
  warehouse: string;
  warehouse_location: string;
  remarks: string;
  dispatch_assignee_user: string;
  dispatched_at: string;
};

function dispatchItemFromRaw(item: any, idx: number, orderItems: any[] = []): DispatchItemDraft {
  const pObj = item?.product;
  const pId = typeof pObj === "object" && pObj ? refId(pObj._id || pObj.id) : refId(pObj || item?.product_id);
  const pName = typeof pObj === "object" && pObj ? String(pObj.product_name || pObj.name || "") : String(item?.product_name || "");
  const orderItemId = refId(item?.order_item_id);
  const match = orderItems.find((o: any) => refId(o._id || o.id) === orderItemId);
  return {
    key: `di-${idx}-${Date.now()}-${Math.random()}`,
    order_item_id: orderItemId,
    product: pId,
    product_label: pName,
    ordered_quantity: Number(match?.ordered_quantity ?? match?.quantity ?? match?.qty ?? 0),
    dispatched_quantity: Number(item?.dispatched_quantity ?? item?.dispatch_quantity ?? 0),
    delivered_quantity: Number(item?.delivered_quantity ?? 0),
    returned_quantity: Number(item?.returned_quantity ?? 0),
  };
}

function dispatchItemsFromOrder(orderItems: any[]): DispatchItemDraft[] {
  return (orderItems || []).map((item: any, i: number) => {
    const pObj = item?.product;
    const pId = typeof pObj === "object" && pObj ? refId(pObj._id || pObj.id) : refId(pObj || item?.product_id);
    const pName = typeof pObj === "object" && pObj ? String(pObj.product_name || pObj.name || "") : String(item?.product_name || "");
    return {
      key: `di-new-${i}-${Date.now()}-${Math.random()}`,
      order_item_id: refId(item?._id || item?.id),
      product: pId,
      product_label: pName,
      ordered_quantity: Number(item?.ordered_quantity ?? item?.quantity ?? item?.qty ?? 0),
      dispatched_quantity: 0,
      delivered_quantity: 0,
      returned_quantity: 0,
    };
  });
}

function headerFromDispatch(disp: any): DispatchHeaderDraft {
  return {
    finance_approval: refId(disp?.finance_approval),
    dispatch_status: disp?.dispatch_status || disp?.status || "draft",
    bill_number: disp?.bill_number || "",
    billing_date: toDateInput(disp?.billing_date) || new Date().toISOString().split("T")[0],
    warehouse: refId(disp?.warehouse),
    warehouse_location: disp?.warehouse_location || "",
    remarks: disp?.remarks || "",
    dispatch_assignee_user: refId(disp?.dispatch_assignee_user),
    dispatched_at: toDateInput(disp?.dispatched_at ?? disp?.dispatch_date) || new Date().toISOString().split("T")[0],
  };
}

export function OrderDispatchesForm({
  order,
  dispatches,
  approvals,
  users,
  saving,
  onClose,
  onSave,
  onCreate,
  onSettleClick,
}: {
  order: any;
  dispatches: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  users: NamedOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (dispatchId: string, patch: Record<string, unknown>) => Promise<void>;
  onCreate: (body: FormData) => Promise<void>;
  onSettleClick?: (approval: Record<string, unknown>, releaseNo: string) => void;
}) {
  const orderId = refId(order._id || order.id);
  const sortedDispatches = useMemo(
    () =>
      [...dispatches].sort((a, b) => {
        return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
      }),
    [dispatches],
  );

  const [selectedId, setSelectedId] = useState(
    () => refId(sortedDispatches[0]?._id || sortedDispatches[0]?.id) || "new",
  );
  const [billDocumentFile, setBillDocumentFile] = useState<File | null>(null);

  const [header, setHeader] = useState<DispatchHeaderDraft>(() =>
    sortedDispatches[0]
      ? headerFromDispatch(sortedDispatches[0])
      : {
          finance_approval: approvals[0] ? refId(approvals[0]._id || approvals[0].id) : "",
          dispatch_status: "draft",
          bill_number: "",
          billing_date: new Date().toISOString().split("T")[0],
          warehouse: "",
          warehouse_location: "",
          remarks: "",
          dispatch_assignee_user: "",
          dispatched_at: new Date().toISOString().split("T")[0],
        },
  );
  const [lines, setLines] = useState<DispatchItemDraft[]>(() =>
    sortedDispatches[0]
      ? (Array.isArray(sortedDispatches[0]?.dispatch_items ?? sortedDispatches[0]?.items)
          ? ((sortedDispatches[0]?.dispatch_items ?? sortedDispatches[0]?.items ?? []) as any[])
          : []
        ).map((item: any, i: number) => dispatchItemFromRaw(item, i, order.order_items))
      : dispatchItemsFromOrder(order.order_items),
  );

  const selectedDispatch = useMemo(
    () =>
      selectedId !== "new"
        ? sortedDispatches.find((d) => refId(d._id || d.id) === selectedId) || null
        : null,
    [sortedDispatches, selectedId],
  );

  useEffect(() => {
    if (selectedId === "new") return;
    if (!sortedDispatches.length) {
      setSelectedId("new");
      return;
    }
    const stillValid = sortedDispatches.some(
      (d) => refId(d._id || d.id) === selectedId,
    );
    if (!stillValid) {
      setSelectedId(refId(sortedDispatches[0]._id || sortedDispatches[0].id));
    }
  }, [sortedDispatches, selectedId]);

  useEffect(() => {
    if (selectedId === "new") return;
    if (!selectedDispatch) return;
    setHeader(headerFromDispatch(selectedDispatch));
    setLines(
      (Array.isArray(selectedDispatch.dispatch_items ?? selectedDispatch.items)
        ? ((selectedDispatch.dispatch_items ?? selectedDispatch.items ?? []) as any[])
        : []
      ).map((item: any, i: number) => dispatchItemFromRaw(item, i, order.order_items)),
    );
    setBillDocumentFile(null);
  }, [selectedDispatch, selectedId]);

  const selectedApprovalObj = useMemo(() => {
    const appId = selectedId === "new" ? header.finance_approval : refId(selectedDispatch?.finance_approval);
    return approvals.find(app => refId(app._id || app.id) === appId) || null;
  }, [selectedId, header.finance_approval, selectedDispatch, approvals]);

  const releaseSummary = useMemo(() => {
    if (!selectedApprovalObj) return null;
    return summarizeReleaseDispatchState(selectedApprovalObj, dispatches, order.order_items || []);
  }, [selectedApprovalObj, dispatches, order.order_items]);

  const clearedTotal = useMemo(() => {
    if (!selectedApprovalObj) return 0;
    const items = Array.isArray(selectedApprovalObj.approval_items)
      ? (selectedApprovalObj.approval_items as any[])
      : [];
    return items.reduce((sum, item) => sum + Number(item.approved_quantity || 0), 0);
  }, [selectedApprovalObj]);

  const handleSelectNew = () => {
    setSelectedId("new");
    setHeader({
      finance_approval: approvals[0] ? refId(approvals[0]._id || approvals[0].id) : "",
      dispatch_status: "draft",
      bill_number: "",
      billing_date: new Date().toISOString().split("T")[0],
      warehouse: "",
      warehouse_location: "",
      remarks: "",
      dispatch_assignee_user: "",
      dispatched_at: new Date().toISOString().split("T")[0],
    });
    setLines(dispatchItemsFromOrder(order.order_items));
    setBillDocumentFile(null);
  };

  const updateLine = (
    key: string,
    field: keyof DispatchItemDraft,
    value: unknown,
  ) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        return { ...line, [field]: value } as DispatchItemDraft;
      }),
    );
  };

  const handleSave = async () => {
    if (!selectedId) {
      toast.error("No dispatch batch selected");
      return;
    }
    const dispatch_items = lines.map((line) => ({
      order_item_id: line.order_item_id || undefined,
      product: line.product || undefined,
      dispatched_quantity: line.dispatched_quantity,
      delivered_quantity: line.delivered_quantity,
      returned_quantity: line.returned_quantity,
    }));

    if (selectedId === "new") {
      if (!header.finance_approval) {
        toast.error("Linked approval batch is required");
        return;
      }
      if (!header.bill_number.trim()) {
        toast.error("Bill number is required");
        return;
      }
      if (!billDocumentFile) {
        toast.error("Bill document file is required for new dispatches");
        return;
      }

      const formData = new FormData();
      formData.append("order", orderId);
      formData.append("finance_approval", header.finance_approval);
      formData.append("dispatch_status", header.dispatch_status);
      formData.append(
        "dispatch_date",
        header.dispatched_at
          ? new Date(header.dispatched_at).toISOString()
          : new Date().toISOString(),
      );
      formData.append("bill_number", header.bill_number.trim());
      formData.append("billing_date", new Date(header.billing_date).toISOString());
      
      const creationItems = lines.map((line) => ({
        order_item_id: line.order_item_id,
        product: line.product,
        dispatch_quantity: line.dispatched_quantity,
      })).filter((item) => item.dispatch_quantity > 0);

      if (creationItems.length === 0) {
        toast.error("Please enter a dispatch quantity for at least one item");
        return;
      }

      formData.append("items", JSON.stringify(creationItems));
      if (header.warehouse_location.trim()) {
        formData.append("warehouse_location", header.warehouse_location.trim());
      }
      if (header.remarks.trim()) {
        formData.append("remarks", header.remarks.trim());
      }
      if (header.dispatch_assignee_user) {
        formData.append("dispatch_assignee_user", header.dispatch_assignee_user);
      }
      formData.append("bill_document", billDocumentFile);

      await onCreate(formData);
    } else {
      await onSave(selectedId, {
        ...header,
        dispatch_assignee_user: header.dispatch_assignee_user || null,
        dispatch_items,
      });
    }
  };

  const inputClass =
    "w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs outline-none focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-950/40">
          <div>
            <h3 className="text-sm font-bold text-blue-950 dark:text-blue-100">
              Order Dispatches — {order.order_no || orderId}
            </h3>
            <p className="text-2xs text-blue-800/80 dark:text-blue-200/70">
              Select a batch or Create New, edit properties and quantities, then Save (super-admin bypass).
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
              {sortedDispatches.map((d) => {
                const id = refId(d._id || d.id);
                const active = id === selectedId;
                const label =
                  String(d.dispatch_no || "").trim() ||
                  `Dispatch ${formatDateOnly(d.createdAt)}`;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedId(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-blue-600 text-white shadow"
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
              onClick={handleSelectNew}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                selectedId === "new"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
              }`}
            >
              + Create New Dispatch
            </button>
          </div>

          {selectedId === "new" && approvals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-amber-800 bg-amber-50/50">
              No approval batches are available for this order to link with a new dispatch.
            </div>
          ) : (
            <>
              {/* Header Editor */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Batch Header Properties
                  </h4>
                  {releaseSummary ? (
                    <div className="rounded bg-blue-50 px-2 py-1 text-2xs text-blue-800 flex items-center gap-2 dark:bg-blue-950/40 dark:text-blue-300">
                      <span>
                        Cleared: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{clearedTotal}</span> &middot;{" "}
                        Available: <span className="font-semibold text-indigo-700 dark:text-indigo-300">{releaseSummary.dispatchableTotal}</span> &middot;{" "}
                        Remaining: <span className="font-semibold text-rose-600 dark:text-rose-400">{releaseSummary.remainingTotal}</span>
                      </span>
                      {releaseSummary.canResolveRelease && onSettleClick && (
                        <button
                          type="button"
                          onClick={() => onSettleClick(selectedApprovalObj!, String(selectedApprovalObj!.approval_no || ""))}
                          className="rounded bg-indigo-600 px-1.5 py-0.5 text-3xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
                        >
                          Settle Rest Order
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                  {selectedId === "new" ? (
                    <div>
                      <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                        Linked Approval Batch *
                      </label>
                      <select
                        value={header.finance_approval}
                        onChange={(e) =>
                          setHeader((prev) => ({
                            ...prev,
                            finance_approval: e.target.value,
                          }))
                        }
                        className={inputClass}
                        required
                      >
                        <option value="">— Select Approval —</option>
                        {approvals.map((app) => (
                          <option key={refId(app._id || app.id)} value={refId(app._id || app.id)}>
                            {String(app.approval_no || "")} · Rev #{String(app.revision_number ?? 1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Dispatch Status
                    </label>
                    <select
                      value={header.dispatch_status}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          dispatch_status: e.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="draft">draft</option>
                      <option value="submitted">submitted</option>
                      <option value="transport_created">transport_created</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Bill Number *
                    </label>
                    <input
                      type="text"
                      value={header.bill_number}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          bill_number: e.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="INV-XXXX"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Billing Date *
                    </label>
                    <input
                      type="date"
                      value={header.billing_date}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          billing_date: e.target.value,
                        }))
                      }
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Dispatch Date
                    </label>
                    <input
                      type="date"
                      value={header.dispatched_at}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          dispatched_at: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Warehouse Location
                    </label>
                    <input
                      type="text"
                      value={header.warehouse_location}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          warehouse_location: e.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="Shelf A1"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Assignee Staff
                    </label>
                    <select
                      value={header.dispatch_assignee_user}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          dispatch_assignee_user: e.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">— Unassigned —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedId === "new" ? (
                    <div>
                      <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                        Bill Document Copy *
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                        onChange={(e) => setBillDocumentFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-[10px] text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                        required
                      />
                    </div>
                  ) : null}
                  <div className={selectedId === "new" ? "sm:col-span-4" : "sm:col-span-2"}>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Remarks / Notes
                    </label>
                    <input
                      type="text"
                      value={header.remarks}
                      onChange={(e) =>
                        setHeader((prev) => ({ ...prev, remarks: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Items Editor */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Dispatched Items
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950 font-medium">
                      <tr>
                        <th className="px-3 py-2">Product Name</th>
                        <th className="px-3 py-2 text-center w-28">Ordered Qty</th>
                        <th className="px-3 py-2 text-center w-28">Dispatched Qty</th>
                        {selectedId !== "new" && (
                          <>
                            <th className="px-3 py-2 text-center w-28">Delivered Qty</th>
                            <th className="px-3 py-2 text-center w-28">Returned Qty</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {lines.map((line) => (
                        <tr key={line.key} className="bg-white dark:bg-slate-900">
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                            {line.product_label || line.product || "—"}
                          </td>
                          <td className="px-3 py-1.5 text-center font-semibold text-slate-500 dark:text-slate-400">
                            {line.ordered_quantity}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="number"
                              value={line.dispatched_quantity}
                              onChange={(e) =>
                                updateLine(
                                  line.key,
                                  "dispatched_quantity",
                                  Math.max(0, Number(e.target.value) || 0),
                                )
                              }
                              className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-center font-semibold text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </td>
                          {selectedId !== "new" && (
                            <>
                              <td className="px-3 py-1.5 text-center">
                                <input
                                  type="number"
                                  value={line.delivered_quantity}
                                  onChange={(e) =>
                                    updateLine(
                                      line.key,
                                      "delivered_quantity",
                                      Math.max(0, Number(e.target.value) || 0),
                                    )
                                  }
                                  className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-center font-semibold text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <input
                                  type="number"
                                  value={line.returned_quantity}
                                  onChange={(e) =>
                                    updateLine(
                                      line.key,
                                      "returned_quantity",
                                      Math.max(0, Number(e.target.value) || 0),
                                    )
                                  }
                                  className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-center font-semibold text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 shrink-0 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-950 dark:text-slate-350 dark:hover:bg-white/5"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || (selectedId === "new" && approvals.length === 0)}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {selectedId === "new" ? "Create dispatch" : "Save dispatch"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderDispatchesForm;

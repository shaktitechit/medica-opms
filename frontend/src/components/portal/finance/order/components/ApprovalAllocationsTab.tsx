"use client";

import { useMemo, useState, useEffect } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  useListOrderFinanceApprovalsQuery,
  useCreateOrderFinanceApprovalMutation,
  useApproveOrderFinanceApprovalMutation,
  useRejectOrderFinanceApprovalMutation,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

type ApprovalAllocationsTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 font-sans";
const labelClass = "text-xs font-semibold text-slate-700 dark:text-slate-300 font-sans";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5 font-sans";

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

function statusBadgeClass(status: string): string {
  if (status === "rejected") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-500/20";
  }
  if (status === "pending_review" || status === "pending") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/20";
  }
  if (status === "fully_approved" || status === "approved") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20";
  }
  if (status === "partially_approved") {
    return "bg-sky-50 text-sky-700 ring-1 ring-sky-600/15 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-500/20";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10";
}

function formatStatus(status: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type EditableItem = {
  order_item_id: string;
  product_name: string;
  sku: string;
  ordered_quantity: number;
  ordered_unit_price: number;
  approved_quantity: number;
  approved_unit_price: number;
  approval_status: string;
  remarks: string;
};

export function ApprovalAllocationsTab({ orderId, detail, refetchOrder }: ApprovalAllocationsTabProps) {
  const approvalsQ = useListOrderFinanceApprovalsQuery({ order: orderId });
  const [createApproval, { isLoading: isCreating }] = useCreateOrderFinanceApprovalMutation();
  const [approveApproval, { isLoading: isApproving }] = useApproveOrderFinanceApprovalMutation();
  const [rejectApproval, { isLoading: isRejecting }] = useRejectOrderFinanceApprovalMutation();

  const approvals = useMemo(() => {
    return pickList(approvalsQ.data);
  }, [approvalsQ.data]);

  // Form State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [creditLimitChecked, setCreditLimitChecked] = useState(false);
  const [outstandingChecked, setOutstandingChecked] = useState(false);
  const [riskLevel, setRiskLevel] = useState("low");
  const [notes, setNotes] = useState("");
  const [formItems, setFormItems] = useState<EditableItem[]>([]);

  // Initialize form items from order details
  useEffect(() => {
    if (detail && Array.isArray(detail.order_items)) {
      setFormItems(
        detail.order_items.map((item: any) => {
          const approvedSoFar = Number(item.approved_quantity ?? 0);
          const remainingQty = Math.max(0, Number(item.ordered_quantity ?? item.quantity ?? 1) - approvedSoFar);
          return {
            order_item_id: String(item._id ?? item.id ?? ""),
            product_name: String(item.product_name ?? ""),
            sku: String(item.sku ?? ""),
            ordered_quantity: Number(item.ordered_quantity ?? item.quantity ?? 1),
            ordered_unit_price: Number(item.unit_price ?? 0),
            approved_quantity: remainingQty,
            approved_unit_price: Number(item.unit_price ?? 0),
            approval_status: "fully_approved",
            remarks: "",
          };
        })
      );
    }
  }, [detail]);

  // Action State (for pending approval decision)
  const [decisionNotes, setDecisionNotes] = useState("");
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null);
  const [decisionType, setDecisionType] = useState<"approve" | "reject" | null>(null);

  const handleItemPropertyChange = (itemId: string, property: keyof EditableItem, value: any) => {
    setFormItems((prev) =>
      prev.map((item) => {
        if (item.order_item_id !== itemId) return item;
        const updated = { ...item, [property]: value };

        // UX helper: when status changes, automatically sync quantities
        if (property === "approval_status") {
          if (value === "rejected") {
            updated.approved_quantity = 0;
          } else if (value === "fully_approved") {
            const baseItem = detail?.order_items?.find((x: any) => String(x._id ?? x.id) === itemId) || {};
            const approvedSoFar = Number(baseItem.approved_quantity ?? 0);
            const remainingQty = Math.max(0, item.ordered_quantity - approvedSoFar);
            updated.approved_quantity = remainingQty;
            updated.approved_unit_price = item.ordered_unit_price;
          }
        }

        return updated;
      })
    );
  };

  const handleCreateApproval = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verify all item inputs
    for (const item of formItems) {
      const baseItem = detail?.order_items?.find((x: any) => String(x._id ?? x.id) === item.order_item_id) || {};
      const approvedSoFar = Number(baseItem.approved_quantity ?? 0);
      const remainingQty = Math.max(0, item.ordered_quantity - approvedSoFar);
      if (item.approved_quantity < 0) {
        toast.error(`Approved quantity for ${item.product_name} cannot be negative.`);
        return;
      }
      if (item.approved_quantity > remainingQty) {
        toast.error(`Approved quantity for ${item.product_name} cannot exceed remaining quantity (${remainingQty}).`);
        return;
      }
      if (item.approved_unit_price < 0) {
        toast.error(`Approved price for ${item.product_name} cannot be negative.`);
        return;
      }
    }

    // Calculate totals
    const approvedTotal = formItems.reduce(
      (sum, item) =>
        sum +
        (item.approval_status === "fully_approved" || item.approval_status === "partially_approved"
          ? item.approved_quantity * item.approved_unit_price
          : 0),
      0
    );

    const rejectedTotal = formItems.reduce(
      (sum, item) =>
        sum +
        (item.approval_status === "rejected"
          ? item.ordered_quantity * item.ordered_unit_price
          : item.approval_status === "partially_approved"
          ? (item.ordered_quantity - item.approved_quantity) * item.ordered_unit_price
          : 0),
      0
    );

    // If all items are rejected, suggest overall status is rejected
    const allRejected = formItems.every((item) => item.approval_status === "rejected");
    const derivedStatus = allRejected ? "rejected" : "pending_review";

    try {
      await createApproval({
        order: orderId,
        credit_limit_checked: creditLimitChecked,
        outstanding_checked: outstandingChecked,
        risk_level: riskLevel,
        approval_notes: notes.trim(),
        approval_status: derivedStatus,
        approved_total_amount: approvedTotal,
        rejected_total_amount: rejectedTotal,
        approval_items: formItems.map((item) => ({
          order_item_id: item.order_item_id,
          approved_quantity: item.approved_quantity,
          approved_unit_price: item.approved_unit_price,
          approved_total_amount: item.approved_quantity * item.approved_unit_price,
          approval_status: item.approval_status,
          remarks: item.remarks.trim(),
        })),
      }).unwrap();

      toast.success("Finance approval submitted and approved successfully.");
      setIsFormModalOpen(false);
      setCreditLimitChecked(false);
      setOutstandingChecked(false);
      setRiskLevel("low");
      setNotes("");
      approvalsQ.refetch();
      refetchOrder?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDecisionId || !decisionType) return;

    if (decisionType === "reject" && !decisionNotes.trim()) {
      toast.error("Rejection reason is required.");
      return;
    }

    try {
      if (decisionType === "approve") {
        await approveApproval({
          id: activeDecisionId,
          body: { approval_notes: decisionNotes.trim() || undefined },
        }).unwrap();
        toast.success("Finance approval approved.");
      } else {
        await rejectApproval({
          id: activeDecisionId,
          body: { rejection_reason: decisionNotes.trim() },
        }).unwrap();
        toast.success("Finance approval rejected.");
      }

      setDecisionNotes("");
      setActiveDecisionId(null);
      setDecisionType(null);
      approvalsQ.refetch();
      refetchOrder?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const hasRemainingQty = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return false;
    return detail.order_items.some((item: any) => {
      const approvedSoFar = Number(item.approved_quantity ?? 0);
      const remainingQty = Math.max(0, Number(item.ordered_quantity ?? item.quantity ?? 1) - approvedSoFar);
      return remainingQty > 0;
    });
  }, [detail]);

  const openFormModal = () => {
    setCreditLimitChecked(false);
    setOutstandingChecked(false);
    setRiskLevel("low");
    setNotes("");
    if (detail && Array.isArray(detail.order_items)) {
      setFormItems(
        detail.order_items.map((item: any) => {
          const approvedSoFar = Number(item.approved_quantity ?? 0);
          const remainingQty = Math.max(0, Number(item.ordered_quantity ?? item.quantity ?? 1) - approvedSoFar);
          return {
            order_item_id: String(item._id ?? item.id ?? ""),
            product_name: String(item.product_name ?? ""),
            sku: String(item.sku ?? ""),
            ordered_quantity: Number(item.ordered_quantity ?? item.quantity ?? 1),
            ordered_unit_price: Number(item.unit_price ?? 0),
            approved_quantity: remainingQty,
            approved_unit_price: Number(item.unit_price ?? 0),
            approval_status: "fully_approved",
            remarks: "",
          };
        })
      );
    }
    setIsFormModalOpen(true);
  };

  const hasPending = useMemo(() => {
    return approvals.some((a) => a.approval_status === "pending_review");
  }, [approvals]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Button to Create New Finance Approval */}
      <div className="flex flex-wrap justify-between items-center bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 dark:bg-slate-950/10 dark:border-white/5 gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 font-sans">Finance Release Panel</h2>
          <p className="text-xs text-slate-500 font-sans">Assess line item parameters, modify approved quantities/rates, and authorize releases.</p>
        </div>
        <div>
          {hasRemainingQty ? (
            <button
              type="button"
              onClick={openFormModal}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 font-sans"
            >
              Create Finance Approval
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              All items fully approved
            </span>
          )}
        </div>
      </div>

      {/* Popup Overlay Modal for Create Finance Approval */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-6xl rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
                  Create Multi-Part / Itemised Finance Approval
                </h3>
                <p className="text-xs text-slate-500 font-sans">
                  Modify approved quantities/rates and authorize release.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateApproval} className="space-y-6 mt-4">
              <div className="grid gap-4 sm:grid-cols-3 font-sans">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-slate-950/10 flex flex-col justify-center gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      id="credit-limit"
                      type="checkbox"
                      checked={creditLimitChecked}
                      onChange={(e) => setCreditLimitChecked(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="credit-limit" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Credit Limit Checked
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="outstanding"
                      type="checkbox"
                      checked={outstandingChecked}
                      onChange={(e) => setOutstandingChecked(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="outstanding" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Outstanding Balances Checked
                    </label>
                  </div>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="space-y-1">
                    <label htmlFor="notes" className={labelClass}>Approval Remarks</label>
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className={inputClass}
                      placeholder="Audit notes or overall release remarks..."
                    />
                  </div>
                </div>
              </div>

              {/* Line Items Approval Grid/Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Itemwise Allocation Details
                </h3>
                
                <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 font-sans text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200/90 dark:border-white/10">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2 text-right">Ordered Qty</th>
                        <th className="px-3 py-2 text-right">Approved So Far</th>
                        <th className="px-3 py-2 text-right">Remaining Qty</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 w-28 text-right">Approved Qty</th>
                        <th className="px-3 py-2 w-32 text-right">Approved Price</th>
                        <th className="px-3 py-2">Line Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 bg-white dark:divide-white/10 dark:bg-slate-900 font-sans">
                      {formItems.map((item) => {
                        const baseItem = detail?.order_items?.find((x: any) => String(x._id ?? x.id) === item.order_item_id) || {};
                        const approvedSoFar = Number(baseItem.approved_quantity ?? 0);
                        const remainingQty = Math.max(0, item.ordered_quantity - approvedSoFar);
                        
                        return (
                          <tr key={item.order_item_id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                            <td className="px-3 py-3">
                              <span className="font-semibold block text-slate-900 dark:text-slate-100">{item.product_name}</span>
                              {item.sku && <span className="text-[10px] text-slate-400">SKU: {item.sku}</span>}
                            </td>
                            <td className="px-3 py-3 text-right font-medium">{item.ordered_quantity}</td>
                            <td className="px-3 py-3 text-right font-medium text-slate-500">{approvedSoFar}</td>
                            <td className="px-3 py-3 text-right font-medium text-blue-600 dark:text-blue-400">{remainingQty}</td>
                            <td className="px-3 py-3 text-right font-mono font-medium text-slate-600 dark:text-slate-300">
                              {item.ordered_unit_price.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                max={remainingQty}
                                value={item.approved_quantity}
                                disabled={remainingQty === 0}
                                onChange={(e) => handleItemPropertyChange(item.order_item_id, "approved_quantity", Number(e.target.value) || 0)}
                                className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs dark:border-white/10 dark:bg-slate-950"
                              />
                            </td>
                            <td className="px-3 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={item.approved_unit_price}
                                disabled={remainingQty === 0}
                                onChange={(e) => handleItemPropertyChange(item.order_item_id, "approved_unit_price", Number(e.target.value) || 0)}
                                className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs dark:border-white/10 dark:bg-slate-950 font-mono"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                value={item.remarks}
                                disabled={remainingQty === 0}
                                onChange={(e) => handleItemPropertyChange(item.order_item_id, "remarks", e.target.value)}
                                placeholder="Optional line notes..."
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-950"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className={btnSecondaryClass}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50 font-sans"
                >
                  {isCreating ? "Submitting..." : "Create & Approve"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Card for Pending Approval decision */}
      {activeDecisionId && decisionType && (
        <DashboardCard
          title={decisionType === "approve" ? "Confirm Approval" : "Confirm Rejection"}
          description="Authorize or decline commercial release of this order."
        >
          <form onSubmit={handleDecisionSubmit} className="space-y-4 max-w-xl">
            <div className="space-y-1">
              <label className={labelClass}>
                {decisionType === "approve" ? "Remarks (Optional)" : "Rejection Reason (Required)"}
              </label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder={decisionType === "approve" ? "Type remarks..." : "Type rejection reason..."}
                required={decisionType === "reject"}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveDecisionId(null);
                  setDecisionType(null);
                  setDecisionNotes("");
                }}
                className={btnSecondaryClass}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isApproving || isRejecting}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition ${
                  decisionType === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isApproving || isRejecting ? "Processing..." : decisionType === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </form>
        </DashboardCard>
      )}

      {/* History and Existing Approvals */}
      <DashboardCard
        title="Finance Approvals Audit Trail"
        description="Audit records, item allocations, credit reviews, risk profiling, and decision logs."
      >
        {approvalsQ.isLoading ? (
          <p className="text-xs text-slate-500 font-sans">Loading approvals...</p>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-200">No finance approvals</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Submit a new finance approval request using the form.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((app) => {
              const isPending = app.approval_status === "pending_review";
              return (
                <div
                  key={app._id}
                  className="rounded-xl border border-slate-200/90 bg-slate-50/20 p-4 shadow-sm transition dark:border-white/10 dark:bg-slate-950/20 hover:border-slate-300 dark:hover:border-white/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/5">
                    <div>
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {app.approval_no}
                      </span>
                      <span className="mx-2 text-slate-300">|</span>
                      <span className="text-[10px] text-slate-500 font-sans">
                        Rev #{app.revision_number}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4 font-sans">
                    <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                      <span className="block text-slate-400 text-[10px] uppercase font-semibold">Credit Checked</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {app.credit_limit_checked ? "✅ Yes" : "❌ No"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                      <span className="block text-slate-400 text-[10px] uppercase font-semibold">Outstanding Checked</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {app.outstanding_checked ? "✅ Yes" : "❌ No"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                      <span className="block text-slate-400 text-[10px] uppercase font-semibold">Risk Level</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">
                        {app.risk_level}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                      <span className="block text-slate-400 text-[10px] uppercase font-semibold">Approved Total</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {app.approved_total_amount.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Itemised breakdowns within history card */}
                  {app.approval_items && app.approval_items.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded border border-slate-100 dark:border-white/5 text-[10px] font-sans">
                      <table className="w-full text-left bg-white/40 dark:bg-slate-900/30">
                        <thead>
                          <tr className="bg-slate-100/50 dark:bg-slate-950/40 text-slate-500 font-semibold">
                            <th className="px-2 py-1">Item</th>
                            <th className="px-2 py-1 text-right">Ordered</th>
                            <th className="px-2 py-1 text-right">Approved</th>
                            <th className="px-2 py-1">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                          {app.approval_items.map((it: any) => (
                            <tr key={it._id || it.order_item_id}>
                              <td className="px-2 py-1.5 font-medium">{it.product?.product_name || "—"}</td>
                              <td className="px-2 py-1.5 text-right font-medium">{it.ordered_quantity} @ {it.ordered_unit_price.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right font-medium text-slate-700 dark:text-slate-300">
                                {it.approved_quantity} @ {it.approved_unit_price.toFixed(2)}
                              </td>
                              <td className="px-2 py-1.5 text-slate-500 italic truncate max-w-[150px]" title={it.remarks || it.rejection_reason || it.hold_reason}>
                                {it.remarks || it.rejection_reason || it.hold_reason || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3 text-xs font-sans text-slate-600 dark:text-slate-300">
                    {app.approval_notes && (
                      <p className="bg-white p-2 rounded-lg border border-slate-100 dark:bg-slate-900 dark:border-white/5">
                        <span className="font-semibold text-slate-500 mr-1">Audit Notes:</span>
                        {app.approval_notes}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5 text-[10px] text-slate-500">
                    <span>Reviewed on {formatDate(app.reviewed_at)}</span>
                    {isPending && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDecisionId(app._id);
                            setDecisionType("approve");
                            setDecisionNotes("");
                          }}
                          className="rounded px-2.5 py-1 text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDecisionId(app._id);
                            setDecisionType("reject");
                            setDecisionNotes("");
                          }}
                          className="rounded px-2.5 py-1 text-[10px] font-semibold text-white bg-rose-600 hover:bg-rose-700 transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
export default ApprovalAllocationsTab;

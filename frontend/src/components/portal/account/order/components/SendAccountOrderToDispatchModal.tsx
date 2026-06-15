"use client";

import { useMemo } from "react";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";
import { idFromRef } from "./accountDispatchAvailability";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  usePatchDispatchMutation,
  usePatchOrderMutation,
  useTransitionOrderMutation,
} from "@/store/api";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";

type SendAccountOrderToDispatchModalProps = {
  open: boolean;
  orderId: string;
  orderNo: string;
  partyLabel: string;
  releaseLabel?: string;
  dispatchBatchNo?: string;
  detail: Record<string, unknown> | null;
  dispatches: Record<string, unknown>[];
  accountApprovals: Record<string, unknown>[];
  dispatchUsers: Record<string, unknown>[];
  userNameById: Record<string, string>;
  defaultDispatchUser?: string;
  onClose: () => void;
  onSuccess?: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function formatDateOnly(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

function orderNeedsDispatchPendingTransition(
  detail: Record<string, unknown> | null,
): boolean {
  if (!detail) return true;

  const legacyStatus =
    typeof detail.status === "string" ? detail.status.trim() : "";
  if (legacyStatus === "dispatch_pending") return false;

  const action = String(detail.current_action ?? "").trim();
  if (action === "sent_to_dispatch") return false;

  return deriveOrderWorkflowStatus(detail) !== "dispatch_pending";
}

function dispatchBatchUnits(dispatch: Record<string, unknown>): number {
  const items = Array.isArray(dispatch.dispatch_items)
    ? dispatch.dispatch_items
    : Array.isArray(dispatch.items)
      ? dispatch.items
      : [];
  return (items as Record<string, unknown>[]).reduce(
    (sum, item) => sum + Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0),
    0,
  );
}

export function SendAccountOrderToDispatchModal({
  open,
  orderId,
  orderNo,
  partyLabel,
  releaseLabel,
  dispatchBatchNo,
  detail,
  dispatches,
  accountApprovals,
  dispatchUsers,
  userNameById,
  defaultDispatchUser = "",
  onClose,
  onSuccess,
}: SendAccountOrderToDispatchModalProps) {
  const [patchDispatch, { isLoading: isPatchingDispatch }] = usePatchDispatchMutation();
  const [patchOrder, { isLoading: isPatchingOrder }] = usePatchOrderMutation();
  const [transitionOrder, { isLoading: isTransitioning }] = useTransitionOrderMutation();
  const isSubmitting = isPatchingDispatch || isPatchingOrder || isTransitioning;

  const previewTotals = useMemo(() => {
    let units = 0;
    for (const disp of dispatches) {
      units += dispatchBatchUnits(disp);
    }
    return { batches: dispatches.length, units };
  }, [dispatches]);

  const selectedDispatchIds = useMemo(() => {
    return dispatches
      .filter((disp) => {
        const status = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
        return status !== "cancelled";
      })
      .map((disp) => String(disp._id ?? disp.id ?? ""))
      .filter(Boolean);
  }, [dispatches]);

  const initialDispatchUser = useMemo(() => {
    if (dispatches.length === 1) {
      const batchAssignee = idFromRef(dispatches[0]?.dispatch_assignee_user);
      if (batchAssignee) return batchAssignee;
    }
    return defaultDispatchUser;
  }, [dispatches, defaultDispatchUser]);

  if (!open) return null;

  const existingDispatchAssignee = resolveUserDisplay(
    dispatches.length === 1
      ? dispatches[0]?.dispatch_assignee_user ?? detail?.assigned_dispatch_user
      : detail?.assigned_dispatch_user,
    userNameById,
  );

  const handleSubmit = async ({
    assignedDispatchUser,
    remarks,
  }: {
    assignedDispatchUser: string;
    remarks: string;
  }) => {
    if (!assignedDispatchUser) {
      toast.error("Please select a dispatch operator.");
      return;
    }
    if (selectedDispatchIds.length === 0) {
      toast.error("No dispatch batch selected.");
      return;
    }

    try {
      await Promise.all(
        selectedDispatchIds.map((dispatchId) =>
          patchDispatch({
            id: dispatchId,
            patch: { dispatch_assignee_user: assignedDispatchUser },
          }).unwrap(),
        ),
      );

      await patchOrder({
        id: orderId,
        patch: { assigned_dispatch_user: assignedDispatchUser },
      }).unwrap();

      const shouldTransition = orderNeedsDispatchPendingTransition(detail);
      if (shouldTransition) {
        await transitionOrder({
          id: orderId,
          body: {
            next_status: "dispatch_pending",
            remarks: remarks.trim() || "Order sent to dispatch by account",
          },
        }).unwrap();
      }

      toast.success(
        shouldTransition
          ? "Order sent to dispatch successfully."
          : "Dispatch operator assigned to batch successfully.",
      );
      onClose();
      onSuccess?.();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Send to Dispatch
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {dispatchBatchNo
                ? `Preview dispatch batch ${dispatchBatchNo} and assign a dispatch operator.`
                : releaseLabel
                  ? `Preview dispatch batches for release ${releaseLabel} and assign a dispatch operator.`
                  : "Preview recorded dispatch batches and assign a dispatch operator to take over execution."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const assignedDispatchUser = (
              form.elements.namedItem("assigned_dispatch_user") as HTMLSelectElement
            ).value;
            const remarks = (
              form.elements.namedItem("send_dispatch_remarks") as HTMLTextAreaElement
            ).value;
            void handleSubmit({ assignedDispatchUser, remarks });
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-slate-950/40">
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <span className="block text-slate-500 dark:text-slate-400">Order</span>
                  <span className="mt-0.5 block font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {orderNo}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500 dark:text-slate-400">Party</span>
                  <span className="mt-0.5 block font-semibold text-slate-800 dark:text-slate-200">
                    {partyLabel}
                  </span>
                </div>
                {dispatchBatchNo ? (
                  <div className="sm:col-span-2">
                    <span className="block text-slate-500 dark:text-slate-400">Dispatch batch</span>
                    <span className="mt-0.5 block font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {dispatchBatchNo}
                    </span>
                  </div>
                ) : releaseLabel ? (
                  <div className="sm:col-span-2">
                    <span className="block text-slate-500 dark:text-slate-400">Release</span>
                    <span className="mt-0.5 block font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {releaseLabel}
                    </span>
                  </div>
                ) : null}
              </div>
              <p className="mt-3 text-[11px] text-emerald-700 dark:text-emerald-300">
                {dispatchBatchNo
                  ? `${previewTotals.units} units in batch ${dispatchBatchNo}${releaseLabel ? ` · Release ${releaseLabel}` : ""}`
                  : releaseLabel
                    ? `${previewTotals.batches} dispatch batch${previewTotals.batches === 1 ? "" : "es"} · ${previewTotals.units} units in this release`
                    : `${accountApprovals.length} account-cleared approval batch${accountApprovals.length === 1 ? "" : "es"} · ${previewTotals.batches} dispatch batch${previewTotals.batches === 1 ? "" : "es"} · ${previewTotals.units} units recorded`}
              </p>
            </div>

            {dispatches.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Dispatch batches preview
                </h4>
                <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10">
                  <table className="w-full min-w-[640px] text-left text-[11px]">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
                      <tr>
                        <th className="px-3 py-2">Dispatch no</th>
                        <th className="px-3 py-2">Bill no</th>
                        <th className="px-3 py-2">Billing date</th>
                        <th className="px-3 py-2 text-right">Units</th>
                        <th className="px-3 py-2">Warehouse</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {dispatches.map((disp) => {
                        const dispId = String(disp._id ?? disp.id ?? "");
                        return (
                          <tr key={dispId} className="bg-white dark:bg-slate-900/40">
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {String(disp.dispatch_no ?? "—")}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                              {String(disp.bill_number ?? "—")}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                              {formatDateOnly(disp.billing_date)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-700 dark:text-blue-300">
                              {dispatchBatchUnits(disp)}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                              {String(disp.warehouse_location ?? disp.warehouse ?? "—")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5 border-t border-slate-100 pt-4 dark:border-white/5">
              <label className={labelClass} htmlFor="assigned_dispatch_user">
                Dispatch operator assignment *
              </label>
              {defaultDispatchUser && existingDispatchAssignee !== "—" ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Current assignee:{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {existingDispatchAssignee}
                  </span>
                  . You may reassign before sending.
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  The selected operator will receive this order in the dispatch queue.
                </p>
              )}
              <select
                id="assigned_dispatch_user"
                name="assigned_dispatch_user"
                defaultValue={initialDispatchUser}
                key={initialDispatchUser || "dispatch-user-select"}
                className={inputClass}
                disabled={isSubmitting}
                required
              >
                <option value="">— Select Dispatch Operator —</option>
                {dispatchUsers.map((u) => {
                  const id = String(u._id ?? u.id ?? "");
                  return (
                    <option key={id} value={id}>
                      {String(u.name || u.username || id)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="send_dispatch_remarks">
                Remarks (optional)
              </label>
              <textarea
                id="send_dispatch_remarks"
                name="send_dispatch_remarks"
                rows={3}
                disabled={isSubmitting}
                className={inputClass}
                placeholder="Notes for the dispatch team about billing, packing, or delivery priorities…"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5">
            <button type="button" onClick={onClose} disabled={isSubmitting} className={btnSecondaryClass}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || dispatchUsers.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {isSubmitting ? "Sending…" : "Send to Dispatch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SendAccountOrderToDispatchModal;

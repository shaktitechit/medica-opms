import React, { useState, useMemo } from "react";
import { Activity, ShieldCheck, X } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import { useChangeLeadStatusMutation, type LeadRecord, type LeadStatus } from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { LEAD_STATUS_CONFIG, getSelectableStatuses } from "./leadUtils";

type Props = {
  lead: LeadRecord;
  open: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function ChangeLeadStatusModal({
  lead,
  open,
  isAdmin = false,
  onClose,
  onSuccess,
}: Props) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [remarks, setRemarks] = useState<string>("");

  const [changeStatus, { isLoading }] = useChangeLeadStatusMutation();

  const selectableList = useMemo(
    () => getSelectableStatuses(lead.status, isAdmin),
    [lead.status, isAdmin]
  );

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === lead.status) {
      onClose();
      return;
    }

    try {
      await changeStatus({
        id: lead._id,
        status,
        remarks: remarks.trim() || undefined,
      }).unwrap();
      toast.success(`Status updated to ${LEAD_STATUS_CONFIG[status]?.label || status}`);
      onClose();
      onSuccess?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <LargeModalPortal>
      <ModalOverlay onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Update Lead Status
                  </h3>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      <ShieldCheck className="h-3 w-3" />
                      Admin Mode
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lead #{lead.lead_no} • Current:{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {LEAD_STATUS_CONFIG[lead.status]?.label || lead.status}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Status <span className="text-rose-500">*</span>
                </label>
                {!isAdmin && (
                  <span className="text-[11px] text-slate-400">
                    Showing workflow-permitted transitions
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selectableList.map(({ status: st, isAllowed }) => {
                  const cfg = LEAD_STATUS_CONFIG[st];
                  const isSelected = status === st;
                  const isCurrent = lead.status === st;

                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={!isAllowed}
                      onClick={() => isAllowed && setStatus(st)}
                      className={`relative flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition-all ${
                        !isAllowed
                          ? "cursor-not-allowed border-slate-100 bg-slate-50/40 text-slate-300 dark:border-white/5 dark:bg-slate-900/40 dark:text-slate-600 opacity-60"
                          : isSelected
                          ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-white/5"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isAllowed ? cfg.dot : "bg-slate-300 dark:bg-slate-600"
                        }`}
                      />
                      <span className="truncate">{cfg.label}</span>
                      {isCurrent && (
                        <span className="ml-auto text-[9px] font-normal uppercase text-slate-400">
                          Current
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Status Change Remarks (Optional)
              </label>
              <textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Reason for change, client update, or next steps..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || status === lead.status}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {isLoading ? "Saving..." : "Update Status"}
              </button>
            </div>
          </form>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}


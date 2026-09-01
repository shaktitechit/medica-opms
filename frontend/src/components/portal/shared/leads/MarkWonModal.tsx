/**
 * @fileoverview Modal to confirm marking lead as WON with remarks.
 * @module components/portal/shared/leads/MarkWonModal
 */
"use client";

import React, { useState } from "react";
import { Trophy, X, CheckCircle2, Building2, User, Phone, DollarSign } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useChangeLeadStatusMutation,
  type LeadRecord,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { formatCurrencyINR } from "./leadUtils";

type Props = {
  lead: LeadRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function MarkWonModal({ lead, open, onClose, onSuccess }: Props) {
  const [remarks, setRemarks] = useState<string>("");
  const [changeStatus, { isLoading }] = useChangeLeadStatusMutation();

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await changeStatus({
        id: lead._id,
        status: "won",
        remarks: remarks.trim() || "Marked as Won",
      }).unwrap();
      toast.success(`Lead #${lead.lead_no} marked as WON! 🎉`);
      onClose();
      onSuccess?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err) || "Failed to mark lead as won");
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
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Mark Lead as Won
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Confirm closing deal for Lead #{lead.lead_no}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Lead Summary Info Card */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-3.5 dark:bg-emerald-950/20">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    {lead.name}
                  </div>
                  {lead.company_name && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      <Building2 className="h-3 w-3 text-slate-400" />
                      {lead.company_name}
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Phone className="h-3 w-3 text-slate-400" />
                      {lead.phone}
                    </div>
                  )}
                </div>
                {lead.estimated_value ? (
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-semibold text-slate-500">
                      Deal Value
                    </div>
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                      {formatCurrencyINR(lead.estimated_value)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Remarks / Closure Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Closing Remarks / Notes (Optional)
              </label>
              <textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter key deal terms, agreed pricing, order details, or win reasons..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isLoading ? "Marking Won..." : "Confirm Mark Won"}
              </button>
            </div>
          </form>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}

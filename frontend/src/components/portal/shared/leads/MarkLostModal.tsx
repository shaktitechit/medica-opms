/**
 * @fileoverview Modal to mark lead as lost with required reason and remarks.
 * @module components/portal/shared/leads/MarkLostModal
 */
"use client";

import React, { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useMarkLeadLostMutation,
  useListLeadLostReasonsQuery,
  type LeadRecord,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

type Props = {
  lead: LeadRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const DEFAULT_REASONS = [
  "Price",
  "Competitor",
  "No Requirement",
  "Budget Issue",
  "Not Reachable",
  "Delayed Decision",
  "Duplicate Lead",
  "Invalid Lead",
  "Other",
];

export function MarkLostModal({ lead, open, onClose, onSuccess }: Props) {
  const [lostReason, setLostReason] = useState<string>("");
  const [lostReasonId, setLostReasonId] = useState<string>("");
  const [lostRemarks, setLostRemarks] = useState<string>("");

  const { data: lostReasons } = useListLeadLostReasonsQuery();
  const [markLost, { isLoading }] = useMarkLeadLostMutation();

  if (!open) return null;

  const reasons =
    Array.isArray(lostReasons) && lostReasons.length > 0
      ? lostReasons
      : DEFAULT_REASONS.map((name) => ({ _id: "", name }));

  const handleSelectReason = (reasonName: string, reasonId?: string) => {
    setLostReason(reasonName);
    setLostReasonId(reasonId || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lostReason) {
      toast.error("Please select a lost reason");
      return;
    }
    if (!lostRemarks.trim()) {
      toast.error("Please provide remarks/context for marking as lost");
      return;
    }

    try {
      await markLost({
        id: lead._id,
        lost_reason: lostReason,
        lost_reason_id: lostReasonId || undefined,
        lost_remarks: lostRemarks.trim(),
      }).unwrap();
      toast.success("Lead marked as Lost");
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Mark Lead as Lost
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lead #{lead.lead_no} • {lead.name}
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
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Primary Lost Reason <span className="text-rose-500">*</span>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {reasons.map((r) => {
                  const isSelected = lostReason === r.name;
                  return (
                    <button
                      key={r.name}
                      type="button"
                      onClick={() => handleSelectReason(r.name, r._id)}
                      className={`rounded-xl border p-2 text-center text-xs font-semibold transition-all ${
                        isSelected
                          ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm dark:border-rose-400 dark:bg-rose-950/40 dark:text-rose-300"
                          : "border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-white/5"
                      }`}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Lost Remarks & Feedback <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={lostRemarks}
                onChange={(e) => setLostRemarks(e.target.value)}
                placeholder="Explain why the deal fell through, competitor pricing, or client decision..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
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
                disabled={isLoading || !lostReason || !lostRemarks.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
              >
                {isLoading ? "Submitting..." : "Confirm Lost Lead"}
              </button>
            </div>
          </form>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}

/**
 * @fileoverview Modal to record outcome and complete a scheduled follow-up.
 * @module components/portal/shared/leads/CompleteFollowUpModal
 */
"use client";

import React, { useState } from "react";
import { CheckCircle, X } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useCompleteLeadFollowUpMutation,
  type LeadFollowUpRecord,
  type LeadFollowUpType,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

type Props = {
  followUp: LeadFollowUpRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function CompleteFollowUpModal({ followUp, open, onClose, onSuccess }: Props) {
  const [outcome, setOutcome] = useState<string>("");
  const [scheduleNext, setScheduleNext] = useState<boolean>(false);
  const [nextDate, setNextDate] = useState<string>("");
  const [nextTime, setNextTime] = useState<string>("11:00");
  const [nextType, setNextType] = useState<LeadFollowUpType>(followUp.type || "call");
  const [nextNotes, setNextNotes] = useState<string>("");

  const [completeFollowUp, { isLoading }] = useCompleteLeadFollowUpMutation();

  if (!open) return null;

  const leadId = typeof followUp.lead === "object" ? followUp.lead._id : followUp.lead;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome.trim()) {
      toast.error("Please record the follow-up outcome");
      return;
    }
    if (scheduleNext && !nextDate) {
      toast.error("Please select the next follow-up date");
      return;
    }

    try {
      await completeFollowUp({
        followUpId: followUp._id,
        leadId,
        outcome: outcome.trim(),
        next_follow_up_date: scheduleNext && nextDate ? nextDate : undefined,
        next_follow_up_time: scheduleNext && nextTime ? nextTime : undefined,
        next_type: scheduleNext ? nextType : undefined,
        next_notes: scheduleNext && nextNotes.trim() ? nextNotes.trim() : undefined,
      }).unwrap();

      toast.success("Follow-up completed successfully");
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Complete Follow-up
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {followUp.type.toUpperCase()} • Scheduled for:{" "}
                  {new Date(followUp.follow_up_date).toLocaleDateString()}
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
                Call / Meeting Outcome <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="What was discussed? Customer response, price feedback, decision timeline..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 dark:border-white/5 dark:bg-slate-800/20">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleNext}
                  onChange={(e) => setScheduleNext(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Schedule Next Follow-up
              </label>

              {scheduleNext && (
                <div className="mt-3 space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Next Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required={scheduleNext}
                        value={nextDate}
                        onChange={(e) => setNextDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Time
                      </label>
                      <input
                        type="time"
                        value={nextTime}
                        onChange={(e) => setNextTime(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Next Follow-up Notes
                    </label>
                    <input
                      type="text"
                      value={nextNotes}
                      onChange={(e) => setNextNotes(e.target.value)}
                      placeholder="Follow up on revised quotation..."
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              )}
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
                disabled={isLoading || !outcome.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {isLoading ? "Saving..." : "Record Outcome"}
              </button>
            </div>
          </form>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}

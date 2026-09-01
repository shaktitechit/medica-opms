/**
 * @fileoverview Modal to schedule a follow-up for a lead.
 * @module components/portal/shared/leads/FollowUpModal
 */
"use client";

import React, { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useCreateLeadFollowUpMutation,
  type LeadRecord,
  type LeadFollowUpType,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { FOLLOWUP_TYPE_CONFIG, canScheduleFollowUp } from "./leadUtils";

type Props = {
  lead: LeadRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const TYPES: LeadFollowUpType[] = [
  "call",
  "meeting",
  "email",
  "whatsapp",
  "visit",
  "demo",
  "other",
];

export function FollowUpModal({ lead, open, onClose, onSuccess }: Props) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split("T")[0];

  const [date, setDate] = useState<string>(defaultDate);
  const [time, setTime] = useState<string>("11:00");
  const [type, setType] = useState<LeadFollowUpType>("call");
  const [notes, setNotes] = useState<string>("");

  const [createFollowUp, { isLoading }] = useCreateLeadFollowUpMutation();

  if (!open) return null;

  if (lead && !canScheduleFollowUp(lead.status)) {
    return (
      <LargeModalPortal>
        <ModalOverlay onClick={onClose}>
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-white/10 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Follow-up Unavailable
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">
              Follow-ups cannot be scheduled for closed leads (Status:{" "}
              <span className="font-bold uppercase text-amber-600 dark:text-amber-400">
                {lead.status}
              </span>
              ).
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </ModalOverlay>
      </LargeModalPortal>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      toast.error("Please select a follow-up date");
      return;
    }

    try {
      await createFollowUp({
        leadId: lead._id,
        follow_up_date: date,
        follow_up_time: time || undefined,
        type,
        notes: notes.trim() || undefined,
      }).unwrap();

      toast.success("Follow-up scheduled successfully");
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Schedule Follow-up
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
                Follow-up Channel / Type
              </label>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {TYPES.map((t) => {
                  const isSelected = type === t;
                  const cfg = FOLLOWUP_TYPE_CONFIG[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`rounded-xl border p-2 text-center text-xs font-semibold transition-all ${
                        isSelected
                          ? "border-amber-500 bg-amber-50 text-amber-700 shadow-sm dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-300"
                          : "border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300"
                      }`}
                    >
                      {cfg?.label || t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Follow-up Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-amber-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Time (Optional)
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-amber-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Agenda / Discussion Points (Optional)
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Product demo, revised quote, requirement clarifications..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
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
                disabled={isLoading || !date}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50"
              >
                {isLoading ? "Scheduling..." : "Schedule Follow-up"}
              </button>
            </div>
          </form>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}

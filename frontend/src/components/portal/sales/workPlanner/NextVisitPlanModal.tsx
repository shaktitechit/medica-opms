"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useEffect, useState } from "react";

export type NextVisitPlanModalProps = {
  open: boolean;
  isSaving: boolean;
  partyLabel?: string;
  defaultDate?: string;
  /** Current plan date (YYYY-MM-DD) — next date must differ. */
  currentPlanDate?: string;
  onClose: () => void;
  onConfirm: (planDate: string) => void | Promise<void>;
};

export function NextVisitPlanModal({
  open,
  isSaving,
  partyLabel,
  defaultDate,
  currentPlanDate,
  onClose,
  onConfirm,
}: NextVisitPlanModalProps) {
  const [planDate, setPlanDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setPlanDate(defaultDate || "");
  }, [open, defaultDate]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isSaving, onClose]);

  if (!open) return null;

  const sameAsCurrent =
    Boolean(planDate) &&
    Boolean(currentPlanDate) &&
    planDate === currentPlanDate;

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
        role="presentation"
        onClick={() => !isSaving && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Next visit plan
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Pick a work plan date
              {partyLabel ? (
                <>
                  {" "}
                  for <span className="font-medium text-slate-700 dark:text-slate-200">{partyLabel}</span>
                </>
              ) : null}
              . A <span className="font-medium">new pending visit</span> is created on that
              day&apos;s plan (existing plan is reused, or a draft is created with location
              and sales user copied). The completed visit stays on the current plan.
            </p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Work plan date
              </label>
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
              {sameAsCurrent ? (
                <p className="mt-1 text-2xs text-rose-600">
                  Choose a date different from the current work plan.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/15"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || !planDate || sameAsCurrent}
              onClick={() => void onConfirm(planDate)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? "Scheduling…" : "Schedule next visit"}
            </button>
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}

export default NextVisitPlanModal;

"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useEffect, useState } from "react";

export type CompleteWorkModalProps = {
  open: boolean;
  isSaving: boolean;
  taskTitle?: string;
  onClose: () => void;
  onConfirm: (remarks: string) => void | Promise<void>;
};

export function CompleteWorkModal({
  open,
  isSaving,
  taskTitle,
  onClose,
  onConfirm,
}: CompleteWorkModalProps) {
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!open) setRemarks("");
  }, [open]);

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

  const canSubmit = Boolean(remarks.trim()) && !isSaving;

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
              Complete work task
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {taskTitle
                ? `Add completion remarks for “${taskTitle}”.`
                : "Add completion remarks for this work task."}
            </p>
          </div>
          <div className="px-5 py-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Completion remarks *
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              disabled={isSaving}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              placeholder="What was done / the outcome of this task?"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void onConfirm(remarks.trim())}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Complete"}
            </button>
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}

export default CompleteWorkModal;

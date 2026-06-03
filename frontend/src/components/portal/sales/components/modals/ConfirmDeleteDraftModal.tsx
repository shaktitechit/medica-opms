"use client";

import { useEffect } from "react";

export type ConfirmDeleteDraftModalProps = {
  /** When null/empty, modal is not shown. */
  orderId: string | null;
  /** Human-readable order reference (e.g. order no). */
  orderLabel: string;
  isDeleting: boolean;
  onClose: () => void;
  /** Called when user confirms; parent runs delete and handles errors. */
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDeleteDraftModal({
  orderId,
  orderLabel,
  isDeleting,
  onClose,
  onConfirm,
}: ConfirmDeleteDraftModalProps) {
  const open = orderId != null && orderId !== "";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isDeleting, onClose]);

  if (!open) return null;

  const label = orderLabel.trim() || orderId;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !isDeleting && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-draft-title"
        aria-describedby="delete-draft-desc"
        className="w-full max-w-md overflow-hidden rounded-xl border border-amber-200/90 bg-white shadow-xl dark:border-amber-900/40 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-amber-100 px-5 py-4 dark:border-amber-900/30">
          <h2
            id="delete-draft-title"
            className="text-lg font-semibold text-amber-950 dark:text-amber-100"
          >
            Delete draft order?
          </h2>
          <p
            id="delete-draft-desc"
            className="mt-2 text-sm text-slate-600 dark:text-slate-400"
          >
            This will move order{" "}
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {label}
            </span>{" "}
            to trash (soft delete). You can restore it later only if your role allows
            access to deleted orders.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-rose-600 dark:hover:bg-rose-500"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

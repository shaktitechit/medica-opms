"use client";

import { useEffect } from "react";

export type ConfirmBulkDeletePartiesModalProps = {
  isOpen: boolean;
  selectedCount: number;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmBulkDeletePartiesModal({
  isOpen,
  selectedCount,
  isDeleting,
  onClose,
  onConfirm,
}: ConfirmBulkDeletePartiesModalProps) {
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !isDeleting && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-parties-title"
        aria-describedby="delete-parties-desc"
        className="w-full max-w-md overflow-hidden rounded-xl border border-amber-200/90 bg-white shadow-xl dark:border-amber-900/40 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-amber-100 px-5 py-4 dark:border-amber-900/30">
          <h2
            id="delete-parties-title"
            className="text-lg font-semibold text-amber-950 dark:text-amber-100"
          >
            Delete {selectedCount} parties?
          </h2>
          <p
            id="delete-parties-desc"
            className="mt-2 text-sm text-slate-600 dark:text-slate-400"
          >
            This will move the{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {selectedCount} selected parties
            </span>{" "}
            to trash (soft delete). You can restore them later if needed.
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

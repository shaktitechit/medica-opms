"use client";

import { LargeModalPortal } from "./LargeModalPortal";
import { useEffect } from "react";

export type ConfirmDeletePartyModalProps = {
  partyId: string | null;
  partyLabel: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDeletePartyModal({
  partyId,
  partyLabel,
  isDeleting,
  onClose,
  onConfirm,
}: ConfirmDeletePartyModalProps) {
  const open = partyId != null && partyId !== "";

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

  const label = partyLabel.trim() || partyId;

  return (
    <LargeModalPortal>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !isDeleting && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-party-title"
        aria-describedby="delete-party-desc"
        className="w-full max-w-md overflow-hidden rounded-xl border border-amber-200/90 bg-white shadow-xl dark:border-amber-900/40 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-amber-100 px-5 py-4 dark:border-amber-900/30">
          <h2
            id="delete-party-title"
            className="text-lg font-semibold text-amber-950 dark:text-amber-100"
          >
            Delete party?
          </h2>
          <p
            id="delete-party-desc"
            className="mt-2 text-sm text-slate-600 dark:text-slate-400"
          >
            This will move party{" "}
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {label}
            </span>{" "}
            to trash (soft delete). You can restore it later if needed.
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
    </LargeModalPortal>
  );
}

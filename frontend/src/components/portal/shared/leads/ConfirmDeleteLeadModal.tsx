/**
 * @fileoverview Modal to confirm soft deletion of a lead.
 * @module components/portal/shared/leads/ConfirmDeleteLeadModal
 */
"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import { useDeleteLeadMutation, type LeadRecord } from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

type Props = {
  lead: LeadRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function ConfirmDeleteLeadModal({ lead, open, onClose, onSuccess }: Props) {
  const [deleteLead, { isLoading }] = useDeleteLeadMutation();

  if (!open) return null;

  const handleDelete = async () => {
    try {
      await deleteLead(lead._id).unwrap();
      toast.success("Lead removed successfully");
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
          className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Delete Lead
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lead #{lead.lead_no}
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

          <div className="mt-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to remove lead{" "}
              <strong className="text-slate-900 dark:text-white">
                {lead.name} ({lead.company_name || "Individual"})
              </strong>
              ?
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              This action soft-deletes the lead record and will preserve audit history.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
            >
              {isLoading ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}

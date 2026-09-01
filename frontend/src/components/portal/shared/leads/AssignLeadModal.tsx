/**
 * @fileoverview Modal to assign or reassign a lead to a sales representative.
 * @module components/portal/shared/leads/AssignLeadModal
 */
"use client";

import React, { useState } from "react";
import { UserCheck, X } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import { useAssignLeadMutation, useListUsersQuery, type LeadRecord } from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

type Props = {
  lead: LeadRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function AssignLeadModal({ lead, open, onClose, onSuccess }: Props) {
  const [assignedTo, setAssignedTo] = useState<string>(
    lead.assigned_to?._id || ""
  );
  const [notes, setNotes] = useState<string>("");

  const { data: usersData, isLoading: loadingUsers } = useListUsersQuery();
  const [assignLead, { isLoading }] = useAssignLeadMutation();

  if (!open) return null;

  const users = Array.isArray(usersData)
    ? usersData
    : (usersData as { data?: Array<{ _id: string; name: string; department?: string; email: string }> })?.data || [];

  const salesUsers = users.filter(
    (u) => u.department === "sales" || u.department === "admin" || u.department === "super_admin"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedTo) {
      toast.error("Please select a sales representative");
      return;
    }

    try {
      await assignLead({
        id: lead._id,
        assigned_to: assignedTo,
        notes: notes.trim() || undefined,
      }).unwrap();
      toast.success("Lead assigned successfully");
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Assign Lead
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
                Sales Executive <span className="text-rose-500">*</span>
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                disabled={loadingUsers}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Select sales user...</option>
                {salesUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.department}) - {u.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Assignment Note (Optional)
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add special instructions or context for the sales rep..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
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
                disabled={isLoading || !assignedTo}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {isLoading ? "Assigning..." : "Confirm Assignment"}
              </button>
            </div>
          </form>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}

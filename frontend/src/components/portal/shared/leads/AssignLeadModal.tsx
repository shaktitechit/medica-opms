/**
 * @fileoverview Modal to assign a lead — sales, admin, and finance can coexist.
 * - Super admin: edit all three dept slots independently.
 * - Admin / Sales / Finance: locked to self on own dept slot only.
 * @module components/portal/shared/leads/AssignLeadModal
 */
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { UserCheck, X, Users, Briefcase, DollarSign } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useAssignLeadMutation,
  useListUsersQuery,
  type LeadRecord,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import {
  isSuperAdmin,
  getUserDepartment,
  getDeptLabel,
  assignFieldForDept,
  type LeadAssignableDept,
} from "./leadUtils";

type Props = {
  lead: LeadRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type DeptSlot = LeadAssignableDept;

const DEPT_SLOTS: {
  id: DeptSlot;
  field: "assigned_sales" | "assigned_admin" | "assigned_finance";
  icon: React.ElementType;
  color: string;
}[] = [
  { id: "sales", field: "assigned_sales", icon: Users, color: "blue" },
  { id: "admin", field: "assigned_admin", icon: Briefcase, color: "indigo" },
  { id: "finance", field: "assigned_finance", icon: DollarSign, color: "emerald" },
];

const SLOT_COLORS: Record<string, { ring: string; badge: string }> = {
  blue: {
    ring: "focus:ring-blue-500/20 focus:border-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  indigo: {
    ring: "focus:ring-indigo-500/20 focus:border-indigo-500",
    badge: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
  emerald: {
    ring: "focus:ring-emerald-500/20 focus:border-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
};

function slotValueFromLead(
  lead: LeadRecord,
  field: "assigned_sales" | "assigned_admin" | "assigned_finance"
): string {
  const direct = lead[field];
  if (direct?._id) return direct._id;
  // Legacy fallback: if only assigned_to exists and matches this dept
  if (lead.assigned_to?._id && lead.assigned_to.department === field.replace("assigned_", "")) {
    return lead.assigned_to._id;
  }
  return "";
}

export function AssignLeadModal({ lead, open, onClose, onSuccess }: Props) {
  const authUser = useAppSelector((state) => state.auth.user);

  const userDept = getUserDepartment(authUser);
  const isSA = isSuperAdmin(authUser);
  const lockToSelf = !isSA;
  const authUserId = String(authUser?._id || authUser?.id || "");
  const ownField = assignFieldForDept(userDept);

  const [assignedSales, setAssignedSales] = useState(
    () => slotValueFromLead(lead, "assigned_sales")
  );
  const [assignedAdmin, setAssignedAdmin] = useState(
    () => slotValueFromLead(lead, "assigned_admin")
  );
  const [assignedFinance, setAssignedFinance] = useState(
    () => slotValueFromLead(lead, "assigned_finance")
  );
  const [notes, setNotes] = useState("");

  const { data: usersData, isLoading: loadingUsers } = useListUsersQuery();
  const [assignLead, { isLoading }] = useAssignLeadMutation();

  useEffect(() => {
    if (!lockToSelf || !authUserId || !ownField) return;
    if (ownField === "assigned_sales") setAssignedSales(authUserId);
    if (ownField === "assigned_admin") setAssignedAdmin(authUserId);
    if (ownField === "assigned_finance") setAssignedFinance(authUserId);
  }, [lockToSelf, authUserId, ownField]);

  const allUsers = Array.isArray(usersData)
    ? usersData
    : (
        usersData as {
          data?: Array<{
            _id: string;
            name: string;
            department?: string;
            email: string;
          }>;
        }
      )?.data || [];

  const usersByDept = useMemo(() => {
    const map: Record<DeptSlot, typeof allUsers> = {
      sales: [],
      admin: [],
      finance: [],
    };
    for (const u of allUsers) {
      if (u.department === "sales" || u.department === "admin" || u.department === "finance") {
        map[u.department].push(u);
      }
    }
    return map;
  }, [allUsers]);

  if (!open) return null;

  const slotState: Record<
    DeptSlot,
    { value: string; set: (v: string) => void }
  > = {
    sales: { value: assignedSales, set: setAssignedSales },
    admin: { value: assignedAdmin, set: setAssignedAdmin },
    finance: { value: assignedFinance, set: setAssignedFinance },
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (lockToSelf) {
        if (!authUserId || !ownField) {
          toast.error("Unable to assign: missing user or department");
          return;
        }
        await assignLead({
          id: lead._id,
          assigned_to: authUserId,
          notes: notes.trim() || undefined,
        }).unwrap();
        toast.success("Lead assigned to you successfully");
      } else {
        const payload = {
          id: lead._id,
          assigned_sales: assignedSales || null,
          assigned_admin: assignedAdmin || null,
          assigned_finance: assignedFinance || null,
          notes: notes.trim() || undefined,
        };
        if (!assignedSales && !assignedAdmin && !assignedFinance) {
          toast.error("Select at least one department assignee");
          return;
        }
        await assignLead(payload).unwrap();
        toast.success("Lead assignments updated");
      }
      onClose();
      onSuccess?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const selfUser = allUsers.find((u) => u._id === authUserId);
  const lockedLabel = selfUser?.name || authUser?.name || "You";

  const visibleSlots = isSA
    ? DEPT_SLOTS
    : DEPT_SLOTS.filter((s) => s.id === userDept || slotState[s.id].value);

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

          <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
            {isSA
              ? "A lead can have Sales, Admin, and Finance assignees at the same time."
              : `You are auto-assigned on the ${getDeptLabel(userDept)} slot. Other department assignees are preserved.`}
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {visibleSlots.map((slot) => {
              const Icon = slot.icon;
              const styles = SLOT_COLORS[slot.color];
              const { value, set } = slotState[slot.id];
              const isOwnLocked = lockToSelf && slot.field === ownField;
              const isOtherReadOnly = lockToSelf && slot.field !== ownField;
              const deptUsers = usersByDept[slot.id];

              return (
                <div key={slot.id}>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${styles.badge}`}
                    >
                      <Icon className="h-3 w-3" />
                      {getDeptLabel(slot.id)}
                    </span>
                    {isOwnLocked ? <span className="text-rose-500">*</span> : null}
                  </label>

                  {isOwnLocked ? (
                    <div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200">
                      {lockedLabel} (You)
                      {selfUser?.email ? (
                        <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                          — {selfUser.email}
                        </span>
                      ) : null}
                    </div>
                  ) : isOtherReadOnly ? (
                    <div className="mt-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-800/30 dark:text-slate-300">
                      {deptUsers.find((u) => u._id === value)?.name ||
                        lead[slot.field]?.name ||
                        "—"}
                      <span className="ml-1 text-[11px] text-slate-400">(read-only)</span>
                    </div>
                  ) : loadingUsers ? (
                    <div className="mt-1.5 h-9 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                  ) : (
                    <select
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className={`mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 dark:border-white/10 dark:bg-slate-800 dark:text-white ${styles.ring}`}
                    >
                      <option value="">Unassigned...</option>
                      {deptUsers.map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.name}
                          {u._id === authUserId ? " (You)" : ""} — {u.email}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Assignment Note{" "}
                <span className="font-normal text-slate-400">(Optional)</span>
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add special instructions or context..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
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
                disabled={
                  isLoading ||
                  (lockToSelf
                    ? !authUserId
                    : !assignedSales && !assignedAdmin && !assignedFinance)
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {isLoading
                  ? "Saving..."
                  : lockToSelf
                    ? "Assign to Me"
                    : "Save Assignments"}
              </button>
            </div>
          </form>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}

import React, { useState } from "react";
import { DashboardCard } from "@/components/widgets";
import { LargeModalPortal } from "./LargeModalPortal";
import {
  useListRemindersQuery,
  useCreateReminderMutation,
  useAddFollowUpMutation,
  usePatchReminderMutation,
  useDeleteReminderMutation,
  type ReminderRecord,
  type FollowUpItem,
} from "@/store/api";
import { useAppSelector } from "@/store";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

interface RemindersTabProps {
  orderId: string;
}

export function RemindersTab({ orderId }: RemindersTabProps) {
  const user = useAppSelector((state) => state.auth.user);
  const currentUserId = user ? String(user._id || user.id || "") : "";

  const { data: reminders = [], isLoading, refetch } = useListRemindersQuery({
    order: orderId,
    user: currentUserId || undefined,
  });
  const [createReminder, { isLoading: isCreating }] = useCreateReminderMutation();
  const [addFollowUp, { isLoading: isAddingFollowUp }] = useAddFollowUpMutation();
  const [patchReminder, { isLoading: isPatching }] = usePatchReminderMutation();
  const [deleteReminder, { isLoading: isDeleting }] = useDeleteReminderMutation();

  // Modal / Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newType, setNewType] = useState<"payment" | "remarks" | "follow_up" | "other">("follow_up");
  const [newRemarks, setNewRemarks] = useState("");
  const [newDate, setNewDate] = useState("");

  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedReminderId, setSelectedReminderId] = useState<string | null>(null);
  const [followUpRemarks, setFollowUpRemarks] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpStatus, setFollowUpStatus] = useState<"pending" | "completed" | "cancelled">("pending");

  const [completingReminderId, setCompletingReminderId] = useState<string | null>(null);
  const [deletingReminderId, setDeletingReminderId] = useState<string | null>(null);

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRemarks.trim() || !newDate) {
      toast.error("Please fill in all required fields.");
      return;
    }

    try {
      await createReminder({
        order: orderId,
        reminder_type: newType,
        remarks: newRemarks.trim(),
        followup_date: new Date(newDate).toISOString(),
      }).unwrap();

      toast.success("Reminder created successfully.");
      setShowCreateModal(false);
      setNewRemarks("");
      setNewDate("");
      setNewType("follow_up");
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleAddFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReminderId) return;
    if (!followUpRemarks.trim() || !followUpDate) {
      toast.error("Please fill in all required fields.");
      return;
    }

    try {
      await addFollowUp({
        id: selectedReminderId,
        remarks: followUpRemarks.trim(),
        followup_date: new Date(followUpDate).toISOString(),
        status: followUpStatus,
      }).unwrap();

      toast.success("Follow-up added successfully.");
      setShowFollowUpModal(false);
      setFollowUpRemarks("");
      setFollowUpDate("");
      setFollowUpStatus("pending");
      setSelectedReminderId(null);
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleCompleteReminder = async (id: string) => {
    try {
      await patchReminder({
        id,
        patch: { status: "completed" },
      }).unwrap();
      toast.success("Reminder marked as completed.");
      setCompletingReminderId(null);
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await deleteReminder(id).unwrap();
      toast.success("Reminder deleted successfully.");
      setDeletingReminderId(null);
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const formatDateTime = (v: unknown): string => {
    if (!v) return "—";
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const isPastDue = (dateStr?: string, status?: string): boolean => {
    if (!dateStr || status !== "active") return false;
    return new Date(dateStr).getTime() < Date.now();
  };

  return (
    <DashboardCard
      title="Payment & Follow-up Reminders"
      description="Track critical deadlines, record operator remarks, and schedule payment alerts."
    >
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 active:scale-95 cursor-pointer"
        >
          + Add Reminder
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500 py-6 text-center">Loading reminders...</p>
      ) : reminders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200/80 p-8 text-center dark:border-white/10">
          <p className="text-sm text-slate-500">No reminders scheduled for this order.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reminders.map((reminder: ReminderRecord) => {
            const activeFollowUps = reminder.follow_ups || [];
            const isReminderActive = reminder.status === "active";
            const dueAlert = isPastDue(reminder.next_followup_date, reminder.status);

            return (
              <div
                key={reminder._id || reminder.id}
                className={`rounded-xl border p-4 shadow-sm transition-all duration-200 ${
                  isReminderActive
                    ? dueAlert
                      ? "border-rose-200 bg-rose-50/20 dark:border-rose-500/20 dark:bg-rose-955/5"
                      : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/60"
                    : "border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-slate-950/40 opacity-75"
                }`}
              >
                {/* Reminder Card Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    {/* Reminder Type Badge */}
                    {reminder.reminder_type === "payment" && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400">
                        💰 Payment
                      </span>
                    )}
                    {reminder.reminder_type === "remarks" && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-600/10 dark:bg-blue-500/10 dark:text-blue-400">
                        📝 Remarks
                      </span>
                    )}
                    {reminder.reminder_type === "follow_up" && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-455/90">
                        ⏳ Follow-up
                      </span>
                    )}
                    {reminder.reminder_type === "other" && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-600/10 dark:bg-white/5 dark:text-slate-400">
                        📌 Other
                      </span>
                    )}

                    {/* Status Badge */}
                    {isReminderActive ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                        Active
                      </span>
                    ) : reminder.status === "completed" ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-455">
                        Dismissed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Next Date Display */}
                    {reminder.next_followup_date && (
                      <span
                        className={`text-xs font-medium font-sans ${
                          dueAlert
                            ? "text-rose-600 font-bold animate-pulse dark:text-rose-400"
                            : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {dueAlert ? "⚠️ Overdue: " : "Next follow-up: "}
                        {formatDateTime(reminder.next_followup_date)}
                      </span>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      {isReminderActive && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReminderId(reminder._id || reminder.id || null);
                              setShowFollowUpModal(true);
                            }}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-blue-600 transition"
                            title="Add Follow-up remarks"
                          >
                            💬
                          </button>
                          <button
                            type="button"
                            onClick={() => setCompletingReminderId(reminder._id || reminder.id || null)}
                            className="rounded px-2 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-400 transition hover:bg-emerald-100/50 cursor-pointer"
                            title="Mark Completed"
                          >
                            ✓ Done
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeletingReminderId(reminder._id || reminder.id || null)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-rose-600 transition cursor-pointer"
                        title="Delete Reminder"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>

                {/* Follow-up Timeline list */}
                <div className="mt-4 pl-2">
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 font-sans">
                    Remarks & Action Log ({activeFollowUps.length})
                  </h4>
                  {activeFollowUps.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No notes recorded.</p>
                  ) : (
                    <div className="flow-root pl-1">
                      <ul className="-mb-8">
                        {activeFollowUps.map((log: FollowUpItem, logIdx: number) => {
                          const logCreator = typeof log.created_by === "object" ? log.created_by : null;
                          const creatorName = logCreator?.name || "System";
                          const isFollowUpCompleted = log.status === "completed";

                          return (
                            <li key={log._id || log.id || logIdx}>
                              <div className="relative pb-6">
                                {logIdx !== activeFollowUps.length - 1 && (
                                  <span
                                    className="absolute top-4 left-3 -ml-px h-full w-0.5 bg-slate-100 dark:bg-white/5"
                                    aria-hidden="true"
                                  />
                                )}
                                <div className="relative flex space-x-3">
                                  <div>
                                    <span
                                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ring-4 ring-white dark:ring-slate-900 ${
                                        isFollowUpCompleted
                                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                                          : "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-400"
                                      }`}
                                    >
                                      {isFollowUpCompleted ? "✓" : "⏰"}
                                    </span>
                                  </div>
                                  <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-0.5">
                                    <div>
                                      <p className="text-xs text-slate-800 dark:text-slate-200">
                                        {log.remarks}
                                      </p>
                                      {log.followup_date && (
                                        <span className="block mt-0.5 text-[10px] text-slate-455 font-sans">
                                          Follow-up scheduled for: {formatDateTime(log.followup_date)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-right text-[10px] whitespace-nowrap text-slate-500 font-sans">
                                      <span className="font-semibold">{creatorName}</span>
                                      <span className="block mt-0.5 text-[9px]">
                                        {formatDateTime(log.createdAt)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE REMINDER MODAL */}
      {showCreateModal && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 font-sans animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Create Reminder</h3>
            <form onSubmit={handleCreateReminder} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Reminder Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="follow_up">⏳ General Follow-up</option>
                  <option value="payment">💰 Payment Follow-up</option>
                  <option value="remarks">📝 Remarks / Documentation</option>
                  <option value="other">📌 Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Scheduled Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Remarks / Follow-up Notes</label>
                <textarea
                  required
                  rows={3}
                  value={newRemarks}
                  onChange={(e) => setNewRemarks(e.target.value)}
                  placeholder="Enter specific remarks or actions for this follow-up..."
                  className="w-full mt-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2 text-xs font-bold font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewRemarks("");
                    setNewDate("");
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-lg bg-blue-600 px-3.5 py-2 text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Save Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </LargeModalPortal>
      )}

      {/* ADD FOLLOW-UP MODAL */}
      {showFollowUpModal && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 font-sans animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-555 dark:text-slate-50">Log Follow-up Remark</h3>
            <form onSubmit={handleAddFollowUp} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Next Follow-up Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Follow-up Remarks</label>
                <textarea
                  required
                  rows={3}
                  value={followUpRemarks}
                  onChange={(e) => setFollowUpRemarks(e.target.value)}
                  placeholder="Enter what was discussed, payment promises, or new details..."
                  className="w-full mt-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Status Outcome</label>
                <select
                  value={followUpStatus}
                  onChange={(e) => setFollowUpStatus(e.target.value as any)}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="pending">⏳ Pending Next Follow-up</option>
                  <option value="completed">✓ Completed (Resolve Reminder)</option>
                  <option value="cancelled">✕ Cancelled</option>
                </select>
              </div>

              <div className="mt-5 flex justify-end gap-2 text-xs font-bold font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setShowFollowUpModal(false);
                    setFollowUpRemarks("");
                    setFollowUpDate("");
                    setFollowUpStatus("pending");
                    setSelectedReminderId(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingFollowUp}
                  className="rounded-lg bg-blue-600 px-3.5 py-2 text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
                >
                  {isAddingFollowUp ? "Saving..." : "Log Follow-up"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </LargeModalPortal>
      )}

      {/* CONFIRM COMPLETE MODAL */}
      {completingReminderId && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 font-sans animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Complete Reminder</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to mark this reminder as completed? This will update its status and archive it from active reminders.
            </p>
            <div className="mt-6 flex justify-end gap-2 text-xs font-bold font-sans">
              <button
                type="button"
                onClick={() => setCompletingReminderId(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCompleteReminder(completingReminderId)}
                disabled={isPatching}
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-white transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                {isPatching ? "Updating..." : "Yes, Complete"}
              </button>
            </div>
          </div>
        </div>
        </LargeModalPortal>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deletingReminderId && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 font-sans animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Delete Reminder</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to delete this reminder? This action is permanent.
            </p>
            <div className="mt-6 flex justify-end gap-2 text-xs font-bold font-sans">
              <button
                type="button"
                onClick={() => setDeletingReminderId(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteReminder(deletingReminderId)}
                disabled={isDeleting}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-white transition hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
        </LargeModalPortal>
      )}
    </DashboardCard>
  );
}

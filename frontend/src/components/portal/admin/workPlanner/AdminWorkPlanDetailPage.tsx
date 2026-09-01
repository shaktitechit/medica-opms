"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarPlus, Check, LogIn, LogOut, Pencil, Plus, Receipt, Route, X } from "lucide-react";

import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { CompleteVisitModal } from "./CompleteVisitModal";
import { CompleteWorkModal } from "./CompleteWorkModal";
import { ExpenseListSection } from "./ExpenseListSection";
import { NextVisitPlanModal } from "./NextVisitPlanModal";
import { RejectWorkPlanModal } from "./RejectWorkPlanModal";
import { VisitFormModal } from "./VisitFormModal";
import {
  canEditPlan,
  formatDateTime,
  formatPlanDate,
  visitPartyLabel,
  planIdOf,
  renderPlanStatusBadge,
  renderVisitStatusBadge,
  salesUserLabel
} from "./workPlanUtils";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useAddWorkPlanVisitMutation,
  useApproveWorkPlanMutation,
  useCheckInWorkPlanVisitMutation,
  useCheckOutWorkPlanVisitMutation,
  useCompleteWorkPlanVisitMutation,
  useGetWorkPlanQuery,
  usePatchWorkPlanVisitMutation,
  useRejectWorkPlanMutation,
  useScheduleNextWorkPlanVisitMutation,
  useAddWorkPlanWorkMutation,
  usePatchWorkPlanWorkMutation,
  useDeleteWorkPlanWorkMutation,
  type WorkPlanVisitRecord,
  type WorkPlanWorkRecord,
} from "@/store/api";
import { WorkFormModal } from "./WorkFormModal";

type Props = {
  planId: string;
  portalHome?: string;
};

export default function AdminWorkPlanDetailPage({
  planId,
  portalHome = "/admin",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const base = portalHome;
  const isAdmin = true;

  const { data: plan, isLoading, isFetching, isError } = useGetWorkPlanQuery(
    planId,
    { skip: !planId }
  );
  const [approvePlan, approveState] = useApproveWorkPlanMutation();
  const [rejectPlan, rejectState] = useRejectWorkPlanMutation();
  const [checkIn, checkInState] = useCheckInWorkPlanVisitMutation();
  const [checkOut, checkOutState] = useCheckOutWorkPlanVisitMutation();
  const [completeVisit, completeState] = useCompleteWorkPlanVisitMutation();
  const [scheduleNext, scheduleNextState] = useScheduleNextWorkPlanVisitMutation();
  const [addVisit, addVisitState] = useAddWorkPlanVisitMutation();
  const [patchVisit, patchVisitState] = usePatchWorkPlanVisitMutation();
  const [addWork, addWorkState] = useAddWorkPlanWorkMutation();
  const [patchWork, patchWorkState] = usePatchWorkPlanWorkMutation();
  const [deleteWork, deleteWorkState] = useDeleteWorkPlanWorkMutation();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [addVisitOpen, setAddVisitOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<WorkPlanVisitRecord | null>(null);
  const [completeTarget, setCompleteTarget] = useState<WorkPlanVisitRecord | null>(
    null
  );
  const [nextVisitTarget, setNextVisitTarget] = useState<WorkPlanVisitRecord | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<"visits" | "works" | "expenses">("visits");
  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<WorkPlanWorkRecord | null>(null);
  const [completeWorkTarget, setCompleteWorkTarget] =
    useState<WorkPlanWorkRecord | null>(null);

  const hasVisitsTab = !plan || plan.plan_type === "Visits" || !plan.plan_type;
  const hasWorksTab = plan && (plan.plan_type === "Work From Home" || plan.plan_type === "Work From Office");
  const hasExpensesTab = hasVisitsTab;

  useEffect(() => {
    if (plan && plan.plan_type) {
      if (plan.plan_type === "Visits") {
        setActiveTab("visits");
      } else if (plan.plan_type === "Work From Home" || plan.plan_type === "Work From Office") {
        setActiveTab("works");
      } else {
        setActiveTab("visits");
      }
    }
  }, [plan]);

  const visits = plan?.visits ?? [];
  const works = plan?.works ?? [];
  const busy =
    isLoading ||
    isFetching ||
    approveState.isLoading ||
    rejectState.isLoading ||
    checkInState.isLoading ||
    checkOutState.isLoading ||
    completeState.isLoading ||
    scheduleNextState.isLoading ||
    addVisitState.isLoading ||
    patchVisitState.isLoading ||
    addWorkState.isLoading ||
    patchWorkState.isLoading ||
    deleteWorkState.isLoading;

  const currentPlanDateYmd = plan?.plan_date
    ? new Date(plan.plan_date).toISOString().slice(0, 10)
    : "";

  async function handleApprove() {
    try {
      await approvePlan(planId).unwrap();
      toast.success("Work plan approved");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleReject(reason: string) {
    try {
      await rejectPlan({ id: planId, rejection_reason: reason }).unwrap();
      toast.success("Work plan rejected");
      setRejectOpen(false);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleScheduleNext(planDate: string) {
    if (!nextVisitTarget) return;
    try {
      const result = await scheduleNext({
        id: planId,
        visitId: planIdOf(nextVisitTarget),
        plan_date: planDate,
      }).unwrap();
      const targetId = planIdOf(result);
      toast.success(
        result._meta?.created
          ? "Draft work plan created with a new pending visit"
          : "New pending visit created on that work plan",
      );
      setNextVisitTarget(null);
      if (targetId) {
        router.push(`${base}/work-planner/${targetId}`);
      }
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleAddVisitSubmit(body: Record<string, unknown>) {
    try {
      await addVisit({ id: planId, body }).unwrap();
      toast.success("Visit added successfully");
      setAddVisitOpen(false);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleEditVisitSubmit(body: Record<string, unknown>) {
    if (!editingVisit) return;
    try {
      await patchVisit({
        id: planId,
        visitId: planIdOf(editingVisit),
        patch: body,
      }).unwrap();
      toast.success("Visit updated successfully");
      setEditingVisit(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleWorkSubmit(body: Record<string, unknown>) {
    try {
      if (editingWork) {
        const workId = planIdOf(editingWork);
        await patchWork({ id: planId, workId, patch: body }).unwrap();
        toast.success("Work task updated");
      } else {
        await addWork({ id: planId, body }).unwrap();
        toast.success("Work task added");
      }
      setWorkModalOpen(false);
      setEditingWork(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleDeleteWork(work: WorkPlanWorkRecord) {
    const workId = planIdOf(work);
    try {
      await deleteWork({ id: planId, workId }).unwrap();
      toast.success("Work task removed");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleCompleteWork(remarks: string) {
    if (!completeWorkTarget) return;
    try {
      await patchWork({
        id: planId,
        workId: planIdOf(completeWorkTarget),
        patch: { status: "completed", completion_remarks: remarks },
      }).unwrap();
      toast.success("Work task completed");
      setCompleteWorkTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  const canAddVisit = plan && ["draft", "rejected", "approved"].includes(plan.status || "");

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <PortalBusyOverlay active={busy} message="Loading…" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={`${base}/work-planner`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium dark:border-white/15"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Work plan details
            </h1>
            {plan ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{formatPlanDate(plan.plan_date)}</span>
                {renderPlanStatusBadge(plan.status)}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan && canEditPlan(plan.status, { isAdmin }) ? (
            <button
              type="button"
              onClick={() => router.push(`${base}/work-planner/${planId}/edit`)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/15"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : null}
          {isAdmin && plan?.status === "submitted" ? (
            <>
              <button
                type="button"
                onClick={() => void handleApprove()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </button>
            </>
          ) : null}
        </div>
      </div>

      {isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Failed to load work plan.
        </div>
      ) : null}

      {plan ? (
        <>
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-slate-900 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Sales executive
              </div>
              <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                {salesUserLabel(plan.sales_user)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Plan Type
              </div>
              <div className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                {plan.plan_type || "Visits"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Location / City
              </div>
              <div className="mt-0.5 text-slate-700 dark:text-slate-300">
                {plan.location || "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Remarks
              </div>
              <div className="mt-0.5 text-slate-700 dark:text-slate-300">
                {plan.remarks || "—"}
              </div>
            </div>
            {hasExpensesTab ? (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Expenses
                </div>
                <div className="mt-0.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {(plan.expense_total ?? 0).toLocaleString()}
                  {plan.expense_approved_total != null ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      (approved {(plan.expense_approved_total ?? 0).toLocaleString()})
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {plan.submitted_at ? (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Submitted
                </div>
                <div className="mt-0.5">{formatDateTime(plan.submitted_at)}</div>
              </div>
            ) : null}
            {plan.approved_at ? (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Approved
                </div>
                <div className="mt-0.5">
                  {formatDateTime(plan.approved_at)}
                  {plan.approved_by
                    ? ` · ${salesUserLabel(plan.approved_by)}`
                    : ""}
                </div>
              </div>
            ) : null}
            {plan.rejection_reason ? (
              <div className="sm:col-span-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Rejection reason
                </div>
                <div className="mt-0.5 text-rose-700 dark:text-rose-400">
                  {plan.rejection_reason}
                </div>
              </div>
            ) : null}
          </div>

          {isAdmin && plan.status === "submitted" ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/30">
              <h2 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                Admin approval
              </h2>
              <p className="mt-1 text-xs text-indigo-800/80 dark:text-indigo-200/80">
                Review the visit sequence below, then approve or reject this plan.
              </p>
            </div>
          ) : <div className="flex border-b border-slate-200 dark:border-white/10">
            {hasVisitsTab && (
              <button
                type="button"
                onClick={() => setActiveTab("visits")}
                className={`-mb-px flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${activeTab === "visits"
                    ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
              >
                <Route className="h-4 w-4" />
                Visits ({visits.length})
              </button>
            )}
            {hasWorksTab && (
              <button
                type="button"
                onClick={() => setActiveTab("works")}
                className={`-mb-px flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${activeTab === "works"
                    ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
              >
                <Check className="h-4 w-4" />
                Work Tasks ({works.length})
              </button>
            )}
            {hasExpensesTab && (
              <button
                type="button"
                onClick={() => setActiveTab("expenses")}
                className={`-mb-px flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${activeTab === "expenses"
                    ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
              >
                <Receipt className="h-4 w-4" />
                Expenses ({plan.expenses?.length ?? 0})
              </button>
            )}
          </div>}

          {activeTab === "visits" && hasVisitsTab ? (
            <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Visits ({visits.length})
                </h2>
                {canAddVisit ? (
                  <button
                    type="button"
                    onClick={() => setAddVisitOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Visit
                  </button>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Party</th>
                      <th className="px-3 py-2 font-semibold">Purpose</th>
                      <th className="px-3 py-2 font-semibold">Planned</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                          No visits scheduled.
                        </td>
                      </tr>
                    ) : (
                      visits.map((v) => {
                        const visitId = planIdOf(v);
                        const canExecute = plan.status === "approved";
                        return (
                          <tr
                            key={visitId}
                            className="border-t border-slate-100 dark:border-white/5"
                          >
                            <td className="px-3 py-2">{v.sequence}</td>
                            <td className="px-3 py-2 font-medium">
                              {visitPartyLabel(v)}
                              {v.address ? (
                                <div className="mt-0.5 text-[10px] font-normal text-slate-500">
                                  {v.address}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">{v.purpose || "—"}</td>
                            <td className="px-3 py-2">
                              {v.planned_start_time ? formatDateTime(v.planned_start_time) : "—"}
                              <div className="text-slate-500">
                                {v.planned_end_time ? formatDateTime(v.planned_end_time) : ""}
                              </div>
                            </td>
                            <td className="px-3 py-2">{renderVisitStatusBadge(v.status)}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                {canAddVisit &&
                                ["pending", "rescheduled", "checked_in"].includes(v.status || "") ? (
                                  <button
                                    type="button"
                                    onClick={() => setEditingVisit(v)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-white/15 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    Edit
                                  </button>
                                ) : null}
                                {canExecute &&
                                (v.status === "pending" || v.status === "rescheduled") ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await checkIn({ id: planId, visitId }).unwrap();
                                        toast.success("Checked in");
                                      } catch (rejected) {
                                        toast.error(mutationRejectedMessage(rejected));
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-amber-200 px-2 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-900/40"
                                  >
                                    <LogIn className="h-3 w-3" />
                                    Check in
                                  </button>
                                ) : null}
                                {canExecute && v.status === "checked_in" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await checkOut({ id: planId, visitId }).unwrap();
                                          toast.success("Checked out");
                                        } catch (rejected) {
                                          toast.error(mutationRejectedMessage(rejected));
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-white/15"
                                    >
                                      <LogOut className="h-3 w-3" />
                                      Out
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setCompleteTarget(v)}
                                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                                    >
                                      Complete
                                    </button>
                                  </>
                                ) : null}
                                {canExecute && v.status === "pending" ? (
                                  <button
                                    type="button"
                                    onClick={() => setCompleteTarget(v)}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                                  >
                                    Complete
                                  </button>
                                ) : null}
                                {v.status === "completed" ? (
                                  <button
                                    type="button"
                                    onClick={() => setNextVisitTarget(v)}
                                    className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700"
                                  >
                                    <CalendarPlus className="h-3 w-3" />
                                    Next Visit Plan
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === "works" && hasWorksTab ? (
            <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Work Tasks ({works.length})
                </h2>
                {canAddVisit ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingWork(null);
                      setWorkModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Task
                  </button>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Title</th>
                      <th className="px-3 py-2 font-semibold">Description</th>
                      <th className="px-3 py-2 font-semibold">Planned Time</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {works.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                          No work tasks defined.
                        </td>
                      </tr>
                    ) : (
                      works.map((w) => (
                        <tr
                          key={planIdOf(w)}
                          className="border-t border-slate-100 dark:border-white/5"
                        >
                          <td className="px-3 py-2">{w.sequence}</td>
                          <td className="px-3 py-2 font-medium">{w.title}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[200px]">
                            <div className="truncate">{w.description || "—"}</div>
                            {w.completion_remarks ? (
                              <div className="mt-0.5 whitespace-normal text-[10px] text-slate-500">
                                Remarks: {w.completion_remarks}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {w.planned_start_time ? formatDateTime(w.planned_start_time) : "—"}
                            <div className="text-slate-500">
                              {w.planned_end_time ? formatDateTime(w.planned_end_time) : ""}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                (w.status || "pending") === "completed"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : (w.status || "pending") === "cancelled"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              }`}
                            >
                              {(w.status || "pending").replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              {plan.status === "approved" && (w.status || "pending") === "pending" ? (
                                <button
                                  type="button"
                                  onClick={() => setCompleteWorkTarget(w)}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                >
                                  Complete
                                </button>
                              ) : null}
                              {canAddVisit ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingWork(w);
                                      setWorkModalOpen(true);
                                    }}
                                    className="rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-white/15"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteWork(w)}
                                    className="rounded border border-rose-200 px-2 py-1 text-rose-600 dark:border-rose-900/40"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === "expenses" && hasExpensesTab ? (
            <ExpenseListSection
              planId={planId}
              expenses={plan.expenses ?? []}
              visits={visits}
              expenseTotal={plan.expense_total}
              expenseApprovedTotal={plan.expense_approved_total}
              isAdmin={isAdmin}
              canManage
            />
          ) : null}
        </>
      ) : null}

      <RejectWorkPlanModal
        open={rejectOpen}
        isRejecting={rejectState.isLoading}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
      />
      <CompleteVisitModal
        open={completeTarget != null}
        isSaving={completeState.isLoading}
        onClose={() => setCompleteTarget(null)}
        onConfirm={async (payload) => {
          if (!completeTarget) return;
          try {
            await completeVisit({
              id: planId,
              visitId: planIdOf(completeTarget),
              ...payload,
            }).unwrap();
            toast.success("Visit completed");
            setCompleteTarget(null);
          } catch (rejected) {
            toast.error(mutationRejectedMessage(rejected));
          }
        }}
      />
      <CompleteWorkModal
        open={completeWorkTarget != null}
        isSaving={patchWorkState.isLoading}
        taskTitle={completeWorkTarget?.title}
        onClose={() => setCompleteWorkTarget(null)}
        onConfirm={handleCompleteWork}
      />
      <NextVisitPlanModal
        open={nextVisitTarget != null}
        isSaving={scheduleNextState.isLoading}
        partyLabel={nextVisitTarget ? visitPartyLabel(nextVisitTarget) : undefined}
        currentPlanDate={currentPlanDateYmd}
        onClose={() => setNextVisitTarget(null)}
        onConfirm={handleScheduleNext}
      />
      <VisitFormModal
        open={addVisitOpen}
        mode="create"
        salesUserId={
          typeof plan?.sales_user === "object" && plan?.sales_user !== null
            ? String(plan.sales_user._id || (plan.sales_user as any).id || "")
            : plan?.sales_user
            ? String(plan.sales_user)
            : undefined
        }
        salesUserLabel={
          typeof plan?.sales_user === "object" && plan?.sales_user !== null
            ? plan.sales_user.name
            : undefined
        }
        isSaving={addVisitState.isLoading}
        onClose={() => setAddVisitOpen(false)}
        onSubmit={handleAddVisitSubmit}
      />
      <VisitFormModal
        open={editingVisit != null}
        mode="edit"
        initial={editingVisit}
        salesUserId={
          typeof plan?.sales_user === "object" && plan?.sales_user !== null
            ? String(plan.sales_user._id || (plan.sales_user as any).id || "")
            : plan?.sales_user
            ? String(plan.sales_user)
            : undefined
        }
        salesUserLabel={
          typeof plan?.sales_user === "object" && plan?.sales_user !== null
            ? plan.sales_user.name
            : undefined
        }
        disablePartyEdit
        isSaving={patchVisitState.isLoading}
        onClose={() => setEditingVisit(null)}
        onSubmit={handleEditVisitSubmit}
      />
      <WorkFormModal
        open={workModalOpen}
        mode={editingWork ? "edit" : "create"}
        initial={editingWork}
        planDate={currentPlanDateYmd || plan?.plan_date}
        isSaving={addWorkState.isLoading || patchWorkState.isLoading}
        onClose={() => {
          setWorkModalOpen(false);
          setEditingWork(null);
        }}
        onSubmit={handleWorkSubmit}
      />
    </div>
  );
}

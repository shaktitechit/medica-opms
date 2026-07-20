"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, LogIn, LogOut, Pencil, X } from "lucide-react";

import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useApproveWorkPlanMutation,
  useCheckInWorkPlanVisitMutation,
  useCheckOutWorkPlanVisitMutation,
  useCompleteWorkPlanVisitMutation,
  useGetWorkPlanQuery,
  useRejectWorkPlanMutation,
  useSubmitWorkPlanMutation,
  type WorkPlanVisitRecord,
} from "@/store/api";
import { CompleteVisitModal } from "./CompleteVisitModal";
import { RejectWorkPlanModal } from "./RejectWorkPlanModal";
import {
  canEditPlan,
  formatDateTime,
  formatPlanDate,
  partyLabel,
  planIdOf,
  renderPlanStatusBadge,
  renderVisitStatusBadge,
  salesUserLabel,
} from "./workPlanUtils";

type WorkPlanDetailPageProps = {
  planId?: string;
  portalHome?: string;
};

export default function WorkPlanDetailPage({
  planId: planIdProp,
  portalHome,
}: WorkPlanDetailPageProps) {
  const params = useParams();
  const router = useRouter();
  const user = useAppSelector((s) => s.auth.user);
  const rawPortal =
    typeof params.portal === "string"
      ? params.portal
      : Array.isArray(params.portal)
        ? params.portal[0]
        : "sales";
  const base = portalHome || `/${rawPortal}`;
  const planId =
    planIdProp ||
    (typeof params.rest === "object" && Array.isArray(params.rest)
      ? String(params.rest[1] || "")
      : "");

  const isAdmin =
    user?.department === "admin" ||
    user?.department === "super_admin" ||
    rawPortal === "admin";

  const { data: plan, isLoading, isFetching, isError } = useGetWorkPlanQuery(
    planId,
    { skip: !planId }
  );
  const [approvePlan, approveState] = useApproveWorkPlanMutation();
  const [rejectPlan, rejectState] = useRejectWorkPlanMutation();
  const [submitPlan, submitState] = useSubmitWorkPlanMutation();
  const [checkIn, checkInState] = useCheckInWorkPlanVisitMutation();
  const [checkOut, checkOutState] = useCheckOutWorkPlanVisitMutation();
  const [completeVisit, completeState] = useCompleteWorkPlanVisitMutation();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<WorkPlanVisitRecord | null>(
    null
  );

  const visits = plan?.visits ?? [];
  const busy =
    isLoading ||
    isFetching ||
    approveState.isLoading ||
    rejectState.isLoading ||
    submitState.isLoading ||
    checkInState.isLoading ||
    checkOutState.isLoading ||
    completeState.isLoading;

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

  async function handleSubmit() {
    try {
      await submitPlan(planId).unwrap();
      toast.success("Work plan submitted");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

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
          {plan && canEditPlan(plan.status) ? (
            <>
              <button
                type="button"
                onClick={() => router.push(`${base}/work-planner/${planId}/edit`)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/15"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                disabled={(plan.visits?.length || 0) < 1}
                onClick={() => void handleSubmit()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Submit
              </button>
            </>
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
                Remarks
              </div>
              <div className="mt-0.5 text-slate-700 dark:text-slate-300">
                {plan.remarks || "—"}
              </div>
            </div>
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
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Visits ({visits.length})
              </h2>
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
                    <th className="px-3 py-2 font-semibold">Execution</th>
                    <th className="px-3 py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v) => {
                    const visitId = planIdOf(v);
                    const canExecute = plan.status === "approved";
                    return (
                      <tr
                        key={visitId}
                        className="border-t border-slate-100 dark:border-white/5"
                      >
                        <td className="px-3 py-2">{v.sequence}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{partyLabel(v.party)}</div>
                          <div className="text-slate-500">
                            {v.contact_person || "—"}
                            {v.contact_number ? ` · ${v.contact_number}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2">{v.purpose || "—"}</td>
                        <td className="px-3 py-2">
                          {formatDateTime(v.planned_start_time)}
                        </td>
                        <td className="px-3 py-2">
                          {renderVisitStatusBadge(v.status)}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                          {v.actual_check_in
                            ? `In: ${formatDateTime(v.actual_check_in)}`
                            : "—"}
                          {v.actual_check_out ? (
                            <div>Out: {formatDateTime(v.actual_check_out)}</div>
                          ) : null}
                          {v.outcome ? <div>Outcome: {v.outcome}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right">
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
                            <div className="flex justify-end gap-1">
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
                            </div>
                          ) : null}
                          {canExecute && v.status === "pending" ? (
                            <button
                              type="button"
                              onClick={() => setCompleteTarget(v)}
                              className="ml-1 inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                            >
                              Complete
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useAddWorkPlanVisitMutation,
  useCreateWorkPlanMutation,
  useDeleteWorkPlanVisitMutation,
  useGetWorkPlanQuery,
  usePatchWorkPlanMutation,
  usePatchWorkPlanVisitMutation,
  useSubmitWorkPlanMutation,
  type WorkPlanVisitRecord,
} from "@/store/api";
import { VisitFormModal } from "./VisitFormModal";
import {
  canEditPlan,
  formatDateTime,
  formatPlanDate,
  partyLabel,
  planIdOf,
  renderPlanStatusBadge,
  renderVisitStatusBadge,
} from "./workPlanUtils";

type WorkPlanFormPageProps = {
  mode: "create" | "edit";
  planId?: string;
  portalHome?: string;
};

export default function WorkPlanFormPage({
  mode,
  planId: planIdProp,
  portalHome,
}: WorkPlanFormPageProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
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
      ? params.rest[1]
      : "");

  const initialPlanDate =
    searchParams.get("plan_date") || new Date().toISOString().slice(0, 10);
  const [planDate, setPlanDate] = useState(initialPlanDate);
  const [remarks, setRemarks] = useState("");
  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<WorkPlanVisitRecord | null>(
    null
  );
  const [createdId, setCreatedId] = useState<string | null>(null);

  const effectiveId = mode === "edit" ? planId : createdId || "";

  const planQ = useGetWorkPlanQuery(effectiveId, { skip: !effectiveId });
  const plan = planQ.data;

  const [createPlan, createState] = useCreateWorkPlanMutation();
  const [patchPlan, patchState] = usePatchWorkPlanMutation();
  const [submitPlan, submitState] = useSubmitWorkPlanMutation();
  const [addVisit, addVisitState] = useAddWorkPlanVisitMutation();
  const [patchVisit, patchVisitState] = usePatchWorkPlanVisitMutation();
  const [deleteVisit, deleteVisitState] = useDeleteWorkPlanVisitMutation();

  const hydrated = Boolean(plan);

  useEffect(() => {
    if (!plan) return;
    if (plan.plan_date) {
      setPlanDate(new Date(plan.plan_date).toISOString().slice(0, 10));
    }
    setRemarks(plan.remarks || "");
  }, [plan]);

  const visits = plan?.visits ?? [];
  const status = plan?.status || "draft";
  const editable = mode === "create" || canEditPlan(status);
  const busy =
    createState.isLoading ||
    patchState.isLoading ||
    submitState.isLoading ||
    addVisitState.isLoading ||
    patchVisitState.isLoading ||
    deleteVisitState.isLoading ||
    planQ.isFetching;

  async function ensurePlan(): Promise<string | null> {
    if (effectiveId) {
      if (!editable) {
        toast.error("This plan cannot be edited");
        return null;
      }
      try {
        await patchPlan({
          id: effectiveId,
          patch: { plan_date: planDate, remarks },
        }).unwrap();
        return effectiveId;
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
        return null;
      }
    }
    try {
      const created = await createPlan({
        plan_date: planDate,
        remarks: remarks || undefined,
      }).unwrap();
      const id = planIdOf(created);
      setCreatedId(id);
      toast.success("Work plan created");
      router.replace(`${base}/work-planner/${id}/edit`);
      return id;
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
      return null;
    }
  }

  async function handleSaveHeader() {
    const id = await ensurePlan();
    if (id && mode === "edit") toast.success("Work plan saved");
  }

  async function handleSubmitPlan() {
    let id = effectiveId;
    if (!id) {
      id = (await ensurePlan()) || "";
    } else {
      await ensurePlan();
    }
    if (!id) return;
    try {
      await submitPlan(id).unwrap();
      toast.success("Work plan submitted for approval");
      router.push(`${base}/work-planner/${id}`);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleVisitSubmit(body: Record<string, unknown>) {
    let id = effectiveId;
    if (!id) {
      id = (await ensurePlan()) || "";
    }
    if (!id) return;
    try {
      if (editingVisit) {
        const visitId = planIdOf(editingVisit);
        await patchVisit({ id, visitId, patch: body }).unwrap();
        toast.success("Visit updated");
      } else {
        await addVisit({ id, body }).unwrap();
        toast.success("Visit added");
      }
      setVisitModalOpen(false);
      setEditingVisit(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  async function handleDeleteVisit(visit: WorkPlanVisitRecord) {
    if (!effectiveId) return;
    const visitId = planIdOf(visit);
    try {
      await deleteVisit({ id: effectiveId, visitId }).unwrap();
      toast.success("Visit removed");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <PortalBusyOverlay active={busy && hydrated} message="Saving…" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={effectiveId ? `${base}/work-planner/${effectiveId}` : `${base}/work-planner`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium dark:border-white/15"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {mode === "create" ? "Create work plan" : "Edit work plan"}
            </h1>
            {plan ? (
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                {formatPlanDate(plan.plan_date)}
                {renderPlanStatusBadge(plan.status)}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!editable || busy}
            onClick={() => void handleSaveHeader()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-white/15"
          >
            Save
          </button>
          <button
            type="button"
            disabled={!editable || busy || (effectiveId ? visits.length < 1 : false)}
            onClick={() => void handleSubmitPlan()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Submit for approval
          </button>
        </div>
      </div>

      {!editable && mode === "edit" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Submitted or approved plans cannot be edited. Rejected plans can be
          edited and resubmitted.
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Plan date
            </label>
            <input
              type="date"
              value={planDate}
              disabled={!editable}
              onChange={(e) => setPlanDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Remarks
            </label>
            <input
              value={remarks}
              disabled={!editable}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              placeholder="Optional notes for this day"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Visits ({visits.length})
          </h2>
          <button
            type="button"
            disabled={!editable || busy}
            onClick={() => {
              setEditingVisit(null);
              setVisitModalOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add visit
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Party</th>
                <th className="px-3 py-2 font-semibold">Contact</th>
                <th className="px-3 py-2 font-semibold">Window</th>
                <th className="px-3 py-2 font-semibold">Purpose</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    Add at least one visit before submitting.
                  </td>
                </tr>
              ) : (
                visits.map((v) => (
                  <tr
                    key={planIdOf(v)}
                    className="border-t border-slate-100 dark:border-white/5"
                  >
                    <td className="px-3 py-2">{v.sequence}</td>
                    <td className="px-3 py-2 font-medium">{partyLabel(v.party)}</td>
                    <td className="px-3 py-2">
                      {v.contact_person || "—"}
                      {v.contact_number ? (
                        <div className="text-slate-500">{v.contact_number}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {formatDateTime(v.planned_start_time)}
                      <div className="text-slate-500">
                        {formatDateTime(v.planned_end_time)}
                      </div>
                    </td>
                    <td className="px-3 py-2">{v.purpose || "—"}</td>
                    <td className="px-3 py-2">{renderVisitStatusBadge(v.status)}</td>
                    <td className="px-3 py-2 text-right">
                      {editable ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingVisit(v);
                              setVisitModalOpen(true);
                            }}
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-white/15"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteVisit(v)}
                            className="rounded border border-rose-200 px-2 py-1 text-rose-600 dark:border-rose-900/40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VisitFormModal
        open={visitModalOpen}
        mode={editingVisit ? "edit" : "create"}
        initial={editingVisit}
        isSaving={addVisitState.isLoading || patchVisitState.isLoading}
        onClose={() => {
          setVisitModalOpen(false);
          setEditingVisit(null);
        }}
        onSubmit={handleVisitSubmit}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useAddWorkPlanVisitMutation,
  useCreateWorkPlanMutation,
  useDeleteWorkPlanVisitMutation,
  useGetWorkPlanQuery,
  useListUsersQuery,
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
  salesUserLabel
} from "./workPlanUtils";

type Props = {
  mode: "create" | "edit";
  planId?: string;
};

export default function SalesWorkPlanFormPage({
  mode,
  planId: planIdProp,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const base = "/sales";
  const isAdmin = false;
  const planId = planIdProp || "";

  const initialPlanDate =
    searchParams.get("plan_date") || new Date().toISOString().slice(0, 10);
  const [planDate, setPlanDate] = useState(initialPlanDate);
  const [remarks, setRemarks] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<WorkPlanVisitRecord | null>(
    null
  );
  const [createdId, setCreatedId] = useState<string | null>(null);

  const effectiveId = mode === "edit" ? planId : createdId || "";

  const planQ = useGetWorkPlanQuery(effectiveId, { skip: !effectiveId });
  const plan = planQ.data;
  const usersQ = useListUsersQuery(
    { department: "sales" },
    { skip: !isAdmin },
  );

  const salesUsers = useMemo(() => {
    const raw = usersQ.data;
    if (Array.isArray(raw)) return raw as Array<{ _id?: string; id?: string; name?: string; email?: string }>;
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: Array<{ _id?: string; id?: string; name?: string; email?: string }> }).data;
    }
    return [];
  }, [usersQ.data]);

  const filteredSalesUsers = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    if (!q) return salesUsers.slice(0, 20);
    return salesUsers
      .filter((u) => {
        const name = String(u.name || "").toLowerCase();
        const email = String(u.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 20);
  }, [salesUsers, salesSearch]);

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
    if (plan.sales_user) {
      const id =
        typeof plan.sales_user === "string"
          ? plan.sales_user
          : String(plan.sales_user._id || "");
      setSalesUserId(id);
      setSalesSearch(salesUserLabel(plan.sales_user));
    }
  }, [plan]);

  const visits = plan?.visits ?? [];
  const status = plan?.status || "draft";
  const editable = mode === "create" || canEditPlan(status, { isAdmin });
  const busy =
    createState.isLoading ||
    patchState.isLoading ||
    submitState.isLoading ||
    addVisitState.isLoading ||
    patchVisitState.isLoading ||
    deleteVisitState.isLoading ||
    planQ.isFetching;

  async function ensurePlan(overrideSalesUserId?: string): Promise<string | null> {
    const salesId = overrideSalesUserId || salesUserId;
    if (isAdmin && !effectiveId && !salesId) {
      toast.error("Select a sales person for this work plan");
      return null;
    }
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
        ...(isAdmin && salesId ? { sales_user: salesId } : {}),
      }).unwrap();
      const id = planIdOf(created);
      setCreatedId(id);
      if (salesId) setSalesUserId(salesId);
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
    const { sales_user: salesFromVisit, ...visitBody } = body;
    const salesOverride =
      typeof salesFromVisit === "string" ? salesFromVisit : undefined;
    if (salesOverride) {
      setSalesUserId(salesOverride);
      const match = salesUsers.find(
        (u) => String(u._id || u.id || "") === salesOverride,
      );
      if (match) setSalesSearch(salesUserLabel(match));
    }

    let id = effectiveId;
    if (!id) {
      id = (await ensurePlan(salesOverride)) || "";
    }
    if (!id) return;
    try {
      if (editingVisit) {
        const visitId = planIdOf(editingVisit);
        await patchVisit({ id, visitId, patch: visitBody }).unwrap();
        toast.success("Visit updated");
      } else {
        await addVisit({ id, body: visitBody }).unwrap();
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
            disabled={
              !editable ||
              busy ||
              (isAdmin && !effectiveId && !salesUserId)
            }
            onClick={() => void handleSaveHeader()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-white/15"
          >
            Save
          </button>
          <button
            type="button"
            disabled={
              !editable ||
              busy ||
              (effectiveId ? visits.length < 1 : false) ||
              (isAdmin && !effectiveId && !salesUserId)
            }
            onClick={() => void handleSubmitPlan()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Submit for approval
          </button>
        </div>
      </div>

      {!editable && mode === "edit" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {isAdmin
            ? "Completed plans cannot be edited."
            : "Submitted or approved plans cannot be edited. Rejected plans can be edited and resubmitted."}
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
          {isAdmin ? (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Sales person
              </label>
              {effectiveId ? (
                <input
                  value={salesSearch || salesUserLabel(plan?.sales_user)}
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 disabled:opacity-80 dark:border-white/15 dark:bg-slate-950 dark:text-slate-200"
                />
              ) : (
                <>
                  <input
                    type="text"
                    value={salesSearch}
                    disabled={!editable}
                    onChange={(e) => {
                      setSalesSearch(e.target.value);
                      setSalesUserId("");
                    }}
                    placeholder="Search sales user…"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                  />
                  {salesSearch && !salesUserId ? (
                    <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                      {filteredSalesUsers.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-slate-500">
                          No sales users found
                        </li>
                      ) : (
                        filteredSalesUsers.map((u) => {
                          const id = String(u._id || u.id || "");
                          const label = salesUserLabel(u);
                          return (
                            <li key={id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5"
                                onClick={() => {
                                  setSalesUserId(id);
                                  setSalesSearch(label === "—" ? id : label);
                                }}
                              >
                                <div className="font-medium text-slate-800 dark:text-slate-100">
                                  {u.name || "Unnamed"}
                                </div>
                                {u.email ? (
                                  <div className="text-2xs text-slate-500">
                                    {u.email}
                                  </div>
                                ) : null}
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  ) : null}
                  <p className="mt-1 text-2xs text-slate-500">
                    Required — this plan will be assigned to the selected sales
                    user
                  </p>
                </>
              )}
            </div>
          ) : null}
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
        allowSalesUserSelect={isAdmin && !effectiveId}
        salesUserId={salesUserId}
        salesUserLabel={salesSearch}
        onClose={() => {
          setVisitModalOpen(false);
          setEditingVisit(null);
        }}
        onSubmit={handleVisitSubmit}
      />
    </div>
  );
}

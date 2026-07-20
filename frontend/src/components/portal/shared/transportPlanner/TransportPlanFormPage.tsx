"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Save } from "lucide-react";

import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useAddTransportPlanOrdersMutation,
  useCreateTransportPlanMutation,
  useGetTransportPlanQuery,
  useListEligibleTransportOrdersQuery,
  useListTransportAgentsQuery,
  usePatchTransportPlanMutation,
  useRemoveTransportPlanOrderMutation,
  type EligibleOrderRecord,
} from "@/store/api";
import {
  canEditPlan,
  formatMoney,
  formatPlanDate,
  orderNoOf,
  partyLabel,
  planIdOf,
} from "./transportPlanUtils";

type TransportPlanFormPageProps = {
  mode: "create" | "edit";
  planId?: string;
  portalHome?: string;
};

function orderIdOf(row: EligibleOrderRecord): string {
  return String(row._id || row.id || "");
}

function dispatchIdOf(row: { _id?: string; id?: string }): string {
  return String(row._id || row.id || "");
}

type PlanItem = { order_id: string; dispatch_id: string };

export default function TransportPlanFormPage({
  mode,
  planId,
  portalHome,
}: TransportPlanFormPageProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPortal =
    typeof params.portal === "string"
      ? params.portal
      : Array.isArray(params.portal)
        ? params.portal[0]
        : "account";
  const base = portalHome || `/${rawPortal}`;

  const initialPlanDate = (() => {
    const q = searchParams.get("plan_date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    return "";
  })();

  const [planDate, setPlanDate] = useState(initialPlanDate);
  const [agentId, setAgentId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [selectedDispatchIds, setSelectedDispatchIds] = useState<Set<string>>(new Set());
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [activePlanId, setActivePlanId] = useState(planId || "");

  const planQ = useGetTransportPlanQuery(activePlanId, {
    skip: !activePlanId,
  });
  const agentsQ = useListTransportAgentsQuery({ status: "active" });
  const eligibleQ = useListEligibleTransportOrdersQuery(
    {
      search: searchQuery.trim() || undefined,
      priority: priorityFilter || undefined,
      area: areaFilter.trim() || undefined,
      limit: 100,
    },
    { skip: mode === "edit" && !canEditPlan(planQ.data?.status) && !!activePlanId }
  );

  const [createPlan, createState] = useCreateTransportPlanMutation();
  const [patchPlan, patchState] = usePatchTransportPlanMutation();
  const [addOrders, addState] = useAddTransportPlanOrdersMutation();
  const [removeOrder, removeState] = useRemoveTransportPlanOrderMutation();

  const isSaving =
    createState.isLoading ||
    patchState.isLoading ||
    addState.isLoading ||
    removeState.isLoading;

  useEffect(() => {
    if (!planQ.data) return;
    const d = planQ.data.plan_date ? String(planQ.data.plan_date).slice(0, 10) : "";
    setPlanDate(d);
    const agent =
      typeof planQ.data.transport_agent === "object"
        ? planQ.data.transport_agent?._id
        : planQ.data.transport_agent;
    setAgentId(agent ? String(agent) : "");
    setRemarks(planQ.data.remarks || "");
  }, [planQ.data]);

  const agents = useMemo(() => {
    const raw = agentsQ.data;
    if (Array.isArray(raw)) return raw;
    return [];
  }, [agentsQ.data]);

  const eligible = eligibleQ.data?.data ?? [];
  const planOrders = (planQ.data?.orders ?? []).filter((o) => o.status !== "cancelled");

  const selectedItems: PlanItem[] = useMemo(() => {
    const items: PlanItem[] = [];
    for (const order of eligible) {
      const oid = orderIdOf(order);
      for (const disp of order.available_dispatches || []) {
        const did = dispatchIdOf(disp);
        if (selectedDispatchIds.has(did)) {
          items.push({ order_id: oid, dispatch_id: did });
        }
      }
    }
    return items;
  }, [eligible, selectedDispatchIds]);

  const selectedOrderIds = useMemo(
    () => new Set(selectedItems.map((i) => i.order_id)),
    [selectedItems]
  );

  const selectedSummary = useMemo(() => {
    const dispatchCount = selectedItems.length + (mode === "edit" ? planOrders.length : 0);
    const orderCount =
      new Set([
        ...selectedItems.map((i) => i.order_id),
        ...(mode === "edit"
          ? planOrders.map((l) => {
              const ord = l.order && typeof l.order === "object" ? l.order._id : l.order;
              return String(ord || "");
            })
          : []),
      ]).size;
    const selectedOrderRows = eligible.filter((r) => selectedOrderIds.has(orderIdOf(r)));
    return {
      total_orders: orderCount,
      total_dispatches: dispatchCount,
      total_invoice_value:
        selectedOrderRows.reduce((s, r) => s + (Number(r.invoice_value ?? r.grand_total) || 0), 0) +
        (mode === "edit"
          ? planOrders.reduce((s, r) => {
              const ord = r.order && typeof r.order === "object" ? r.order : null;
              return s + (Number(ord?.grand_total) || 0);
            }, 0)
          : 0),
    };
  }, [selectedItems, selectedOrderIds, eligible, mode, planOrders]);

  const orderDispatchIds = (order: EligibleOrderRecord) =>
    (order.available_dispatches || []).map(dispatchIdOf).filter(Boolean);

  const orderSelectionState = (order: EligibleOrderRecord) => {
    const ids = orderDispatchIds(order);
    if (ids.length === 0) return "none" as const;
    const selected = ids.filter((id) => selectedDispatchIds.has(id)).length;
    if (selected === 0) return "none" as const;
    if (selected === ids.length) return "all" as const;
    return "partial" as const;
  };

  const toggleOrderExpanded = (id: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOrder = (order: EligibleOrderRecord) => {
    const oid = orderIdOf(order);
    const ids = orderDispatchIds(order);
    const state = orderSelectionState(order);

    setExpandedOrderIds((prev) => new Set(prev).add(oid));

    setSelectedDispatchIds((prev) => {
      const next = new Set(prev);
      if (state === "all") {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const toggleDispatch = (orderId: string, dispatchId: string) => {
    setExpandedOrderIds((prev) => new Set(prev).add(orderId));
    setSelectedDispatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(dispatchId)) next.delete(dispatchId);
      else next.add(dispatchId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!planDate) {
      toast.error("Dispatch date is required");
      return;
    }
    if (!agentId) {
      toast.error("Transport agent is required");
      return;
    }

    try {
      if (mode === "create" && !activePlanId) {
        if (selectedItems.length === 0) {
          toast.error("Select at least one order dispatch batch");
          return;
        }

        const created = await createPlan({
          plan_date: planDate,
          transport_agent: agentId,
          remarks: remarks || undefined,
          items: selectedItems,
        }).unwrap();
        const id = planIdOf(created);
        toast.success("Transport plan saved as planned");
        router.replace(`${base}/transport-planner/${id}`);
        return;
      }

      const id = activePlanId || planId;
      if (!id) return;

      await patchPlan({
        id,
        patch: {
          plan_date: planDate,
          transport_agent: agentId,
          remarks: remarks || "",
        },
      }).unwrap();

      if (selectedItems.length > 0) {
        await addOrders({ id, items: selectedItems }).unwrap();
        setSelectedDispatchIds(new Set());
        setExpandedOrderIds(new Set());
      }

      toast.success("Transport plan saved");
      router.push(`${base}/transport-planner/${id}`);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

  const handleRemovePlanOrder = async (planOrderId: string) => {
    if (!activePlanId) return;
    try {
      await removeOrder({ id: activePlanId, planOrderId }).unwrap();
      toast.success("Dispatch removed from plan");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

  const readOnly = mode === "edit" && !!planQ.data && !canEditPlan(planQ.data.status);

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <PortalBusyOverlay
        active={isSaving || (mode === "edit" && planQ.isLoading)}
        message={isSaving ? "Saving…" : "Loading…"}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={
              activePlanId
                ? `${base}/transport-planner/${activePlanId}`
                : `${base}/transport-planner`
            }
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {mode === "create" ? "Create transport plan" : "Edit transport plan"}
            </h1>
            <p className="text-xs text-slate-500">
              {mode === "create"
                ? "Save creates a planned plan — submit it from the plan detail page"
                : "Expand an order to select its submitted OrderDispatch batches"}
            </p>
          </div>
        </div>
        {!readOnly ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
                ? "Create planned plan"
                : "Save plan"}
          </button>
        ) : null}
      </div>

      {readOnly ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          This plan can no longer be edited (status: {planQ.data?.status}).
        </div>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Dispatch date</label>
          <input
            type="date"
            value={planDate}
            disabled={readOnly}
            onChange={(e) => setPlanDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-950"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Transport agent</label>
          <select
            value={agentId}
            disabled={readOnly}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-950"
          >
            <option value="">Select agent…</option>
            {agents.map((a) => {
              const id = String(a._id || a.id || "");
              return (
                <option key={id} value={id}>
                  {a.agent_name || a.agent_code || id}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Remarks</label>
          <input
            type="text"
            value={remarks}
            disabled={readOnly}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-950"
            placeholder="Optional notes"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[
          { label: "Orders selected", value: selectedSummary.total_orders },
          { label: "Dispatch batches", value: selectedSummary.total_dispatches },
          {
            label: "Invoice value (orders)",
            value: formatMoney(selectedSummary.total_invoice_value),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900"
          >
            <div className="text-[11px] text-slate-500">{card.label}</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {mode === "edit" && planOrders.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10">
            On this plan ({planOrders.length})
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-950/80">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Dispatch</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Invoice</th>
                  {!readOnly ? <th className="px-3 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {planOrders.map((line) => {
                  const lineId = planIdOf(line);
                  const ord = line.order && typeof line.order === "object" ? line.order : null;
                  const disp =
                    line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;
                  return (
                    <tr key={lineId}>
                      <td className="px-3 py-2 font-medium">{orderNoOf(line.order)}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {disp?.dispatch_no ||
                          (typeof line.dispatch === "string" ? line.dispatch : "—")}
                      </td>
                      <td className="px-3 py-2">{partyLabel(line.party || ord?.party)}</td>
                      <td className="px-3 py-2">
                        {line.invoice_number || disp?.bill_number || "—"}
                      </td>
                      {!readOnly ? (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void handleRemovePlanOrder(lineId)}
                            className="text-xs font-medium text-rose-600 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!readOnly ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <ListEntitySearchPanel
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                desktopPlaceholder="Search orders with submitted dispatches…"
                mobilePlaceholder="Search orders…"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
              >
                <option value="">All</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Area / city</label>
              <input
                type="text"
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
                placeholder="City / district"
              />
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <PortalBusyOverlay active={eligibleQ.isFetching} message="Loading orders…" />
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10">
              Select orders — expand to choose submitted dispatch batches
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-950/80">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2">Select</th>
                  <th className="px-3 py-2">Order / dispatch</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">City / bill</th>
                  <th className="px-3 py-2">Amount / qty</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {eligible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No orders with submitted dispatches available.
                      Create and submit an OrderDispatch first (status must be
                      submitted, not draft / transport_created).
                    </td>
                  </tr>
                ) : (
                  eligible.flatMap((row) => {
                    const id = orderIdOf(row);
                    const disps = row.available_dispatches || [];
                    const isExpanded = expandedOrderIds.has(id);
                    const selState = orderSelectionState(row);
                    const rows = [
                      <tr
                        key={id}
                        className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Collapse dispatches" : "Expand dispatches"}
                            onClick={() => toggleOrderExpanded(id)}
                            className="inline-flex rounded p-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selState === "all"}
                            ref={(el) => {
                              if (el) el.indeterminate = selState === "partial";
                            }}
                            onChange={() => toggleOrder(row)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleOrderExpanded(id)}
                            className="text-left font-medium hover:underline"
                          >
                            {row.order_no || id}
                          </button>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {disps.length} submitted dispatch
                            {disps.length === 1 ? "" : "es"}
                            {selState !== "none"
                              ? ` · ${disps.filter((d) => selectedDispatchIds.has(dispatchIdOf(d))).length} selected`
                              : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2">{partyLabel(row.party)}</td>
                        <td className="px-3 py-2">{row.city || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(row.invoice_value ?? row.grand_total)}
                        </td>
                        <td className="px-3 py-2 capitalize">
                          {row.dispatch_status || "pending"}
                        </td>
                      </tr>,
                    ];

                    if (isExpanded) {
                      if (disps.length === 0) {
                        rows.push(
                          <tr key={`${id}-empty`} className="bg-slate-50/70 dark:bg-white/[0.02]">
                            <td />
                            <td colSpan={6} className="px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                              No available submitted dispatch batches on this order.
                            </td>
                          </tr>
                        );
                      } else {
                        for (const disp of disps) {
                          const did = dispatchIdOf(disp);
                          rows.push(
                            <tr
                              key={did}
                              className="bg-slate-50/70 dark:bg-white/[0.02]"
                            >
                              <td />
                              <td className="px-3 py-2 pl-8">
                                <input
                                  type="checkbox"
                                  checked={selectedDispatchIds.has(did)}
                                  onChange={() => toggleDispatch(id, did)}
                                />
                              </td>
                              <td className="px-3 py-2 pl-6">
                                <div className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">
                                  {disp.dispatch_no || did}
                                </div>
                                <div className="text-[11px] text-slate-500">Order dispatch</div>
                              </td>
                              <td className="px-3 py-2 text-slate-400">—</td>
                              <td className="px-3 py-2">{disp.bill_number || "—"}</td>
                              <td className="px-3 py-2 tabular-nums">
                                {disp.dispatched_quantity_total ?? "—"}
                              </td>
                              <td className="px-3 py-2 capitalize">
                                {(disp.dispatch_status || "").replaceAll("_", " ") || "—"}
                              </td>
                            </tr>
                          );
                        }
                      }
                    }

                    return rows;
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {mode === "edit" && planQ.data ? (
        <p className="text-xs text-slate-500">
          Plan date {formatPlanDate(planQ.data.plan_date)} · status {planQ.data.status}
        </p>
      ) : null}
    </div>
  );
}

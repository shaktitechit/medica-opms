"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Save } from "lucide-react";

import {
  buildPartyNameById,
  pickList,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import {
  formatDateShort,
  orderKey,
  renderPriorityBadge,
  renderWorkflowStatusBadge,
  type OrderListRow,
} from "@/components/portal/shared/orderList/orderListDisplay";
import {
  getOrderWorkflowTabCategory,
  ORDER_WORKFLOW_TAB_LABELS,
  workflowTabQueryParams,
  type OrderWorkflowTabCategory,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import { useOrderWorkflowCategoryOptions } from "@/components/portal/shared/orderList/useOrderWorkflowCategoryOptions";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useAddTransportPlanOrdersMutation,
  useCreateTransportPlanMutation,
  useGetTransportPlanQuery,
  useListEligibleTransportOrdersQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListTransportAgentsQuery,
  useListTransportsQuery,
  usePatchTransportPlanMutation,
  useRemoveTransportPlanOrderMutation,
} from "@/store/api";
import {
  agentLabel,
  canEditPlan,
  formatMoney,
  formatPlanDate,
  orderNoOf,
  planIdOf,
} from "./transportPlanUtils";

type TransportPlanFormPageProps = {
  mode: "create" | "edit";
  planId?: string;
  portalHome?: string;
};

/** Same exclusive buckets as ListOrdersPage for transport planning. */
const TRANSPORT_PLAN_ORDER_TABS = new Set<OrderWorkflowTabCategory>([
  "pending_admin_approval",
  "due_sheet_pending",
  "pending_finance_approval",
  "pending_account_approval",
  "open_dispatched",
  "transport_pending",
]);

type PlanItem = { order_id: string; dispatch_id: string };

type TransportRow = {
  order?: unknown;
  transport_agent?: unknown;
  shipment_status?: string;
  shipment_no?: string;
  dispatch_date?: string;
};

type OrderMapping = {
  mapped: boolean;
  planDate?: string;
  agent?: unknown;
  shipmentName?: string;
  shipmentStatus?: string;
};

type SortKey =
  | "order"
  | "order_date"
  | "customer"
  | "city"
  | "amount"
  | "priority"
  | "status"
  | "mapping"
  | "agent"
  | "plan_date"
  | "shipment";

type SortDir = "asc" | "desc";

const PRIORITY_SORT_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function compareNumber(a: number, b: number): number {
  if (a === b) return 0;
  if (!Number.isFinite(a) && !Number.isFinite(b)) return 0;
  if (!Number.isFinite(a)) return -1;
  if (!Number.isFinite(b)) return 1;
  return a < b ? -1 : 1;
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={`px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-wide text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200"
      >
        <span>{label}</span>
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
          ) : (
            <ArrowDown className="h-3 w-3 text-blue-600 dark:text-blue-400" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function orderRefNo(row: OrderListRow): string {
  if (typeof row.order_no === "string" && row.order_no.trim()) return row.order_no;
  if (typeof row.order_number === "string" && row.order_number.trim()) {
    return row.order_number;
  }
  const rawNo = (row as { order_no?: unknown; order_number?: unknown }).order_no;
  const rawNumber = (row as { order_number?: unknown }).order_number;
  if (rawNo != null && String(rawNo).trim()) return String(rawNo);
  if (rawNumber != null && String(rawNumber).trim()) return String(rawNumber);
  return orderKey(row) || "—";
}

function partyCityFromRecord(party: unknown): string {
  if (!party || typeof party !== "object") return "";
  const p = party as {
    shipping_address?: { city?: string; district?: string };
    billing_address?: { city?: string; district?: string };
  };
  return (
    p.shipping_address?.city ||
    p.billing_address?.city ||
    p.shipping_address?.district ||
    p.billing_address?.district ||
    ""
  );
}

function orderCity(
  row: OrderListRow,
  partyById: Map<string, Record<string, unknown>>,
): string {
  const embedded = partyCityFromRecord(row.party);
  if (embedded) return embedded;

  const partyRef = row.party;
  const partyId =
    typeof partyRef === "string"
      ? partyRef
      : partyRef && typeof partyRef === "object"
        ? String(
            (partyRef as { _id?: unknown; id?: unknown })._id ??
              (partyRef as { id?: unknown }).id ??
              "",
          )
        : "";
  if (partyId && partyById.has(partyId)) {
    return partyCityFromRecord(partyById.get(partyId));
  }
  return "";
}

function refOrderId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as { _id?: unknown; id?: unknown };
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

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
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("order_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activePlanId, setActivePlanId] = useState(planId || "");

  const planQ = useGetTransportPlanQuery(activePlanId, {
    skip: !activePlanId,
  });
  const agentsQ = useListTransportAgentsQuery({ status: "active" });

  const readOnly = mode === "edit" && !!planQ.data && !canEditPlan(planQ.data.status);
  const skipOrderPool = mode === "edit" && readOnly && !!activePlanId;

  // Same RTK pool as ListOrdersPage / Quick Access / Google Sheet.
  const ordersQ = useListOrdersQuery(workflowTabQueryParams(), {
    skip: skipOrderPool,
  });
  const partiesQ = useListPartiesQuery({}, { skip: skipOrderPool });
  const categoryOptions = useOrderWorkflowCategoryOptions();
  const transportsQ = useListTransportsQuery({}, { skip: skipOrderPool });
  // Plan/shipment enrichment for Mapped + plan date + shipment name columns.
  const eligibleEnrichmentQ = useListEligibleTransportOrdersQuery(
    { limit: 200 },
    { skip: skipOrderPool },
  );

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const partyById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of pickList(partiesQ.data)) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
      if (id) map.set(id, o);
    }
    return map;
  }, [partiesQ.data]);

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

  const transportByOrderId = useMemo(() => {
    const map = new Map<string, TransportRow>();
    for (const row of pickList(transportsQ.data)) {
      if (!row || typeof row !== "object") continue;
      const t = row as TransportRow;
      const oid = refOrderId(t.order);
      if (!oid || map.has(oid)) continue;
      map.set(oid, t);
    }
    return map;
  }, [transportsQ.data]);

  const planOrders = (planQ.data?.orders ?? []).filter((o) => o.status !== "cancelled");

  const mappingByOrderId = useMemo(() => {
    const map = new Map<string, OrderMapping>();

    const upsert = (oid: string, patch: Partial<OrderMapping>) => {
      if (!oid) return;
      const prev = map.get(oid) || { mapped: false };
      map.set(oid, {
        mapped: Boolean(prev.mapped || patch.mapped),
        planDate: patch.planDate ?? prev.planDate,
        agent: patch.agent ?? prev.agent,
        shipmentName: patch.shipmentName ?? prev.shipmentName,
        shipmentStatus: patch.shipmentStatus ?? prev.shipmentStatus,
      });
    };

    for (const [oid, t] of transportByOrderId) {
      const agentName = agentLabel(t.transport_agent as any);
      upsert(oid, {
        mapped: true,
        agent: t.transport_agent,
        planDate: t.dispatch_date,
        shipmentName: t.shipment_no || (agentName !== "—" ? agentName : undefined),
        shipmentStatus: t.shipment_status,
      });
    }

    for (const row of eligibleEnrichmentQ.data?.data ?? []) {
      const oid = String(row._id || row.id || "");
      if (!oid) continue;
      const plan = row.transport_plan;
      const shipment = row.transport;
      if (!plan && !shipment) continue;
      const agent = shipment?.transport_agent || plan?.transport_agent;
      const agentName = agentLabel(agent);
      upsert(oid, {
        mapped: true,
        planDate: plan?.plan_date,
        agent,
        shipmentName:
          shipment?.shipment_no || (agentName !== "—" ? agentName : undefined),
        shipmentStatus: shipment?.shipment_status,
      });
    }

    // Current plan being edited/created — always mark its orders as mapped.
    for (const line of planOrders) {
      const oid = refOrderId(line.order);
      if (!oid) continue;
      const agent = line.transport?.transport_agent || planQ.data?.transport_agent;
      const agentName = agentLabel(agent);
      upsert(oid, {
        mapped: true,
        planDate: planQ.data?.plan_date,
        agent,
        shipmentName:
          line.transport?.shipment_no ||
          (agentName !== "—" ? agentName : undefined),
        shipmentStatus: line.transport?.shipment_status,
      });
    }

    return map;
  }, [
    transportByOrderId,
    eligibleEnrichmentQ.data,
    planOrders,
    planQ.data?.plan_date,
    planQ.data?.transport_agent,
  ]);

  const eligible = useMemo(() => {
    const orders = pickOrders(ordersQ.data) as OrderListRow[];
    const q = searchQuery.trim().toLowerCase();
    const area = areaFilter.trim().toLowerCase();
    const priority = priorityFilter === "all" ? "" : priorityFilter.toLowerCase();

    return orders.filter((row) => {
      const cat = getOrderWorkflowTabCategory(row, categoryOptions);
      if (!cat || !TRANSPORT_PLAN_ORDER_TABS.has(cat)) return false;

      if (priority) {
        if (String(row.priority || "").toLowerCase() !== priority) return false;
      }

      if (q) {
        const ref = orderRefNo(row).toLowerCase();
        const party = resolveOrderCounterparty(
          row as Record<string, unknown>,
          partyNameById,
        ).toLowerCase();
        if (!ref.includes(q) && !party.includes(q)) return false;
      }

      if (area) {
        const city = orderCity(row, partyById).toLowerCase();
        if (!city.includes(area)) return false;
      }

      return true;
    });
  }, [
    ordersQ.data,
    categoryOptions,
    searchQuery,
    priorityFilter,
    areaFilter,
    partyNameById,
    partyById,
  ]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(key === "order_date" || key === "amount" || key === "priority" ? "desc" : "asc");
      return;
    }
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const sortedEligible = useMemo(() => {
    if (!sortKey) return eligible;
    const dir = sortDir === "asc" ? 1 : -1;
    const rows = [...eligible];
    rows.sort((a, b) => {
      const aId = orderKey(a);
      const bId = orderKey(b);
      const aMap = mappingByOrderId.get(aId);
      const bMap = mappingByOrderId.get(bId);
      const aTab = getOrderWorkflowTabCategory(a, categoryOptions);
      const bTab = getOrderWorkflowTabCategory(b, categoryOptions);

      let cmp = 0;
      switch (sortKey) {
        case "order":
          cmp = compareText(orderRefNo(a), orderRefNo(b));
          break;
        case "order_date": {
          const aTime = new Date(
            String(a.order_date ?? a.created_at ?? a.createdAt ?? ""),
          ).getTime();
          const bTime = new Date(
            String(b.order_date ?? b.created_at ?? b.createdAt ?? ""),
          ).getTime();
          cmp = compareNumber(
            Number.isFinite(aTime) ? aTime : 0,
            Number.isFinite(bTime) ? bTime : 0,
          );
          break;
        }
        case "customer":
          cmp = compareText(
            resolveOrderCounterparty(a as Record<string, unknown>, partyNameById),
            resolveOrderCounterparty(b as Record<string, unknown>, partyNameById),
          );
          break;
        case "city":
          cmp = compareText(orderCity(a, partyById), orderCity(b, partyById));
          break;
        case "amount":
          cmp = compareNumber(
            Number(a.grand_total ?? a.total) || 0,
            Number(b.grand_total ?? b.total) || 0,
          );
          break;
        case "priority":
          cmp = compareNumber(
            PRIORITY_SORT_RANK[String(a.priority || "normal").toLowerCase()] ?? 0,
            PRIORITY_SORT_RANK[String(b.priority || "normal").toLowerCase()] ?? 0,
          );
          break;
        case "status":
          cmp = compareText(
            aTab ? ORDER_WORKFLOW_TAB_LABELS[aTab] : String(a.status || ""),
            bTab ? ORDER_WORKFLOW_TAB_LABELS[bTab] : String(b.status || ""),
          );
          break;
        case "mapping":
          cmp = compareNumber(aMap?.mapped ? 1 : 0, bMap?.mapped ? 1 : 0);
          break;
        case "agent":
          cmp = compareText(
            agentLabel(aMap?.agent as any) || aMap?.shipmentName || "",
            agentLabel(bMap?.agent as any) || bMap?.shipmentName || "",
          );
          break;
        case "plan_date": {
          const aTime = new Date(String(aMap?.planDate || "")).getTime();
          const bTime = new Date(String(bMap?.planDate || "")).getTime();
          cmp = compareNumber(
            Number.isFinite(aTime) ? aTime : 0,
            Number.isFinite(bTime) ? bTime : 0,
          );
          break;
        }
        case "shipment":
          cmp = compareText(
            String(aMap?.shipmentName || aMap?.shipmentStatus || ""),
            String(bMap?.shipmentName || bMap?.shipmentStatus || ""),
          );
          break;
        default:
          cmp = 0;
      }
      if (cmp !== 0) return cmp * dir;
      return compareText(orderRefNo(a), orderRefNo(b));
    });
    return rows;
  }, [
    eligible,
    sortKey,
    sortDir,
    mappingByOrderId,
    categoryOptions,
    partyNameById,
    partyById,
  ]);

  const selectedItems: PlanItem[] = useMemo(() => {
    return Array.from(selectedOrderIds).map((oid) => ({
      order_id: oid,
      dispatch_id: "",
    }));
  }, [selectedOrderIds]);

  const selectedSummary = useMemo(() => {
    const dispatchCount =
      selectedItems.filter((i) => i.dispatch_id).length +
      (mode === "edit" ? planOrders.length : 0);
    const orderCount = new Set([
      ...selectedItems.map((i) => i.order_id),
      ...(mode === "edit"
        ? planOrders.map((l) => {
            const ord = l.order && typeof l.order === "object" ? l.order._id : l.order;
            return String(ord || "");
          })
        : []),
    ]).size;
    const selectedOrderRows = eligible.filter((r) =>
      selectedOrderIds.has(orderKey(r)),
    );
    return {
      total_orders: orderCount,
      total_dispatches: dispatchCount,
      total_invoice_value:
        selectedOrderRows.reduce(
          (s, r) => s + (Number(r.grand_total ?? r.total) || 0),
          0,
        ) +
        (mode === "edit"
          ? planOrders.reduce((s, r) => {
              const ord = r.order && typeof r.order === "object" ? r.order : null;
              return s + (Number(ord?.grand_total) || 0);
            }, 0)
          : 0),
    };
  }, [selectedItems, selectedOrderIds, eligible, mode, planOrders]);

  const orderSelectionState = (order: OrderListRow) => {
    const oid = orderKey(order);
    return selectedOrderIds.has(oid) ? ("all" as const) : ("none" as const);
  };

  const toggleOrder = (order: OrderListRow) => {
    const oid = orderKey(order);
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(oid)) next.delete(oid);
      else next.add(oid);
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
          toast.error("Select at least one order");
          return;
        }

        const created = await createPlan({
          plan_date: planDate,
          transport_agent: agentId,
          remarks: remarks || undefined,
          items: selectedItems,
        }).unwrap();
        const id = planIdOf(created);
        setSelectedOrderIds(new Set());
        setActivePlanId(id);
        toast.success("Transport plan saved as planned");
        // Stay on the form so Mapped / plan date / shipment name refresh.
        router.replace(`${base}/transport-planner/${id}/edit`);
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
        setSelectedOrderIds(new Set());
      }

      toast.success("Transport plan saved");
      // Keep editing so the order list updates Mapped / plan date / shipment.
      await Promise.all([
        planQ.refetch(),
        eligibleEnrichmentQ.refetch(),
      ]);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

  const handleRemovePlanOrder = async (planOrderId: string) => {
    if (!activePlanId) return;
    try {
      await removeOrder({ id: activePlanId, planOrderId }).unwrap();
      toast.success("Order removed from plan");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

  const isLoadingOrders =
    ordersQ.isLoading || ordersQ.isFetching || transportsQ.isFetching;

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
                : "Add pending pipeline orders to this plan"}
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
                  <th className="px-3 py-2">Mapping Status</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Plan Date</th>
                  <th className="px-3 py-2">Shipment Status</th>
                  {!readOnly ? <th className="px-3 py-2">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {planOrders.map((line) => {
                  const lineId = planIdOf(line);
                  const ord = line.order && typeof line.order === "object" ? line.order : null;
                  const disp =
                    line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;
                  const planPartyLabel = resolveOrderCounterparty(
                    {
                      party: line.party || ord?.party,
                    } as Record<string, unknown>,
                    partyNameById,
                  );
                  return (
                    <tr key={lineId}>
                      <td className="px-3 py-2 font-medium">{orderNoOf(line.order)}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {disp?.dispatch_no ||
                          (typeof line.dispatch === "string" ? line.dispatch : "—")}
                      </td>
                      <td className="px-3 py-2">{planPartyLabel}</td>
                      <td className="px-3 py-2">
                        {line.invoice_number || disp?.bill_number || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {line.transport ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                            Mapped
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/5 dark:text-slate-400">
                            Unmapped
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {agentLabel(line.transport?.transport_agent || planQ.data?.transport_agent)}
                      </td>
                      <td className="px-3 py-2">
                        {formatPlanDate(planQ.data?.plan_date)}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {line.transport?.shipment_status
                          ? String(line.transport.shipment_status).replaceAll("_", " ")
                          : "—"}
                      </td>
                      {!readOnly ? (
                        <td className="px-3 py-2">
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
                desktopPlaceholder="Search order no or party…"
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
                <option value="all">All</option>
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
            <PortalBusyOverlay active={isLoadingOrders} message="Loading orders…" />
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10">
              Select orders — Admin, Due sheet, Finance, Account, Dispatch, or Transport pending
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-950/80">
                <tr>
                  <th className="w-10 px-3 py-2">Select</th>
                  <SortableTh
                    label="Order"
                    sortKey="order"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Order Date"
                    sortKey="order_date"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Customer"
                    sortKey="customer"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="City"
                    sortKey="city"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Amount"
                    sortKey="amount"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Priority"
                    sortKey="priority"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Status"
                    sortKey="status"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Mapping Status"
                    sortKey="mapping"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Agent"
                    sortKey="agent"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Plan Date"
                    sortKey="plan_date"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Shipment"
                    sortKey="shipment"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedEligible.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                      No pending orders available.
                    </td>
                  </tr>
                ) : (
                  sortedEligible.map((row, index) => {
                    const id = orderKey(row);
                    const selState = orderSelectionState(row);
                    const workflowTab = getOrderWorkflowTabCategory(
                      row,
                      categoryOptions,
                    );
                    const mapping = mappingByOrderId.get(id);
                    const mapped = Boolean(mapping?.mapped);
                    const customerName = resolveOrderCounterparty(
                      row as Record<string, unknown>,
                      partyNameById,
                    );
                    const orderDateStr = formatDateShort(
                      row.order_date ?? row.created_at ?? row.createdAt,
                    );
                    const priority =
                      typeof row.priority === "string" ? row.priority : "normal";
                    const shipmentLabel =
                      mapping?.shipmentName ||
                      (mapping?.shipmentStatus
                        ? String(mapping.shipmentStatus).replaceAll("_", " ")
                        : "—");
                    return (
                      <tr
                        key={id}
                        className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selState === "all"}
                            onChange={() => toggleOrder(row)}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">
                          <span className="mr-2 text-xs font-normal text-slate-400">
                            {index + 1}.
                          </span>
                          {orderRefNo(row)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{orderDateStr}</td>
                        <td className="px-3 py-2">{customerName}</td>
                        <td className="px-3 py-2">
                          {orderCity(row, partyById) || "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(row.grand_total ?? row.total)}
                        </td>
                        <td className="px-3 py-2">{renderPriorityBadge(priority)}</td>
                        <td className="px-3 py-2">
                          {workflowTab ? (
                            renderWorkflowStatusBadge(workflowTab)
                          ) : (
                            <span className="capitalize text-slate-500">
                              {String(row.status || "pending").replaceAll("_", " ")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {mapped ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                              Mapped
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/5 dark:text-slate-400">
                              Unmapped
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {agentLabel(mapping?.agent as any)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatPlanDate(mapping?.planDate)}
                        </td>
                        <td className="px-3 py-2 capitalize">{shipmentLabel}</td>
                      </tr>
                    );
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

import type {
  TransportPlanOrderStatus,
  TransportPlanStatus,
} from "@/store/api";

export const TRANSPORT_PLAN_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "planned", label: "Planned" },
  { id: "submitted", label: "Submitted" },
  { id: "in_transit", label: "In Transit" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
] as const;

export function formatPlanDate(dateVal: unknown): string {
  if (!dateVal) return "—";
  const d = new Date(String(dateVal));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMoney(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function planIdOf(row: { _id?: string; id?: string } | null | undefined): string {
  if (!row) return "";
  return String(row._id || row.id || "");
}

export function agentLabel(
  agent:
    | string
    | {
        _id?: string;
        agent_name?: string;
        agent_code?: string;
      }
    | undefined
): string {
  if (!agent) return "—";
  if (typeof agent === "string") return agent;
  return agent.agent_name || agent.agent_code || agent._id || "—";
}

export function partyLabel(
  party: string | { _id?: string; party_name?: string } | undefined
): string {
  if (!party) return "—";
  if (typeof party === "string") return party;
  return party.party_name || party._id || "—";
}

export function orderNoOf(
  order: string | { _id?: string; order_no?: string } | undefined
): string {
  if (!order) return "—";
  if (typeof order === "string") return order;
  return order.order_no || order._id || "—";
}

export function canEditPlan(status: string | undefined): boolean {
  return status === "planned" || status === "draft";
}

export function canExecutePlan(status: string | undefined): boolean {
  return status === "submitted" || status === "in_transit";
}

export function renderPlanStatusBadge(status: string | undefined) {
  const s = (status || "draft") as TransportPlanStatus;
  const map: Record<
    TransportPlanStatus,
    { wrap: string; dot: string; label: string }
  > = {
    draft: {
      wrap: "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 ring-slate-500/10",
      dot: "bg-slate-400",
      label: "Draft",
    },
    planned: {
      wrap: "text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 ring-sky-700/10",
      dot: "bg-sky-600 dark:bg-sky-400",
      label: "Planned",
    },
    submitted: {
      wrap: "text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 ring-indigo-700/10",
      dot: "bg-indigo-600 dark:bg-indigo-400",
      label: "Submitted",
    },
    in_transit: {
      wrap: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 ring-amber-700/10",
      dot: "bg-amber-600 dark:bg-amber-400",
      label: "In Transit",
    },
    completed: {
      wrap: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 ring-emerald-700/10",
      dot: "bg-emerald-600 dark:bg-emerald-400",
      label: "Completed",
    },
    cancelled: {
      wrap: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 ring-rose-700/10",
      dot: "bg-rose-600 dark:bg-rose-400",
      label: "Cancelled",
    },
  };
  const style = map[s] || map.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${style.wrap}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function renderOrderStatusBadge(status: string | undefined) {
  const s = (status || "pending") as TransportPlanOrderStatus;
  const map: Record<
    TransportPlanOrderStatus,
    { wrap: string; dot: string; label: string }
  > = {
    pending: {
      wrap: "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 ring-slate-500/10",
      dot: "bg-slate-400",
      label: "Pending",
    },
    packed: {
      wrap: "text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 ring-sky-700/10",
      dot: "bg-sky-600 dark:bg-sky-400",
      label: "Packed",
    },
    dispatched: {
      wrap: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 ring-amber-700/10",
      dot: "bg-amber-600 dark:bg-amber-400",
      label: "Dispatched",
    },
    delivered: {
      wrap: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 ring-emerald-700/10",
      dot: "bg-emerald-600 dark:bg-emerald-400",
      label: "Delivered",
    },
    cancelled: {
      wrap: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 ring-rose-700/10",
      dot: "bg-rose-600 dark:bg-rose-400",
      label: "Cancelled",
    },
  };
  const style = map[s] || map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${style.wrap}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

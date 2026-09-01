import type { WorkPlanStatus, WorkPlanVisitStatus } from "@/store/api";

export const WORK_PLAN_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Pending Approval" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "completed", label: "Completed" },
] as const;

export const WORK_PLAN_TYPE_TABS = [
  { id: "all", label: "All types" },
  { id: "Visits", label: "Visits" },
  { id: "Leave", label: "Leave" },
  { id: "Work From Home", label: "Work From Home" },
  { id: "Work From Office", label: "Work From Office" },
] as const;

export function planTypeOf(planType?: string | null): string {
  return (planType && String(planType).trim()) || "Visits";
}

export function isWorkTaskPlan(planType?: string | null): boolean {
  const t = planTypeOf(planType);
  return t === "Work From Home" || t === "Work From Office";
}

export function isLeavePlan(planType?: string | null): boolean {
  return planTypeOf(planType) === "Leave";
}

export function planTypeShort(planType?: string | null): string {
  const t = planTypeOf(planType);
  if (t === "Work From Home") return "WFH";
  if (t === "Work From Office") return "WFO";
  return t;
}

export function planActivityLabel(plan: {
  plan_type?: string | null;
  visit_count?: number;
  work_count?: number;
  works?: unknown[];
}): string {
  const type = planTypeOf(plan.plan_type);
  if (type === "Leave") return "Leave";
  if (isWorkTaskPlan(type)) {
    const n =
      Number(plan.work_count) ||
      (Array.isArray(plan.works) ? plan.works.length : 0) ||
      0;
    return `${n} task${n === 1 ? "" : "s"}`;
  }
  const n = Number(plan.visit_count) || 0;
  return `${n} visit${n === 1 ? "" : "s"}`;
}

export const WORK_PLAN_EXPENSE_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Pending Approval" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
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

export function formatDateTime(dateVal: unknown): string {
  if (!dateVal) return "—";
  const d = new Date(String(dateVal));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function salesUserLabel(
  salesUser: string | { _id?: string; name?: string; email?: string } | undefined
): string {
  if (!salesUser) return "—";
  if (typeof salesUser === "string") return salesUser;
  return salesUser.name || salesUser.email || salesUser._id || "—";
}

export function partyLabel(
  party: string | { _id?: string; party_name?: string } | undefined,
  fallbackName?: string,
): string {
  if (fallbackName && fallbackName.trim()) return fallbackName.trim();
  if (!party) return "—";
  if (typeof party === "string") return party;
  return party.party_name || party._id || "—";
}

export function visitPartyLabel(visit: {
  party?: string | { _id?: string; party_name?: string };
  party_name?: string;
  party_type?: string;
}): string {
  const name = partyLabel(visit.party, visit.party_name);
  if (visit.party_type === "new_party") return `${name} (New party)`;
  if (visit.party_type === "new_lead") return `${name} (New lead)`;
  return name;
}

export function planIdOf(row: { _id?: string; id?: string } | null | undefined): string {
  if (!row) return "";
  return String(row._id || row.id || "");
}

export function renderPlanStatusBadge(status: string | undefined) {
  const s = (status || "draft") as WorkPlanStatus;
  const map: Record<
    WorkPlanStatus,
    { wrap: string; dot: string; label: string }
  > = {
    draft: {
      wrap: "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/5 ring-slate-500/10",
      dot: "bg-slate-400",
      label: "Draft",
    },
    submitted: {
      wrap: "text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 ring-indigo-700/10",
      dot: "bg-indigo-600 dark:bg-indigo-400",
      label: "Pending Approval",
    },
    approved: {
      wrap: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 ring-emerald-700/10",
      dot: "bg-emerald-600 dark:bg-emerald-400",
      label: "Approved",
    },
    rejected: {
      wrap: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 ring-rose-700/10",
      dot: "bg-rose-600 dark:bg-rose-400",
      label: "Rejected",
    },
    completed: {
      wrap: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 ring-blue-700/10",
      dot: "bg-blue-600 dark:bg-blue-400",
      label: "Completed",
    },
  };
  const meta = map[s] || map.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${meta.wrap}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function renderExpenseStatusBadge(status: string | undefined) {
  const s = status || "draft";
  const map: Record<string, { wrap: string; label: string }> = {
    draft: {
      wrap: "bg-slate-50 text-slate-600 ring-slate-500/10 dark:bg-white/5 dark:text-slate-400",
      label: "Draft",
    },
    submitted: {
      wrap: "bg-indigo-50 text-indigo-700 ring-indigo-700/10 dark:bg-indigo-950/30 dark:text-indigo-400",
      label: "Pending Approval",
    },
    approved: {
      wrap: "bg-emerald-50 text-emerald-700 ring-emerald-700/10 dark:bg-emerald-950/30 dark:text-emerald-400",
      label: "Approved",
    },
    rejected: {
      wrap: "bg-rose-50 text-rose-700 ring-rose-700/10 dark:bg-rose-950/30 dark:text-rose-400",
      label: "Rejected",
    },
  };
  const meta = map[s] || map.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.wrap}`}
    >
      {meta.label}
    </span>
  );
}

export function renderVisitStatusBadge(status: string | undefined) {
  const s = (status || "pending") as WorkPlanVisitStatus;
  const labels: Record<WorkPlanVisitStatus, string> = {
    pending: "Pending",
    checked_in: "Checked In",
    completed: "Completed",
    cancelled: "Cancelled",
    skipped: "Skipped",
    rescheduled: "Rescheduled",
  };
  const tones: Record<WorkPlanVisitStatus, string> = {
    pending:
      "bg-slate-50 text-slate-600 ring-slate-500/10 dark:bg-white/5 dark:text-slate-400",
    checked_in:
      "bg-amber-50 text-amber-700 ring-amber-700/10 dark:bg-amber-950/30 dark:text-amber-400",
    completed:
      "bg-emerald-50 text-emerald-700 ring-emerald-700/10 dark:bg-emerald-950/30 dark:text-emerald-400",
    cancelled:
      "bg-rose-50 text-rose-700 ring-rose-700/10 dark:bg-rose-950/30 dark:text-rose-400",
    skipped:
      "bg-slate-50 text-slate-500 ring-slate-500/10 dark:bg-white/5 dark:text-slate-400",
    rescheduled:
      "bg-violet-50 text-violet-700 ring-violet-700/10 dark:bg-violet-950/30 dark:text-violet-400",
  };
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${tones[s] || tones.pending}`}
    >
      {labels[s] || s}
    </span>
  );
}

export function canEditPlan(
  status: string | undefined,
  opts?: { isAdmin?: boolean },
): boolean {
  const s = status || "draft";
  // Admin / super_admin may edit after submit/approve (sales-user plans they manage).
  if (opts?.isAdmin) {
    return s !== "completed";
  }
  return s === "draft" || s === "rejected";
}

/** Sales may add expenses only on plan day through plan day + 2 (3 calendar days). */
export const EXPENSE_ADD_WINDOW_DAYS = 3;

export function canAddExpenseForPlanDate(
  planDate: unknown,
  now: Date = new Date(),
): boolean {
  if (!planDate) return false;
  const start = new Date(String(planDate));
  if (Number.isNaN(start.getTime())) return false;
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (EXPENSE_ADD_WINDOW_DAYS - 1));
  end.setUTCHours(23, 59, 59, 999);
  const t = now.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function expenseAddWindowHint(planDate: unknown): string {
  if (!planDate) {
    return "Expenses can only be added during the work plan day and the next 2 days.";
  }
  const start = new Date(String(planDate));
  if (Number.isNaN(start.getTime())) {
    return "Expenses can only be added during the work plan day and the next 2 days.";
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (EXPENSE_ADD_WINDOW_DAYS - 1));
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `Add expenses only from ${fmt(start)} through ${fmt(end)}.`;
}

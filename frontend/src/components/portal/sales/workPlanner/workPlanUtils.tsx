import type { WorkPlanStatus, WorkPlanVisitStatus } from "@/store/api";

export const WORK_PLAN_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Pending Approval" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "completed", label: "Completed" },
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
  party: string | { _id?: string; party_name?: string } | undefined
): string {
  if (!party) return "—";
  if (typeof party === "string") return party;
  return party.party_name || party._id || "—";
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

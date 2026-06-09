"use client";

import { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import { useListUsersQuery } from "@/store/api";

type AssignmentsTabProps = {
  detail: Record<string, any>;
};

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function resolveUserId(userVal: unknown): string {
  if (!userVal) return "";
  if (typeof userVal === "string") return userVal;
  if (typeof userVal === "object" && userVal !== null) {
    const o = userVal as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return "";
}

export function AssignmentsTab({ detail }: AssignmentsTabProps) {
  const usersQ = useListUsersQuery({});
  const users = useMemo(() => {
    return pickList(usersQ.data) as Record<string, any>[];
  }, [usersQ.data]);

  const renderReadOnlyAssignment = (label: string, value: string) => {
    const assignedUser = users.find(
      (u) => String(u._id ?? u.id ?? "") === value
    );

    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 transition-all duration-200 hover:border-slate-200 dark:border-white/5 dark:bg-slate-950/20">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
          {label}
        </span>
        {assignedUser ? (
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {String(
                assignedUser.name || assignedUser.username || "Unnamed Operator"
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-col gap-0.5 font-sans font-normal">
              <span>📧 {String(assignedUser.email || "No Email")}</span>
              <span>📞 {String(assignedUser.phone || "—")}</span>
            </div>
          </div>
        ) : (
          <div className="text-sm italic text-slate-400 dark:text-slate-600">
            🚫 Unassigned
          </div>
        )}
      </div>
    );
  };

  if (usersQ.isLoading) {
    return (
      <DashboardCard
        title="Departmental Assignments"
        description="View operators assigned from each department to manage this order lifecycle."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-slate-950/20 animate-pulse space-y-3"
            >
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-slate-300 dark:bg-slate-700 rounded" />
                <div className="h-3 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
    );
  }

  if (usersQ.isError) {
    return (
      <DashboardCard
        title="Departmental Assignments"
        description="View operators assigned from each department to manage this order lifecycle."
      >
        <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-5 text-center dark:border-rose-900/30 dark:bg-rose-950/10">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
            ⚠️ Failed to load departmental assignments.
          </p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title="Departmental Assignments"
      description="View operators assigned from each department to manage this order lifecycle."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {renderReadOnlyAssignment(
          "Sales Assignment",
          resolveUserId(detail.assigned_sales_user)
        )}
        {renderReadOnlyAssignment(
          "Finance Assignment",
          resolveUserId(detail.assigned_finance_user)
        )}
        {renderReadOnlyAssignment(
          "Dispatch Assignment",
          resolveUserId(detail.assigned_dispatch_user)
        )}
        {renderReadOnlyAssignment(
          "Admin Assignment",
          resolveUserId(detail.assigned_admin_user)
        )}
      </div>
    </DashboardCard>
  );
}

export default AssignmentsTab;

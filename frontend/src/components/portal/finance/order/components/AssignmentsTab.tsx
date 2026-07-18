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
        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
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

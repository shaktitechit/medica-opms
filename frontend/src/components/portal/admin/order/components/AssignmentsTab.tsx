import React from "react";
import { DashboardCard } from "@/components/widgets";

interface AssignmentsTabProps {
  assignedSales: string;
  assignedFinance: string;
  assignedDispatch: string;
  salesUsers: Record<string, unknown>[];
  financeUsers: Record<string, unknown>[];
  dispatchUsers: Record<string, unknown>[];
  renderDepartmentAssignment: (
    label: string,
    value: string,
    usersList: Record<string, unknown>[]
  ) => React.ReactNode;
}

export function AssignmentsTab({
  assignedSales,
  assignedFinance,
  assignedDispatch,
  salesUsers,
  financeUsers,
  dispatchUsers,
  renderDepartmentAssignment,
}: AssignmentsTabProps) {
  return (
    <DashboardCard
      title="Departmental Assignments"
      description="Operators assigned to each department for this order."
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {renderDepartmentAssignment("Sales Assignment", assignedSales, salesUsers)}
          {renderDepartmentAssignment("Finance Assignment", assignedFinance, financeUsers)}
          {renderDepartmentAssignment("Dispatch Assignment", assignedDispatch, dispatchUsers)}
        </div>
      </div>
    </DashboardCard>
  );
}

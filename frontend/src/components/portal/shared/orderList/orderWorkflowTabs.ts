import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
export type ApprovalPendingStage = "admin" | "finance" | "account" | null;

export type ApprovalPendingSummary = {
  admin: boolean;
  finance: boolean;
  account: boolean;
  stage: ApprovalPendingStage;
};

export function isOrderClosed(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  if (row.closed_at != null && row.closed_at !== "") return true;
  return String(row.status || "").toLowerCase() === "closed";
}

export function resolveApprovalPending(order: unknown): ApprovalPendingSummary {
  if (!order || typeof order !== "object") {
    return { admin: false, finance: false, account: false, stage: null };
  }

  const row = order as Record<string, unknown>;
  const fromApi = row.approval_pending;
  if (fromApi && typeof fromApi === "object") {
    const pending = fromApi as Record<string, unknown>;
    const stage = pending.stage;
    const normalizedStage: ApprovalPendingStage =
      stage === "admin" || stage === "finance" || stage === "account" ? stage : null;
    return {
      admin: Boolean(pending.admin),
      finance: Boolean(pending.finance),
      account: Boolean(pending.account),
      stage: normalizedStage,
    };
  }

  const status = deriveOrderWorkflowStatus(row);
  const adminStatus = String(row.admin_approval_status || "pending");
  const financeStatus = String(row.finance_approval_status || "pending");
  const accountStatus = String(row.account_approval_status || "pending");

  const admin = status === "submitted";
  const finance =
    status === "finance_review" ||
    status === "sales_approved" ||
    financeStatus === "pending" ||
    financeStatus === "partial";
  const account =
    status === "account_review" ||
    accountStatus === "pending" ||
    accountStatus === "partial";

  let stage: ApprovalPendingStage = null;
  if (admin) stage = "admin";
  else if (finance) stage = "finance";
  else if (account) stage = "account";

  return { admin, finance, account, stage };
}

export function hasAnyPendingApproval(order: unknown): boolean {
  const pending = resolveApprovalPending(order);
  return pending.admin || pending.finance || pending.account;
}

export function pendingApprovalStageLabel(stage: ApprovalPendingStage): string {
  switch (stage) {
    case "admin":
      return "Admin";
    case "finance":
      return "Finance";
    case "account":
      return "Account";
    default:
      return "Approval";
  }
}

export type OrderWorkflowTabCategory =
  | "all"
  | "pending_admin_approval"
  | "due_sheet_pending"
  | "pending_finance_approval"
  | "pending_account_approval"
  | "open_dispatched"
  | "closed_delivered"
  | "on_hold"
  | "cancelled"
  | "rejected";

export const ORDER_WORKFLOW_TABS: ReadonlyArray<{
  id: OrderWorkflowTabCategory;
  label: string;
}> = [
  { id: "all", label: "All Orders" },
  { id: "pending_admin_approval", label: "Admin Pending" },
  { id: "due_sheet_pending", label: "Due Sheet Pending" },
  { id: "pending_finance_approval", label: "Finance Pending" },
  { id: "pending_account_approval", label: "Account Pending" },
  { id: "open_dispatched", label: "Open/Dispatch Pending" },
  { id: "closed_delivered", label: "Closed/Delivered" },
  { id: "on_hold", label: "On Hold" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rejected", label: "Rejected" },
];

export const ORDER_WORKFLOW_TAB_LABELS: Record<OrderWorkflowTabCategory, string> = {
  all: "All Orders",
  pending_admin_approval: "Admin Pending",
  due_sheet_pending: "Due Sheet Pending",
  pending_finance_approval: "Finance Pending",
  pending_account_approval: "Account Pending",
  open_dispatched: "Open/Dispatch Pending",
  closed_delivered: "Closed/Delivered",
  on_hold: "On Hold",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const ORDER_PRIORITY_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

export function isOrderDelivered(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);
  if (status === "delivered") return true;
  const deliveryStatus = String(row.delivery_status || "").toLowerCase();
  const lifecycle = String(row.lifecycle_status || "").toLowerCase();
  return deliveryStatus === "completed" || lifecycle === "fulfilled";
}

export function isOrderClosedOrDelivered(order: unknown): boolean {
  return isOrderClosed(order) || isOrderDelivered(order);
}

export function isDueSheetPending(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return false;
  if (status === "on_hold") return false;
  if (status === "cancelled") return false;
  if (status === "finance_rejected") return false;
  if (isOrderClosedOrDelivered(row)) return false;

  const pending = resolveApprovalPending(row);
  if (pending.admin) return false;
  if (row.due_sheet_uploaded === true) return false;

  return true;
}

export function getOrderWorkflowTabCategory(order: unknown): OrderWorkflowTabCategory | null {
  if (!order || typeof order !== "object") return null;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";
  if (isOrderClosedOrDelivered(row)) return "closed_delivered";

  const pending = resolveApprovalPending(row);
  if (pending.admin) return "pending_admin_approval";
  if (isDueSheetPending(row)) return "due_sheet_pending";
  if (pending.finance) return "pending_finance_approval";
  if (pending.account) return "pending_account_approval";

  return "open_dispatched";
}

export function orderMatchesWorkflowTab(
  order: unknown,
  tab: OrderWorkflowTabCategory,
): boolean {
  if (!order || typeof order !== "object") return false;

  if (tab === "all") {
    return deriveOrderWorkflowStatus(order as Record<string, unknown>) !== "draft";
  }

  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);
  const isPipelineActive =
    status !== "on_hold" &&
    status !== "cancelled" &&
    status !== "finance_rejected" &&
    !isOrderClosedOrDelivered(row);

  const pending = resolveApprovalPending(order);

  if (tab === "pending_admin_approval") return isPipelineActive && pending.admin;
  if (tab === "due_sheet_pending") return isPipelineActive && isDueSheetPending(order);
  if (tab === "pending_finance_approval") return isPipelineActive && pending.finance;
  if (tab === "pending_account_approval") return isPipelineActive && pending.account;

  return getOrderWorkflowTabCategory(order) === tab;
}

export function isOrderWorkflowTabCategory(value: string): value is OrderWorkflowTabCategory {
  return ORDER_WORKFLOW_TABS.some((tab) => tab.id === value);
}

export function normalizeWorkflowTabFromUrl(
  value: string | null,
  defaultTab: OrderWorkflowTabCategory,
): OrderWorkflowTabCategory {
  if (!value) return defaultTab;
  if (value === "pending_finance_review") return "pending_finance_approval";
  if (value === "pending_account_review") return "pending_account_approval";
  if (value === "pending_review") return "pending_admin_approval";
  if (value === "open") return "open_dispatched";
  if (value === "closed") return "closed_delivered";
  if (value === "pending_approvals") return "all";
  if (value === "pending_approval") return "pending_finance_approval";
  if (isOrderWorkflowTabCategory(value)) return value;
  return defaultTab;
}

/** API query hints for workflow list tabs (when not searching). */
export function workflowTabQueryParams(
  tab: OrderWorkflowTabCategory,
): Record<string, string | undefined> {
  switch (tab) {
    case "all":
      return { exclude_status: "draft" };
    case "pending_admin_approval":
      return { status: "pending_review" };
    case "due_sheet_pending":
      return { exclude_status: "draft,submitted,on_hold,cancelled,finance_rejected" };
    case "pending_finance_approval":
      return { status: "pending_finance_review" };
    case "pending_account_approval":
      return { status: "pending_account_review" };
    case "on_hold":
      return { status: "on_hold" };
    case "cancelled":
      return { status: "cancelled" };
    case "rejected":
      return { status: "finance_rejected" };
    case "open_dispatched":
      return { status: "open" };
    case "closed_delivered":
      return { exclude_status: "draft,submitted,on_hold,cancelled,finance_rejected" };
    default:
      return {};
  }
}

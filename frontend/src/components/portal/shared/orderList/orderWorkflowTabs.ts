import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";

export type ApprovalPendingStage = "admin" | "finance" | "account" | null;

export type ApprovalPendingSummary = {
  admin: boolean;
  finance: boolean;
  account: boolean;
  stage: ApprovalPendingStage;
};

/** Admin-only clearance values (includes handoff to finance). */
const ADMIN_CLEARED_STATUS = new Set(["approved", "full", "sent_to_finance"]);
/** Explicit department approval values — do not include sent_to_finance. */
const DEPT_CLEARED_STATUS = new Set(["approved", "full"]);
const PARTIAL_OR_PENDING = new Set(["pending", "partial", ""]);

/** Statuses that mean admin has already signed off (order moved past submit). */
const POST_ADMIN_STATUSES = new Set([
  "sales_approved",
  "finance_review",
  "partially_finance_approved",
  "fully_finance_approved",
  "account_review",
  "partially_account_approved",
  "fully_account_approved",
  "account_approved",
  "dispatch_pending",
  "partial_dispatch_created",
  "full_dispatch_created",
  "transport_pending",
  "transport_assigned",
  "partially_transported",
  "fully_transported",
  "in_transit",
  "delivered",
  "closed",
]);

/**
 * Still awaiting finance action. Important: after admin approve, line
 * `approved_quantity` can make `finance_approval_status` look "approved" —
 * those statuses must stay finance-pending until finance actually acts.
 */
const PRE_FINANCE_STATUSES = new Set([
  "draft",
  "submitted",
  "pending_review",
  "sales_approved",
  "finance_review",
]);

/** Statuses that prove finance has signed off (or the order is past that stage). */
const POST_FINANCE_STATUSES = new Set([
  "partially_finance_approved",
  "fully_finance_approved",
  "finance_approved",
  "account_review",
  "partially_account_approved",
  "fully_account_approved",
  "account_approved",
  "dispatch_pending",
  "partial_dispatch_created",
  "full_dispatch_created",
  "transport_pending",
  "transport_assigned",
  "partially_transported",
  "fully_transported",
  "in_transit",
  "delivered",
  "closed",
]);

function adminApprovalCleared(value: unknown): boolean {
  return ADMIN_CLEARED_STATUS.has(String(value || "").toLowerCase());
}

function deptApprovalCleared(value: unknown): boolean {
  return DEPT_CLEARED_STATUS.has(String(value || "").toLowerCase());
}

function approvalStatusOpen(value: unknown): boolean {
  const s = String(value || "pending").toLowerCase();
  return PARTIAL_OR_PENDING.has(s);
}

export function isOrderClosed(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  if (row.closed_at != null && row.closed_at !== "") return true;
  return String(row.status || "").toLowerCase() === "closed";
}

/**
 * Sequential clearance helpers for the approval pipeline:
 * submitted → admin → due sheet → finance → account → dispatch.
 */
export function isAdminCleared(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);
  const adminStatus = String(row.admin_approval_status || "pending").toLowerCase();

  // Explicit admin sign-off wins even if status transition lagged.
  if (adminApprovalCleared(adminStatus)) return true;
  if (status === "draft" || status === "submitted" || status === "pending_review") {
    return false;
  }
  if (POST_ADMIN_STATUSES.has(status)) return true;
  return !approvalStatusOpen(adminStatus);
}

/**
 * Finance clearance from OrderApproval (`approval_pending` / is_finance_approved)
 * plus post-finance workflow status. Does not trust finance_approval_status alone
 * after admin (admin qty can mark that field approved early).
 */
export function isFinanceCleared(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);
  const pending =
    row.approval_pending && typeof row.approval_pending === "object"
      ? (row.approval_pending as Record<string, unknown>)
      : null;

  // OrderApproval table enrichment (source of truth for batch pipeline).
  if (pending && "finance" in pending) {
    // Any active batch still needs finance.
    if (Boolean(pending.finance)) return false;
    // Finance done on batches and account is waiting → finance cleared.
    if (Boolean(pending.account)) return true;
  }

  // Admin-approved / finance_review without OrderApproval proof stay in finance.
  // (finance_approval_status can look approved from admin line quantities.)
  if (PRE_FINANCE_STATUSES.has(status)) return false;

  if (row.is_finance_approved === true) return true;
  if (POST_FINANCE_STATUSES.has(status)) return true;

  // All active OrderApproval batches have is_finance_approved=true.
  if (pending && "finance" in pending && !Boolean(pending.finance) && isAdminCleared(row)) {
    return true;
  }

  return false;
}

export function isAccountCleared(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);
  const pending =
    row.approval_pending && typeof row.approval_pending === "object"
      ? (row.approval_pending as Record<string, unknown>)
      : null;

  // OrderApproval: any active batch still needs account.
  if (pending && "account" in pending && Boolean(pending.account)) {
    return false;
  }

  // Account cannot be cleared before finance.
  if (!isFinanceCleared(row)) return false;

  const accountStatus = String(row.account_approval_status || "pending").toLowerCase();
  if (deptApprovalCleared(accountStatus)) return true;
  if (row.is_account_approved === true) return true;

  return (
    status === "fully_account_approved" ||
    status === "account_approved" ||
    status === "partially_account_approved" ||
    status === "dispatch_pending" ||
    status === "partial_dispatch_created" ||
    status === "full_dispatch_created" ||
    status.startsWith("transport") ||
    status === "in_transit" ||
    status === "delivered" ||
    status === "closed"
  );
}

/** True when an active OrderDueSheet exists (list/detail enrichment). */
export function isDueSheetUploaded(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  return (order as Record<string, unknown>).due_sheet_uploaded === true;
}

/**
 * True when OrderApproval.is_due_sheet_uploaded is set in the DB
 * (on the order enrichment or nested last_*_approval refs).
 */
export function isApprovalDueSheetUploaded(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  if (row.is_due_sheet_uploaded === true) return true;

  for (const key of [
    "last_admin_approval",
    "last_finance_approval",
    "last_account_approval",
  ] as const) {
    const ref = row[key];
    if (
      ref &&
      typeof ref === "object" &&
      (ref as Record<string, unknown>).is_due_sheet_uploaded === true
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Due-sheet workflow gate: physical upload OR approval flag in DB.
 * Either path clears due-sheet pending and unblocks finance.
 */
export function isDueSheetStageCleared(order: unknown): boolean {
  return isDueSheetUploaded(order) || isApprovalDueSheetUploaded(order);
}

/**
 * Exclusive pending stage for list tabs.
 *
 * Flow:
 * 1. submitted → admin pending
 * 2. admin cleared + due sheet not cleared → due sheet pending (handled by isDueSheetPending)
 * 3. admin + due sheet cleared + finance not cleared → finance pending
 * 4. admin + due sheet cleared + finance + account not cleared → account pending
 * 5. otherwise no approval stage pending (dispatch / later)
 *
 * Always sequential — overlapping API `approval_pending` flags are ignored for
 * tab membership so an order never sits in two approval tabs at once.
 */
export function resolveApprovalPending(order: unknown): ApprovalPendingSummary {
  if (!order || typeof order !== "object") {
    return { admin: false, finance: false, account: false, stage: null };
  }

  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") {
    return { admin: false, finance: false, account: false, stage: null };
  }

  // Submitted / pending_review sit in Admin Pending until admin is cleared.
  if (!isAdminCleared(row)) {
    return { admin: true, finance: false, account: false, stage: "admin" };
  }

  if (!isDueSheetStageCleared(row)) {
    // Due sheet gate is its own tab; no approval stage is "current" here.
    return { admin: false, finance: false, account: false, stage: null };
  }

  if (!isFinanceCleared(row)) {
    return { admin: false, finance: true, account: false, stage: "finance" };
  }

  if (!isAccountCleared(row)) {
    return { admin: false, finance: false, account: true, stage: "account" };
  }

  return { admin: false, finance: false, account: false, stage: null };
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
  { id: "open_dispatched", label: "Dispatch Pending" },
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
  open_dispatched: "Dispatch Pending",
  closed_delivered: "Closed/Delivered",
  on_hold: "On Hold",
  cancelled: "Cancelled",
  rejected: "Rejected",
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

/**
 * Admin cleared, and due sheet not yet cleared.
 * Clears when a due sheet is uploaded OR OrderApproval.is_due_sheet_uploaded is true.
 */
export function isDueSheetPending(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return false;
  if (status === "on_hold") return false;
  if (status === "cancelled") return false;
  if (status === "finance_rejected") return false;
  if (isOrderClosedOrDelivered(row)) return false;

  if (!isAdminCleared(row)) return false;
  if (isDueSheetStageCleared(row)) return false;

  return true;
}

/**
 * Shared exclusive workflow bucket used by all portals (before transport/return overlays).
 *
 * submitted → admin pending
 * admin done → due sheet pending
 * admin + due sheet cleared → finance pending
 * admin + due sheet cleared + finance → account pending
 * all of the above done → dispatch pending
 */
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
  if (value === "dispatch_pending") return "open_dispatched";
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

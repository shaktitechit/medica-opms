/**
 * Order list workflow tabs — synced with backend models / enrichment:
 *
 * | Concern              | Source of truth                                              |
 * |----------------------|--------------------------------------------------------------|
 * | Queue / stage        | Order.status, Order.workflow_stage, Order.lifecycle_status   |
 * | Admin / finance / acct | OrderApproval flags + Order.*_approval_status + approval_pending |
 * | Due-sheet gate       | OrderDueSheet (active current) OR OrderApproval.is_due_sheet_uploaded |
 * | Dispatch rollup      | Order.dispatch_status (pending\|partial\|completed)          |
 * | Dispatch batches     | OrderDispatch.dispatch_status (draft\|submitted\|…)          |
 * | Transport            | TransportShipment.shipment_status                             |
 * | Delivery rollup      | Order.delivery_status (pending\|partial\|completed)          |
 * | Delivery lines       | OrderDelivery.delivery_status                                |
 * | Returns              | OrderReturn.return_status                                    |
 * | Audit trail only     | OrderWorkflow (from_/to_ snapshots)                          |
 *
 * Exclusive pipeline:
 * sales → admin → due sheet → finance → account → dispatch → transport → delivery → return/close
 *
 * List enrichment (orderApprovalPending.util):
 * - approval_pending: { admin, finance, account, stage }
 * - due_sheet_uploaded / is_due_sheet_uploaded (sheet OR approval flag)
 */

import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";

export type ApprovalPendingStage = "admin" | "finance" | "account" | null;

export type ApprovalPendingSummary = {
  admin: boolean;
  finance: boolean;
  account: boolean;
  stage: ApprovalPendingStage;
};

/** Mirrors backend APPROVAL_STATUS (+ registry sent_to_finance). */
const ADMIN_CLEARED_STATUS = new Set(["approved", "full", "sent_to_finance"]);
const DEPT_CLEARED_STATUS = new Set(["approved", "full"]);
const PARTIAL_OR_PENDING = new Set(["pending", "partial", ""]);

/**
 * Order.status values that mean admin has signed off
 * (canonical ORDER_STATUS + common legacy aliases still stored in DB).
 */
const POST_ADMIN_STATUSES = new Set([
  "sales_approved",
  "finance_review",
  "finance_approved",
  "partially_finance_approved",
  "fully_finance_approved",
  "account_review",
  "account_approved",
  "partially_account_approved",
  "fully_account_approved",
  "dispatch",
  "dispatch_pending",
  "partial_dispatch_created",
  "full_dispatch_created",
  "in_transit",
  "transport_pending",
  "transport_assigned",
  "partially_transported",
  "fully_transported",
  "delivered",
  "closed",
]);

/**
 * Still awaiting finance. After admin approve, line qty can make
 * finance_approval_status look approved — keep these finance-pending.
 */
const PRE_FINANCE_STATUSES = new Set([
  "draft",
  "submitted",
  "pending_review",
  "sales_approved",
  "finance_review",
]);

/** Order.status values that prove finance has signed off (or later). */
const POST_FINANCE_STATUSES = new Set([
  "finance_approved",
  "partially_finance_approved",
  "fully_finance_approved",
  "account_review",
  "account_approved",
  "partially_account_approved",
  "fully_account_approved",
  "dispatch",
  "dispatch_pending",
  "partial_dispatch_created",
  "full_dispatch_created",
  "in_transit",
  "transport_pending",
  "transport_assigned",
  "partially_transported",
  "fully_transported",
  "delivered",
  "closed",
]);

function asRow(order: unknown): Record<string, unknown> | null {
  if (!order || typeof order !== "object") return null;
  return order as Record<string, unknown>;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

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

/** Backend list enrichment: OrderApproval pending rollup. */
function readApprovalPending(
  row: Record<string, unknown>,
): ApprovalPendingSummary | null {
  const pending = row.approval_pending;
  if (!pending || typeof pending !== "object") return null;
  const p = pending as Record<string, unknown>;
  if (!("admin" in p) && !("finance" in p) && !("account" in p) && !("stage" in p)) {
    return null;
  }
  const stageRaw = String(p.stage || "").toLowerCase();
  const stage: ApprovalPendingStage =
    stageRaw === "admin" || stageRaw === "finance" || stageRaw === "account"
      ? stageRaw
      : null;
  return {
    admin: Boolean(p.admin),
    finance: Boolean(p.finance),
    account: Boolean(p.account),
    stage,
  };
}

/** Order.closed_at / Order.status === closed (workflow_stage completed). */
export function isOrderClosed(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  if (row.closed_at != null && row.closed_at !== "") return true;
  return String(row.status || "").toLowerCase() === "closed";
}

/**
 * OrderApproval.is_admin_approved / Order.admin_approval_status /
 * approval_pending.admin (enriched).
 */
export function isAdminCleared(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;

  const enriched = readApprovalPending(row);
  if (enriched?.admin) return false;

  // Explicit OrderApproval / Order flag.
  if (row.is_admin_approved === true) return true;

  const status = deriveOrderWorkflowStatus(row);
  const adminStatus = String(row.admin_approval_status || "pending").toLowerCase();

  if (adminApprovalCleared(adminStatus)) return true;
  if (status === "draft" || status === "submitted" || status === "pending_review") {
    return false;
  }
  if (POST_ADMIN_STATUSES.has(status)) return true;
  return !approvalStatusOpen(adminStatus);
}

/**
 * OrderApproval.is_finance_approved / approval_pending.finance /
 * Order.status past finance. Does not trust finance_approval_status alone
 * after admin (admin qty can mark that field approved early).
 */
export function isFinanceCleared(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  const status = deriveOrderWorkflowStatus(row);
  const enriched = readApprovalPending(row);

  if (enriched && ("finance" in (row.approval_pending as object))) {
    if (enriched.finance) return false;
    if (enriched.account) return true;
  }

  if (PRE_FINANCE_STATUSES.has(status)) return false;
  if (row.is_finance_approved === true) return true;
  if (POST_FINANCE_STATUSES.has(status)) return true;

  if (enriched && !enriched.finance && isAdminCleared(row)) {
    return true;
  }

  return false;
}

/**
 * OrderApproval.is_account_approved / approval_pending.account /
 * Order.account_approval_status / post-account Order.status.
 */
export function isAccountCleared(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  const status = deriveOrderWorkflowStatus(row);
  const enriched = readApprovalPending(row);

  if (enriched?.account) return false;
  if (!isFinanceCleared(row)) return false;

  if (row.is_account_approved === true) return true;

  const accountStatus = String(row.account_approval_status || "pending").toLowerCase();
  if (deptApprovalCleared(accountStatus)) return true;

  return (
    status === "account_approved" ||
    status === "fully_account_approved" ||
    status === "partially_account_approved" ||
    status === "dispatch" ||
    status === "dispatch_pending" ||
    status === "partial_dispatch_created" ||
    status === "full_dispatch_created" ||
    status === "in_transit" ||
    status.startsWith("transport") ||
    status === "delivered" ||
    status === "closed"
  );
}

/** OrderDueSheet present — list enrichment `due_sheet_uploaded`. */
export function isDueSheetUploaded(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  return isTruthyFlag(row.due_sheet_uploaded);
}

/**
 * OrderApproval.is_due_sheet_uploaded (enriched on order or nested last_*_approval).
 */
export function isApprovalDueSheetUploaded(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  if (isTruthyFlag(row.is_due_sheet_uploaded)) return true;

  for (const key of [
    "last_admin_approval",
    "last_finance_approval",
    "last_account_approval",
  ] as const) {
    const ref = row[key];
    if (
      ref &&
      typeof ref === "object" &&
      isTruthyFlag((ref as Record<string, unknown>).is_due_sheet_uploaded)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Due-sheet gate (between admin and finance):
 * OrderDueSheet (active current) OR OrderApproval.is_due_sheet_uploaded.
 */
export function isDueSheetStageCleared(order: unknown): boolean {
  return isDueSheetUploaded(order) || isApprovalDueSheetUploaded(order);
}

/**
 * Exclusive pending stage for list tabs (frontend due-sheet gate applied on top
 * of backend approval_pending).
 */
export function resolveApprovalPending(order: unknown): ApprovalPendingSummary {
  const row = asRow(order);
  if (!row) {
    return { admin: false, finance: false, account: false, stage: null };
  }

  const status = deriveOrderWorkflowStatus(row);
  if (status === "draft") {
    return { admin: false, finance: false, account: false, stage: null };
  }

  // Sequential — ignore overlapping API flags for exclusive tab membership.
  if (!isAdminCleared(row)) {
    return { admin: true, finance: false, account: false, stage: "admin" };
  }
  if (!isDueSheetStageCleared(row)) {
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

/** Order.status delivered / Order.delivery_status completed / lifecycle fulfilled. */
export function isOrderDelivered(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
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
 * Admin cleared + due sheet not cleared.
 * OrderDueSheet upload OR OrderApproval.is_due_sheet_uploaded clears this.
 */
export function isDueSheetPending(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return false;
  if (status === "on_hold") return false;
  if (status === "cancelled") return false;
  if (status === "finance_rejected" || status === "account_rejected") return false;
  if (isOrderClosedOrDelivered(row)) return false;

  if (!isAdminCleared(row)) return false;
  if (isDueSheetStageCleared(row)) return false;

  return true;
}

/**
 * Exclusive tab bucket (before transport/return overlays in portal utils):
 * admin → due sheet → finance → account → dispatch
 */
export function getOrderWorkflowTabCategory(order: unknown): OrderWorkflowTabCategory | null {
  const row = asRow(order);
  if (!row) return null;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected" || status === "account_rejected") return "rejected";
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
  const row = asRow(order);
  if (!row) return false;

  if (tab === "all") {
    return deriveOrderWorkflowStatus(row) !== "draft";
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
  if (value === "dispatch_pending" || value === "dispatch") return "open_dispatched";
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

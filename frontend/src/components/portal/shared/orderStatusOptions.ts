/**
 * Centralized order status filter options per department.
 *
 * Each department only sees the statuses that are relevant to their
 * workflow. The master list lives here so that status values and labels
 * stay consistent across the application.
 */

export type StatusOption = { value: string; label: string };

/* ------------------------------------------------------------------ */
/*  Master status catalogue                                           */
/* ------------------------------------------------------------------ */

const DRAFT:                    StatusOption = { value: "draft",                     label: "Draft" };
const SUBMITTED:                StatusOption = { value: "submitted",                 label: "Submitted" };
const SALES_APPROVED:           StatusOption = { value: "sales_approved",            label: "Sales Approved" };
const FINANCE_REVIEW:           StatusOption = { value: "finance_review",            label: "Finance Review" };
const FINANCE_APPROVED:         StatusOption = { value: "finance_approved",          label: "Finance Approved" };
const PARTIALLY_FINANCE_APPROVED: StatusOption = { value: "partially_finance_approved", label: "Partially Finance Approved" };
const FULLY_FINANCE_APPROVED:    StatusOption = { value: "fully_finance_approved",     label: "Fully Finance Approved" };
const FINANCE_REJECTED:         StatusOption = { value: "finance_rejected",          label: "Finance Rejected" };
const DISPATCH_PENDING:         StatusOption = { value: "dispatch_pending",          label: "Dispatch Pending" };
const PARTIAL_DISPATCH_CREATED: StatusOption = { value: "partial_dispatch_created",  label: "Partial Dispatch Created" };
const FULL_DISPATCH_CREATED:    StatusOption = { value: "full_dispatch_created",     label: "Full Dispatch Created" };
const TRANSPORT_PENDING:        StatusOption = { value: "transport_pending",         label: "Transport Pending" };
const TRANSPORT_ASSIGNED:       StatusOption = { value: "transport_assigned",        label: "Transport Assigned" };
const PARTIALLY_TRANSPORTED: StatusOption = { value: "partially_transported", label: "Partially Transported" };
const FULLY_TRANSPORTED:      StatusOption = { value: "fully_transported",      label: "Fully Transported" };
const IN_TRANSIT:               StatusOption = { value: "in_transit",                label: "In Transit" };
const DELIVERED:                StatusOption = { value: "delivered",                 label: "Delivered" };
const CANCELLED:                StatusOption = { value: "cancelled",                 label: "Cancelled" };
const ON_HOLD:                  StatusOption = { value: "on_hold",                   label: "On Hold" };

const DISPATCH_REVIEW:          StatusOption = { value: "dispatch_review",           label: "Dispatch Review" };
const PARTIALLY_DISPATCHED:     StatusOption = { value: "partially_dispatched",      label: "Partially Dispatched" };
const FULLY_DISPATCHED:        StatusOption = { value: "fully_dispatched",         label: "Fully Dispatched" };
const PARTIALLY_DELIVERED:      StatusOption = { value: "partially_delivered",       label: "Partially Delivered" };
const FULLY_DELIVERED:          StatusOption = { value: "fully_delivered",           label: "Fully Delivered" };

/* ------------------------------------------------------------------ */
/*  Department-specific status lists                                  */
/* ------------------------------------------------------------------ */

/**
 * Sales – sees their own draft/submission flow and the downstream
 * outcomes that matter to them (approved, rejected, delivered, paid…).
 */
export const SALES_ORDER_STATUSES: StatusOption[] = [
  DRAFT,
  SUBMITTED,
  SALES_APPROVED,
  FINANCE_REVIEW,
  PARTIALLY_FINANCE_APPROVED,
  FULLY_FINANCE_APPROVED,
  FINANCE_REJECTED,
  DISPATCH_PENDING,
  DISPATCH_REVIEW,
  PARTIALLY_DISPATCHED,
  FULLY_DISPATCHED,
  PARTIALLY_DELIVERED,
  FULLY_DELIVERED,
  DELIVERED,
  CANCELLED,
  ON_HOLD,
];

/**
 * Admin – has system-wide visibility across the full lifecycle.
 */
export const ADMIN_ORDER_STATUSES: StatusOption[] = [
  DRAFT,
  SUBMITTED,
  SALES_APPROVED,
  FINANCE_REVIEW,
  PARTIALLY_FINANCE_APPROVED,
  FULLY_FINANCE_APPROVED,
  FINANCE_REJECTED,
  DISPATCH_PENDING,
  PARTIAL_DISPATCH_CREATED,
  FULL_DISPATCH_CREATED,
  TRANSPORT_PENDING,
  TRANSPORT_ASSIGNED,
  PARTIALLY_TRANSPORTED,
  FULLY_TRANSPORTED,
  IN_TRANSIT,
  DELIVERED,
  CANCELLED,
  ON_HOLD,
];

/**
 * Finance – focuses on the financial review / approval flow and
 * payment collection stages.
 */
export const FINANCE_ORDER_STATUSES: StatusOption[] = [
  FINANCE_REVIEW,
  PARTIALLY_FINANCE_APPROVED,
  FULLY_FINANCE_APPROVED,
  FINANCE_REJECTED,
  DISPATCH_PENDING,
  DELIVERED,
  CANCELLED,
  ON_HOLD,
];

/**
 * Dispatch – focuses on the fulfilment and logistics stages.
 */
export const DISPATCH_ORDER_STATUSES: StatusOption[] = [
  DISPATCH_PENDING,
  PARTIAL_DISPATCH_CREATED,
  FULL_DISPATCH_CREATED,
  TRANSPORT_PENDING,
  TRANSPORT_ASSIGNED,
  PARTIALLY_TRANSPORTED,
  FULLY_TRANSPORTED,
  IN_TRANSIT,
  DELIVERED,
  CANCELLED,
  ON_HOLD,
];

/**
 * Priority options – shared across all departments.
 */
export const PRIORITY_OPTIONS: StatusOption[] = [
  { value: "low",    label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

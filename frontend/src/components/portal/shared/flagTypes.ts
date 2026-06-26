/**
 * Centralized flag type definitions with two distinct department mappings:
 *
 *  1. ALLOWED_FLAGS_BY_DEPARTMENT — what types a department is allowed to raise.
 *  2. FLAGS_FOR_TARGET_DEPARTMENT — what flag types make sense to raise TO each
 *     target department (i.e., the action/issue you are communicating to them).
 *
 * The form uses FLAGS_FOR_TARGET_DEPARTMENT so the flag type dropdown reflects
 * what is relevant to the selected target, not the raising department.
 */

export interface FlagTypeOption {
  value: string;
  label: string;
}

export const ALL_FLAG_TYPES: Record<string, FlagTypeOption> = {
  urgent: { value: "urgent", label: "Urgent Action Required" },
  payment_issue: { value: "payment_issue", label: "Payment Issue" },
  dispatch_issue: { value: "dispatch_issue", label: "Dispatch Issue" },
  stock_issue: { value: "stock_issue", label: "Stock Issue" },
  customer_issue: { value: "customer_issue", label: "Customer Issue" },
  document_missing: { value: "document_missing", label: "Document Missing" },
  approval_delay: { value: "approval_delay", label: "Approval Delay" },
  vehicle_issue: { value: "vehicle_issue", label: "Vehicle Issue" },
};

/**
 * What flag types each department is permitted to raise.
 * (Raiser-side restriction — reserved for future enforcement.)
 */
export const ALLOWED_FLAGS_BY_DEPARTMENT: Record<string, string[]> = {
  sales: ["urgent", "customer_issue", "document_missing"],
  finance: ["urgent", "payment_issue", "document_missing", "approval_delay"],
  account: ["urgent", "payment_issue", "document_missing", "approval_delay"],
  dispatch: ["urgent", "dispatch_issue", "stock_issue", "vehicle_issue", "document_missing"],
  admin: [
    "urgent",
    "payment_issue",
    "dispatch_issue",
    "stock_issue",
    "customer_issue",
    "document_missing",
    "approval_delay",
  ],
};

/**
 * What flag types are relevant to raise TO each target department.
 *
 * When a user selects a Target Department, only flag types meaningful
 * for that department are shown — representing the action/issue being
 * raised to them.
 *
 * Examples:
 *  → Flagging Finance  : payment issues, approval delays, missing docs
 *  → Flagging Dispatch : dispatch/stock/vehicle issues, missing docs
 *  → Flagging Sales    : customer issues, missing docs
 *  → Flagging Admin    : escalations, approval delays, missing docs
 */
export const FLAGS_FOR_TARGET_DEPARTMENT: Record<string, string[]> = {
  sales: ["urgent", "customer_issue", "document_missing"],
  finance: ["urgent", "payment_issue", "approval_delay", "document_missing"],
  account: ["urgent", "payment_issue", "document_missing"],
  dispatch: ["urgent", "dispatch_issue", "stock_issue", "vehicle_issue", "document_missing"],
  admin: ["urgent", "approval_delay", "document_missing"],
};

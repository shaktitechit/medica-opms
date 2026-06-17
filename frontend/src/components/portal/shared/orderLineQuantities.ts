/** Per-line quantity helpers for sales, finance, and account approval pools. */

export type AccountApprovalStatus = "pending" | "partial" | "full" | "rejected";

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Admin / sales-review approved qty on an order line. */
export function salesApprovedOnLine(line: Record<string, unknown>): number {
  const explicit = num(line.sales_approved_quantity);
  if (explicit > 0) return explicit;
  // Order lines persist admin approval in `approved_quantity` (see backend orderFulfillment.service).
  return num(line.approved_quantity);
}

/** Finance-approved qty on an order line. */
export function financeApprovedOnLine(line: Record<string, unknown>): number {
  return num(line.approved_quantity);
}

/**
 * Account-cleared qty on a line — mirrors finance-approved qty once account has signed off
 * (order-level `account_approval_status` is partial or full).
 */
export function accountClearedOnLine(
  line: Record<string, unknown>,
  accountApprovalStatus: AccountApprovalStatus | string = "pending",
): number {
  const financeApproved = financeApprovedOnLine(line);
  const aas = String(accountApprovalStatus || "pending");
  if (aas === "rejected") return 0;
  if (aas === "full" || aas === "partial") return financeApproved;
  return 0;
}

export type LineApprovalQuantitiesOptions = {
  accountApprovalStatus?: AccountApprovalStatus | string;
};

export function lineApprovalQuantities(
  line: Record<string, unknown>,
  options?: LineApprovalQuantitiesOptions,
) {
  const ordered = num(line.ordered_quantity ?? line.quantity);
  const salesApproved = salesApprovedOnLine(line);
  const financeApproved = financeApprovedOnLine(line);
  const dispatched = num(line.dispatched_quantity);
  const delivered = num(line.delivered_quantity);

  const accountStatus = options?.accountApprovalStatus;
  const accountCleared =
    accountStatus !== undefined
      ? accountClearedOnLine(line, accountStatus)
      : financeApproved;
  const pendingAccount = Math.max(0, financeApproved - accountCleared);
  const dispatchCap = accountCleared;

  return {
    ordered,
    salesApproved,
    financeApproved,
    accountCleared,
    dispatched,
    delivered,
    pendingAdmin: Math.max(0, ordered - salesApproved),
    pendingFinance: Math.max(0, salesApproved - financeApproved),
    pendingAccount,
    pendingDispatch: Math.max(0, dispatchCap - dispatched),
    pendingDelivery: Math.max(0, dispatched - delivered),
  };
}

export function resolveAccountApprovalStatus(
  order?: Record<string, unknown> | null,
  fulfillmentSnapshot?: Record<string, unknown> | null,
): AccountApprovalStatus {
  const raw = String(
    fulfillmentSnapshot?.account_approval_status ?? order?.account_approval_status ?? "pending",
  );
  if (raw === "approved" || raw === "full") return "full";
  if (raw === "partial" || raw === "rejected") return raw;
  return "pending";
}

const ADMIN_APPROVED_ORDER_STATUSES = new Set([
  "approved",
  "full",
  "sales_approved",
  "finance_review",
  "fully_finance_approved",
  "partially_finance_approved",
  "finance_rejected",
  "account_review",
  "fully_account_approved",
  "partially_account_approved",
  "dispatch_pending",
  "partial_dispatch_created",
  "full_dispatch_created",
  "delivered",
]);

/** When line fields lack sales qty, infer from order-level admin sign-off (list rows). */
export function resolveSalesApprovedTotals(
  order: Record<string, unknown>,
  totals: {
    ordered: number;
    salesApproved: number;
    approved: number;
    pendingAdmin: number;
  },
): { salesApproved: number; pendingAdmin: number } {
  if (totals.salesApproved > 0) {
    return { salesApproved: totals.salesApproved, pendingAdmin: totals.pendingAdmin };
  }

  const adminStatus = String(order.admin_approval_status ?? "pending");
  const orderStatus = String(order.status ?? "");
  const passedAdmin =
    adminStatus === "approved" ||
    adminStatus === "full" ||
    ADMIN_APPROVED_ORDER_STATUSES.has(orderStatus);

  if (!passedAdmin) {
    return { salesApproved: totals.salesApproved, pendingAdmin: totals.pendingAdmin };
  }

  const salesApproved = totals.approved > 0 ? totals.approved : totals.ordered;
  return {
    salesApproved,
    pendingAdmin: Math.max(0, totals.ordered - salesApproved),
  };
}

/** Per-line quantity helpers for sales, finance, and account approval pools. */

export type AccountApprovalStatus = "pending" | "partial" | "full" | "rejected";

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id ?? "").trim();
  }
  if (ref && typeof ref === "object" && "id" in ref) {
    return String((ref as { id: unknown }).id ?? "").trim();
  }
  return "";
}

/**
 * Kit product shells are commercial-only — KPI / item qty should not include them.
 * Real item qty lives on individuals and kit bucket rows (`kit_parent_product` set).
 */
export function isKitShellOrderLine(
  line: Record<string, unknown> | null | undefined,
  allLines: Array<Record<string, unknown>> = [],
): boolean {
  if (!line) return false;
  if (idFromRef(line.kit_parent_product)) return false;
  if (String(line.product_type || "").toLowerCase() === "kit") return true;
  const nested = line.product;
  if (
    nested &&
    typeof nested === "object" &&
    String((nested as { product_type?: unknown }).product_type || "").toLowerCase() ===
      "kit"
  ) {
    return true;
  }
  const productId = idFromRef(line.product);
  if (!productId || allLines.length === 0) return false;
  return allLines.some(
    (other) => idFromRef(other.kit_parent_product) === productId,
  );
}

/** Kit bucket lines are fulfillment-only — commercial money lives on the kit shell. */
export function isKitBucketOrderLine(
  line: Record<string, unknown> | null | undefined,
): boolean {
  if (!line) return false;
  return Boolean(idFromRef(line.kit_parent_product));
}

export type OrderCommercialVolumeBasis = "approved" | "dispatched" | "ordered";

/**
 * Line-level commercial volume used by dashboard KPIs / leaderboards.
 * Kit buckets excluded; kit shells included. Does NOT use order.grand_total
 * (avoids GST / header discount / extra-charge drift vs product boards).
 */
export function orderCommercialVolume(
  order: unknown,
  basis: OrderCommercialVolumeBasis = "approved",
): number {
  if (!order || typeof order !== "object") return 0;
  const items = Array.isArray((order as { order_items?: unknown }).order_items)
    ? ((order as { order_items: unknown[] }).order_items as Array<
        Record<string, unknown>
      >)
    : [];

  let sum = 0;
  for (const line of items) {
    if (isKitBucketOrderLine(line)) continue;
    let qty = 0;
    if (basis === "dispatched") {
      const explicit = num(
        line.dispatched_quantity ??
          line.dispatch_quantity ??
          line.billed_dispatched_quantity,
      );
      qty = explicit > 0 ? explicit : num(line.approved_quantity ?? line.ordered_quantity ?? line.quantity);
    } else if (basis === "ordered") {
      qty = num(line.ordered_quantity ?? line.quantity);
    } else {
      qty = num(line.approved_quantity);
    }

    if (qty === 0) continue;
    const unitPrice = num(line.unit_price ?? line.approved_unit_price);
    const gstPct = num(line.gst_percent);
    sum += qty * unitPrice * (1 + gstPct / 100);
  }
  return sum;
}

/** Admin / sales-review approved qty on an order line. */
export function salesApprovedOnLine(line: Record<string, unknown>): number {
  // Live order ledger uses `approved_quantity` after admin approve/amend.
  const approved = num(line.approved_quantity);
  if (approved > 0) return approved;
  const explicit = num(line.sales_approved_quantity);
  if (explicit > 0) return explicit;
  return 0;
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
  "dispatch_created",
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

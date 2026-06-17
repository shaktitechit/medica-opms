import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";

export type SalesOrderTabCategory =
  | "draft"
  | "pending_approval"
  | "open"
  | "closed"
  | "on_hold"
  | "cancelled"
  | "rejected";

export type ApprovalPendingStage = "admin" | "finance" | "account" | null;

export type ApprovalPendingSummary = {
  admin: boolean;
  finance: boolean;
  account: boolean;
  stage: ApprovalPendingStage;
};

/** Order is account/settlement closed (not merely delivered in transit). */
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

  const admin =
    status === "submitted" || adminStatus === "pending" || adminStatus === "partial";
  const finance =
    !admin
    && (status === "finance_review"
      || status === "sales_approved"
      || financeStatus === "pending"
      || financeStatus === "partial");
  const account =
    !admin
    && !finance
    && (status === "account_review"
      || accountStatus === "pending"
      || accountStatus === "partial");

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

/**
 * Sales list tab bucket:
 * - draft — not yet submitted
 * - pending_approval — awaiting admin, finance, or account clearance
 * - open — submitted and still active (not closed / on hold / rejected / cancelled / pending approval)
 * - closed — status closed or closed_at set
 * - on_hold / rejected / cancelled — terminal workflow states
 */
export function getOrderTabCategory(order: unknown): SalesOrderTabCategory {
  if (!order || typeof order !== "object") return "open";
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return "draft";
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";
  if (isOrderClosed(row)) return "closed";
  if (hasAnyPendingApproval(row)) return "pending_approval";

  return "open";
}

export const SALES_ORDER_TABS: ReadonlyArray<{
  id: SalesOrderTabCategory;
  label: string;
}> = [
  { id: "draft", label: "Draft" },
  { id: "pending_approval", label: "Pending Approval" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "on_hold", label: "On Hold" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

export type SalesOrderStats = Record<
  SalesOrderTabCategory,
  { count: number; quantity: number }
>;

export function createEmptySalesOrderStats(): SalesOrderStats {
  return Object.fromEntries(
    SALES_ORDER_TABS.map(({ id }) => [id, { count: 0, quantity: 0 }]),
  ) as SalesOrderStats;
}

/** Aggregate order counts and line quantities by sales tab bucket. */
export function computeSalesOrderStats(orders: unknown[]): SalesOrderStats {
  const stats = createEmptySalesOrderStats();

  for (const order of orders) {
    const cat = getOrderTabCategory(order);
    const row = order as { order_items?: unknown[] };
    const items = Array.isArray(row.order_items) ? row.order_items : [];
    let orderQty = 0;
    for (const item of items) {
      const line = item as { ordered_quantity?: unknown; quantity?: unknown };
      orderQty += Number(line.ordered_quantity ?? line.quantity ?? 0);
    }
    stats[cat].count += 1;
    stats[cat].quantity += orderQty;
  }

  return stats;
}

export function isSalesOrderTabCategory(value: string): value is SalesOrderTabCategory {
  return SALES_ORDER_TABS.some((tab) => tab.id === value);
}

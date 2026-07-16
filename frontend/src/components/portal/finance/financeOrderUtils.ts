import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isOrderClosed,
  resolveApprovalPending,
  type ApprovalPendingStage,
} from "@/components/portal/sales/orderUtils";
import {
  buildPendingReturnOrderIds,
  isTransportOrReturnPending,
  type AccountOrderCategoryOptions,
} from "@/components/portal/account/accountOrderUtils";

export type FinanceOrderTabCategory =
  | "all"
  | "pending_admin_approval"
  | "due_sheet_pending"
  | "pending_finance_approval"
  | "pending_account_approval"
  | "open_dispatched"
  | "transport_return_pending"
  | "closed_delivered"
  | "on_hold"
  | "cancelled"
  | "rejected";

export type FinanceOrderCategoryOptions = AccountOrderCategoryOptions;

export { buildPendingReturnOrderIds };

export const FINANCE_ORDER_TABS: ReadonlyArray<{
  id: FinanceOrderTabCategory;
  label: string;
}> = [
  { id: "all", label: "All Orders" },
  { id: "pending_finance_approval", label: "Finance Pending" },
  { id: "open_dispatched", label: "Open/Dispatch Pending" },
  { id: "transport_return_pending", label: "Transport/Return Pending" },
  { id: "closed_delivered", label: "Closed/Delivered" },
  { id: "on_hold", label: "On Hold" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rejected", label: "Rejected" },
];

export const FINANCE_ORDER_TAB_LABELS: Record<FinanceOrderTabCategory, string> = {
  all: "All Orders",
  pending_admin_approval: "Admin Pending",
  due_sheet_pending: "Due Sheet Pending",
  pending_finance_approval: "Finance Pending",
  pending_account_approval: "Account Pending",
  open_dispatched: "Open/Dispatch Pending",
  transport_return_pending: "Transport/Return Pending",
  closed_delivered: "Closed/Delivered",
  on_hold: "On Hold",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Order is delivered (fulfillment complete) but may not yet be account-closed. */
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

/** Admin cleared but no active due sheet uploaded yet. */
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

/**
 * Finance list tab bucket. Draft orders are excluded (return null).
 * Each non-draft order maps to exactly one primary bucket for badges and stats.
 *
 * Transport/return (dispatch pipeline + pending returns) wins over open/dispatch
 * so those two buckets stay mutually exclusive — same as admin/sales.
 */
export function getFinanceOrderTabCategory(
  order: unknown,
  options?: FinanceOrderCategoryOptions,
): FinanceOrderTabCategory | null {
  if (!order || typeof order !== "object") return null;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;

  // Terminal buckets before transport so on-hold/cancelled/rejected stay put.
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";

  if (isTransportOrReturnPending(order, options)) return "transport_return_pending";
  if (isOrderClosedOrDelivered(row)) return "closed_delivered";

  const pending = resolveApprovalPending(row);
  if (pending.admin) return "pending_admin_approval";
  if (isDueSheetPending(row)) return "due_sheet_pending";
  if (pending.finance) return "pending_finance_approval";
  if (pending.account) return "pending_account_approval";

  return "open_dispatched";
}

/** Whether an order belongs on the given finance list tab. */
export function orderMatchesFinanceTab(
  order: unknown,
  tab: FinanceOrderTabCategory,
  options?: FinanceOrderCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;

  if (tab === "all") {
    return deriveOrderWorkflowStatus(order as Record<string, unknown>) !== "draft";
  }

  // Use the same exclusive primary bucket as badges (incl. open vs transport).
  return getFinanceOrderTabCategory(order, options) === tab;
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

export function isFinanceOrderTabCategory(value: string): value is FinanceOrderTabCategory {
  return FINANCE_ORDER_TABS.some((tab) => tab.id === value);
}

/** Map legacy URL tab ids to the current finance tab set. Defaults to Finance Pending. */
export function normalizeFinanceTabFromUrl(value: string | null): FinanceOrderTabCategory {
  if (!value) return "pending_finance_approval";
  if (value === "pending_finance_review") return "pending_finance_approval";
  if (value === "open") return "open_dispatched";
  if (value === "closed") return "closed_delivered";
  if (value === "pending_approvals") return "all";
  if (
    value === "transport_pending" ||
    value === "returns_pending" ||
    value === "pending_transport" ||
    value === "pending_delivery"
  ) {
    return "transport_return_pending";
  }
  if (isFinanceOrderTabCategory(value)) return value;
  // Removed tabs (e.g. due_sheet_pending) fall back to Finance Pending
  return "pending_finance_approval";
}

export type FinanceOrderStats = Record<
  FinanceOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyFinanceOrderStats(): FinanceOrderStats {
  // Keyed by every category (not just visible tabs) so stats[cat] is always defined
  // even for orders whose category tab isn't rendered on the finance strip.
  return Object.fromEntries(
    Object.keys(FINANCE_ORDER_TAB_LABELS).map((id) => [
      id,
      { count: 0, quantity: 0, amount: 0 },
    ]),
  ) as FinanceOrderStats;
}

export function orderLineQuantity(order: unknown): number {
  const row = order as { order_items?: unknown[] };
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  return items.reduce((sum: number, item) => {
    const line = item as { ordered_quantity?: unknown; quantity?: unknown };
    return sum + Number(line.ordered_quantity ?? line.quantity ?? 0);
  }, 0);
}

function orderAmount(order: unknown): number {
  const row = order as { grand_total?: unknown; total?: unknown };
  return Number(row.grand_total ?? row.total ?? 0);
}

/** Aggregate finance tab counts, quantities, and order value. Skips draft orders. */
export function computeFinanceOrderStats(
  orders: unknown[],
  options?: FinanceOrderCategoryOptions,
): FinanceOrderStats {
  const stats = createEmptyFinanceOrderStats();

  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    const row = order as Record<string, unknown>;
    const status = deriveOrderWorkflowStatus(row);
    if (status === "draft") continue;

    const qty = orderLineQuantity(order);
    const amount = orderAmount(order);

    stats.all.count += 1;
    stats.all.quantity += qty;
    stats.all.amount += amount;

    if (status === "on_hold") {
      stats.on_hold.count += 1;
      stats.on_hold.quantity += qty;
      stats.on_hold.amount += amount;
    }
    if (status === "cancelled") {
      stats.cancelled.count += 1;
      stats.cancelled.quantity += qty;
      stats.cancelled.amount += amount;
    }
    if (status === "finance_rejected") {
      stats.rejected.count += 1;
      stats.rejected.quantity += qty;
      stats.rejected.amount += amount;
    }
    if (orderMatchesFinanceTab(order, "transport_return_pending", options)) {
      stats.transport_return_pending.count += 1;
      stats.transport_return_pending.quantity += qty;
      stats.transport_return_pending.amount += amount;
    }
    if (isOrderClosedOrDelivered(row)) {
      stats.closed_delivered.count += 1;
      stats.closed_delivered.quantity += qty;
      stats.closed_delivered.amount += amount;
    }

    const isPipelineActive =
      status !== "on_hold" &&
      status !== "cancelled" &&
      status !== "finance_rejected" &&
      !isOrderClosedOrDelivered(row) &&
      !isTransportOrReturnPending(order, options);

    const pending = resolveApprovalPending(row);
    if (isPipelineActive && pending.admin) {
      stats.pending_admin_approval.count += 1;
      stats.pending_admin_approval.quantity += qty;
      stats.pending_admin_approval.amount += amount;
    }
    if (isPipelineActive && isDueSheetPending(row)) {
      stats.due_sheet_pending.count += 1;
      stats.due_sheet_pending.quantity += qty;
      stats.due_sheet_pending.amount += amount;
    }
    if (isPipelineActive && pending.finance) {
      stats.pending_finance_approval.count += 1;
      stats.pending_finance_approval.quantity += qty;
      stats.pending_finance_approval.amount += amount;
    }
    if (isPipelineActive && pending.account) {
      stats.pending_account_approval.count += 1;
      stats.pending_account_approval.quantity += qty;
      stats.pending_account_approval.amount += amount;
    }
    // Match list/tab logic — not legacy status === "open" (derive rarely returns that).
    if (orderMatchesFinanceTab(order, "open_dispatched", options)) {
      stats.open_dispatched.count += 1;
      stats.open_dispatched.quantity += qty;
      stats.open_dispatched.amount += amount;
    }
  }

  return stats;
}

export const FINANCE_STATUS_COLORS: Record<
  FinanceOrderTabCategory,
  { fill: string; hover: string; dot: string; label: string }
> = {
  all: {
    fill: "fill-slate-500/85 dark:fill-slate-500/60",
    hover: "fill-slate-600 dark:fill-slate-400",
    dot: "bg-slate-500 dark:bg-slate-400",
    label: "All Orders",
  },
  pending_admin_approval: {
    fill: "fill-indigo-500/85 dark:fill-indigo-500/60",
    hover: "fill-indigo-600 dark:fill-indigo-400",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    label: "Admin Pending",
  },
  due_sheet_pending: {
    fill: "fill-orange-500/85 dark:fill-orange-500/60",
    hover: "fill-orange-600 dark:fill-orange-400",
    dot: "bg-orange-500 dark:bg-orange-400",
    label: "Due Sheet Pending",
  },
  pending_finance_approval: {
    fill: "fill-purple-500/85 dark:fill-purple-500/60",
    hover: "fill-purple-600 dark:fill-purple-400",
    dot: "bg-purple-500 dark:bg-purple-400",
    label: "Finance Pending",
  },
  pending_account_approval: {
    fill: "fill-violet-500/85 dark:fill-violet-500/60",
    hover: "fill-violet-600 dark:fill-violet-400",
    dot: "bg-violet-500 dark:bg-violet-400",
    label: "Account Pending",
  },
  open_dispatched: {
    fill: "fill-teal-500/85 dark:fill-teal-500/60",
    hover: "fill-teal-600 dark:fill-teal-400",
    dot: "bg-teal-500 dark:bg-teal-400",
    label: "Open/Dispatch Pending",
  },
  transport_return_pending: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Transport/Return Pending",
  },
  closed_delivered: {
    fill: "fill-emerald-500/85 dark:fill-emerald-550/60",
    hover: "fill-emerald-600 dark:fill-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-450",
    label: "Closed/Delivered",
  },
  on_hold: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-450",
    label: "On Hold",
  },
  rejected: {
    fill: "fill-red-500/85 dark:fill-red-550/60",
    hover: "fill-red-600 dark:fill-red-400",
    dot: "bg-red-500 dark:bg-red-450",
    label: "Rejected",
  },
  cancelled: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-450",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Cancelled",
  },
};

/** Tabs shown in overview charts (excludes the catch-all "all" bucket). */
export const FINANCE_CHART_TABS = FINANCE_ORDER_TABS.filter((tab) => tab.id !== "all");

export type FinanceChartBreakdown = FinanceOrderStats;

export function createEmptyFinanceChartBreakdown(): FinanceChartBreakdown {
  return createEmptyFinanceOrderStats();
}

export function categorizeOrderForFinanceChart(
  order: unknown,
  options?: FinanceOrderCategoryOptions,
): FinanceOrderTabCategory | null {
  const cat = getFinanceOrderTabCategory(order, options);
  return cat === "all" ? null : cat;
}

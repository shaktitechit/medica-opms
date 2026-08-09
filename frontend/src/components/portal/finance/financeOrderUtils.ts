import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isDueSheetPending,
  isOrderClosed,
  isOrderClosedOrDelivered,
  isOrderDelivered,
  pendingApprovalStageLabel,
  resolveApprovalPending,
  normalizeWorkflowTabFromUrl,
  ORDER_WORKFLOW_TAB_LABELS,
  type OrderWorkflowTabCategory,
  isTransportPending,
  isReturnPendingOrder,
  type OrderWorkflowCategoryOptions,
  getOrderWorkflowTabCategory,
  orderMatchesWorkflowTab,
  workflowTabQueryParams,
  ORDER_WORKFLOW_TABS,
  computeOrderWorkflowTabStats,
  createEmptyOrderWorkflowTabStats,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import {
  buildPendingReturnOrderIds,
} from "@/components/portal/account/accountOrderUtils";

export type FinanceOrderTabCategory = OrderWorkflowTabCategory;

export type FinanceOrderCategoryOptions = OrderWorkflowCategoryOptions;

export { buildPendingReturnOrderIds };
export {
  isDueSheetPending,
  isOrderClosed,
  isOrderClosedOrDelivered,
  isOrderDelivered,
  pendingApprovalStageLabel,
};

export const FINANCE_ORDER_TABS = ORDER_WORKFLOW_TABS;

export const FINANCE_ORDER_TAB_LABELS = ORDER_WORKFLOW_TAB_LABELS;

/**
 * Finance list tab bucket. Draft orders are excluded (return null).
 * Priority: terminal → return → transport → closed → approvals → dispatch pending.
 * Unbilled orders are outside workflow tabs (see UnbilledOrdersModal).
 */
export function getFinanceOrderTabCategory(
  order: unknown,
  options?: FinanceOrderCategoryOptions,
): FinanceOrderTabCategory | null {
  return getOrderWorkflowTabCategory(order, options);
}

/** Whether an order belongs on the given finance list tab. */
export function orderMatchesFinanceTab(
  order: unknown,
  tab: FinanceOrderTabCategory,
  options?: FinanceOrderCategoryOptions,
): boolean {
  return orderMatchesWorkflowTab(order, tab, options);
}

export function isFinanceOrderTabCategory(value: string): value is FinanceOrderTabCategory {
  return ORDER_WORKFLOW_TABS.some((tab) => tab.id === value);
}

/** API query for a finance list tab. Client exclusive filter decides membership. */
export function financeTabQueryParams(
  tab: FinanceOrderTabCategory,
): Record<string, string | undefined> {
  return workflowTabQueryParams(tab);
}

/** Map legacy URL tab ids to the current finance tab set. Defaults to Finance Pending. */
export function normalizeFinanceTabFromUrl(value: string | null): FinanceOrderTabCategory {
  if (!value) return "pending_finance_approval";
  if (value === "pending_finance_review") return "pending_finance_approval";
  if (value === "pending_account_review") return "pending_account_approval";
  if (value === "open") return "open_dispatched";
  if (value === "dispatch_pending") return "open_dispatched";
  if (value === "closed") return "closed_delivered";
  if (value === "pending_approvals") return "all";
  if (value === "transport_return_pending" || value === "pending_transport" || value === "pending_delivery") {
    return "transport_pending";
  }
  if (value === "returns_pending" || value === "return_pending") return "all";
  if (isFinanceOrderTabCategory(value)) return value;
  return "pending_finance_approval";
}


export type FinanceOrderStats = Record<
  FinanceOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyFinanceOrderStats(): FinanceOrderStats {
  return createEmptyOrderWorkflowTabStats();
}

export function orderLineQuantity(order: unknown): number {
  const row = order as { order_items?: unknown[] };
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  const status = deriveOrderWorkflowStatus(row);
  const isApproved =
    status !== "draft" &&
    status !== "submitted" &&
    status !== "cancelled" &&
    status !== "finance_rejected" &&
    status !== "rejected" &&
    status !== "on_hold";

  return items.reduce((sum: number, item) => {
    const line = item as { ordered_quantity?: unknown; quantity?: unknown; approved_quantity?: unknown };
    const q = isApproved ? Number(line.approved_quantity ?? 0) : Number(line.ordered_quantity ?? line.quantity ?? 0);
    return sum + q;
  }, 0);
}

/** Aggregate finance tab counts — same exclusive buckets as list / Quick Access. */
export function computeFinanceOrderStats(
  orders: unknown[],
  options?: FinanceOrderCategoryOptions,
): FinanceOrderStats {
  return computeOrderWorkflowTabStats(orders, options);
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
    label: "Dispatch Pending",
  },
  transport_pending: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Transport Pending",
  },
  in_transit: {
    fill: "fill-sky-500/85 dark:fill-sky-500/60",
    hover: "fill-sky-600 dark:fill-sky-400",
    dot: "bg-sky-500 dark:bg-sky-400",
    label: "In Transit",
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
  cancelled: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-450",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Cancelled",
  },
  rejected: {
    fill: "fill-red-500/85 dark:fill-red-550/60",
    hover: "fill-red-600 dark:fill-red-400",
    dot: "bg-red-500 dark:bg-red-450",
    label: "Rejected",
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

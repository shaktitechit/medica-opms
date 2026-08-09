import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isDueSheetPending,
  isOrderClosedOrDelivered,
  isOrderDelivered,
  normalizeWorkflowTabFromUrl,
  ORDER_WORKFLOW_TAB_LABELS,
  pendingApprovalStageLabel,
  resolveApprovalPending,
  type ApprovalPendingStage,
  type OrderWorkflowTabCategory,
  isTransportPending,
  isInTransitOrder,
  isReturnPendingOrder,
  type OrderWorkflowCategoryOptions,
  getOrderWorkflowTabCategory,
  orderMatchesWorkflowTab,
  workflowTabQueryParams,
  ORDER_WORKFLOW_TABS,
  computeOrderWorkflowTabStats,
  createEmptyOrderWorkflowTabStats,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import { isReturnPending } from "@/constants/orderReturnStatus";

function refId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}


export { pendingApprovalStageLabel };
export type { ApprovalPendingStage };
/** Compatibility re-export — unbilled orders live outside workflow tabs. */
export { isUnbilledOrder } from "@/components/portal/shared/orderList/unbilledOrders";

export type AccountOrderTabCategory = OrderWorkflowTabCategory;

export const ACCOUNT_ORDER_TABS = ORDER_WORKFLOW_TABS;

export const ACCOUNT_ORDER_TAB_LABELS = ORDER_WORKFLOW_TAB_LABELS;

export { isDueSheetPending };

export type AccountOrderCategoryOptions = OrderWorkflowCategoryOptions;

export { isTransportPending, isInTransitOrder, isReturnPendingOrder };

/** @deprecated Prefer isTransportPending / isInTransitOrder / isReturnPendingOrder. */
export function isTransportOrReturnPending(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): boolean {
  return (
    isReturnPendingOrder(order, options) ||
    isInTransitOrder(order, options) ||
    isTransportPending(order, options)
  );
}

/**
 * Account list tab bucket. Draft orders are excluded (return null).
 * Priority: terminal → return → transport → closed → approvals → dispatch pending.
 * Unbilled orders are outside workflow tabs (see UnbilledOrdersModal).
 */
export function getAccountOrderTabCategory(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): AccountOrderTabCategory | null {
  return getOrderWorkflowTabCategory(order, options);
}

/** Whether an order belongs on the given account list tab. */
export function orderMatchesAccountTab(
  order: unknown,
  tab: AccountOrderTabCategory,
  options?: AccountOrderCategoryOptions,
): boolean {
  return orderMatchesWorkflowTab(order, tab, options);
}

export function accountTabQueryParams(
  tab: AccountOrderTabCategory,
): Record<string, string | undefined> {
  return workflowTabQueryParams(tab);
}

/** Build a set of order ids that still have pending warehouse returns. */
export function buildPendingReturnOrderIds(returns: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const raw of returns) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!isReturnPending(row.return_status)) continue;
    const orderId = refId(row.order);
    if (orderId) ids.add(orderId);
  }
  return ids;
}

/** Group return records by parent order id. */
export function groupReturnsByOrderId(returns: unknown[]): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const raw of returns) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const orderId = refId(row.order);
    if (!orderId) continue;
    const list = map.get(orderId) ?? [];
    list.push(row);
    map.set(orderId, list);
  }
  return map;
}

export function isAccountOrderTabCategory(value: string): value is AccountOrderTabCategory {
  return ACCOUNT_ORDER_TABS.some((tab) => tab.id === value);
}

export function normalizeAccountTabFromUrl(value: string | null): AccountOrderTabCategory {
  if (!value) return "pending_account_approval";
  if (value === "transport_return_pending" || value === "pending_transport" || value === "pending_delivery") {
    return "transport_pending";
  }
  if (value === "returns_pending" || value === "return_pending") return "all";
  if (value === "dispatch_pending") return "open_dispatched";
  if (isAccountOrderTabCategory(value)) return value;
  const normalized = normalizeWorkflowTabFromUrl(value, "all");
  return isAccountOrderTabCategory(normalized) ? normalized : "pending_account_approval";
}

export type AccountOrderStats = Record<
  AccountOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyAccountOrderStats(): AccountOrderStats {
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

export function computeAccountOrderStats(
  orders: unknown[],
  options?: AccountOrderCategoryOptions,
): AccountOrderStats {
  return computeOrderWorkflowTabStats(orders, options);
}

export const ACCOUNT_STATUS_COLORS: Record<
  AccountOrderTabCategory,
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

export const ACCOUNT_CHART_TABS = ACCOUNT_ORDER_TABS.filter((tab) => tab.id !== "all");

export type AccountChartBreakdown = AccountOrderStats;

export function createEmptyAccountChartBreakdown(): AccountChartBreakdown {
  return createEmptyAccountOrderStats();
}

export function categorizeOrderForAccountChart(
  order: unknown,
  options?: AccountOrderCategoryOptions,
): AccountOrderTabCategory | null {
  return getAccountOrderTabCategory(order, options);
}

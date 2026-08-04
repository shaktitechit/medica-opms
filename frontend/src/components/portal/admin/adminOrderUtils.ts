import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  isDueSheetPending,
  isOrderClosedOrDelivered,
  isOrderDelivered,
  normalizeWorkflowTabFromUrl,
  ORDER_WORKFLOW_TAB_LABELS,
  resolveApprovalPending,
  type OrderWorkflowTabCategory,
  isTransportPending,
  isReturnPendingOrder,
  type OrderWorkflowCategoryOptions,
  getOrderWorkflowTabCategory,
  orderMatchesWorkflowTab,
  workflowTabQueryParams,
  ORDER_WORKFLOW_TABS,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import {
  type ApprovalPendingStage,
} from "@/components/portal/sales/orderUtils";
import {
  buildPendingReturnOrderIds,
} from "@/components/portal/account/accountOrderUtils";

export type AdminOrderTabCategory = OrderWorkflowTabCategory;

export type AdminOrderCategoryOptions = OrderWorkflowCategoryOptions;

export { buildPendingReturnOrderIds };

export const ADMIN_ORDER_TABS = ORDER_WORKFLOW_TABS;

export const ADMIN_ORDER_TAB_LABELS = ORDER_WORKFLOW_TAB_LABELS;

export {
  isDueSheetPending,
  isOrderClosedOrDelivered,
  isOrderDelivered,
};

/**
 * Admin list tab bucket. Draft orders are excluded (return null).
 * Same exclusive priority as account/finance/dispatch/sales:
 * terminal → return → transport → closed → approvals → dispatch pending.
 * Unbilled orders are outside workflow tabs (see UnbilledOrdersModal).
 */
export function getAdminOrderTabCategory(
  order: unknown,
  options?: AdminOrderCategoryOptions,
): AdminOrderTabCategory | null {
  return getOrderWorkflowTabCategory(order, options);
}

export function orderMatchesAdminTab(
  order: unknown,
  tab: AdminOrderTabCategory,
  options?: AdminOrderCategoryOptions,
): boolean {
  return orderMatchesWorkflowTab(order, tab, options);
}

export function adminTabQueryParams(
  tab: AdminOrderTabCategory,
): Record<string, string | undefined> {
  return workflowTabQueryParams(tab);
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

export function isAdminOrderTabCategory(value: string): value is AdminOrderTabCategory {
  return ORDER_WORKFLOW_TABS.some((tab) => tab.id === value);
}

export function normalizeAdminTabFromUrl(value: string | null): AdminOrderTabCategory {
  if (!value) return "pending_admin_approval";
  if (value === "transport_return_pending" || value === "pending_transport" || value === "pending_delivery") {
    return "transport_pending";
  }
  if (value === "returns_pending") return "return_pending";
  if (value === "dispatch_pending") return "open_dispatched";
  if (isAdminOrderTabCategory(value)) return value;
  const normalized = normalizeWorkflowTabFromUrl(value, "all");
  return isAdminOrderTabCategory(normalized) ? normalized : "pending_admin_approval";
}


export type AdminOrderStats = Record<
  AdminOrderTabCategory,
  { count: number; quantity: number; amount: number }
>;

export function createEmptyAdminOrderStats(): AdminOrderStats {
  return Object.fromEntries(
    Object.keys(ADMIN_ORDER_TAB_LABELS).map((id) => [
      id,
      { count: 0, quantity: 0, amount: 0 },
    ]),
  ) as AdminOrderStats;
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

function orderAmount(order: unknown): number {
  const row = order as { grand_total?: unknown; total?: unknown };
  return Number(row.grand_total ?? row.total ?? 0);
}

export function computeAdminOrderStats(
  orders: unknown[],
  options?: AdminOrderCategoryOptions,
): AdminOrderStats {
  const stats = createEmptyAdminOrderStats();

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

    const cat = getAdminOrderTabCategory(order, options);
    if (!cat || cat === "all") continue;

    stats[cat].count += 1;
    stats[cat].quantity += qty;
    stats[cat].amount += amount;
  }

  return stats;
}

export const ADMIN_STATUS_COLORS: Record<
  AdminOrderTabCategory,
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
  return_pending: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-400",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Return Pending",
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

export const ADMIN_CHART_TABS = ADMIN_ORDER_TABS.filter((tab) => tab.id !== "all");

export type AdminChartBreakdown = AdminOrderStats;

export function createEmptyAdminChartBreakdown(): AdminChartBreakdown {
  return createEmptyAdminOrderStats();
}

export function categorizeOrderForAdminChart(
  order: unknown,
  options?: AdminOrderCategoryOptions,
): AdminOrderTabCategory | null {
  return getAdminOrderTabCategory(order, options);
}
